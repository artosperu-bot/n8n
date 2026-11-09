import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { ProductQuote } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Options = {
  url: string;
  key: string;
  fetcher?: typeof fetch;
  cacheTtlMs?: number;
  maxFreshnessHours?: number;
  now?: () => Date;
};

type ArmProduct = {
  partnumber: string;
  title: string;
  brand: string | null;
  price_pen: number | string | null;
  stock_erp: number | null;
  verified_at: string | null;
};
type ArmChannelOffer = {
  partnumber: string;
  channel_code: string;
  price_pen: number | string | null;
  list_price_pen: number | string | null;
  stock_publicado: number | null;
  active: boolean;
  is_published: boolean;
  source_sync_at: string;
};
type CatalogProduct = {
  producto_id: string;
  producto_codigo: string | null;
  nombre: string;
  nombre_corto: string | null;
  sku: string | null;
  ean: string | null;
  part_number: string | null;
  activo: boolean;
  categoria_id: string | null;
  subcategoria_id: string | null;
};

function key(value: string | null | undefined): string {
  return fold(String(value ?? '')).replace(/[^a-z0-9]/g, '');
}
function finitePositive(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function nonnegativeStock(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Read-only materialized CRM catalog. Never uses the SQL Bridge or invents
 * prices/available stock from physical observations or distributor costs.
 * Commercial fields are exposed only if their shared verified_at is recent.
 */
export class SupabaseErpRepository implements ErpRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #fetcher: typeof fetch;
  readonly #ttlMs: number;
  readonly #maxFreshnessMs: number;
  readonly #now: () => Date;
  #cache: ProductQuote[] | null = null;
  #cachedAt = 0;
  #pending: Promise<ProductQuote[]> | null = null;

  constructor(options: Options) {
    this.#url = options.url.replace(/\/$/, '');
    this.#key = options.key;
    this.#fetcher = options.fetcher ?? fetch;
    this.#ttlMs = options.cacheTtlMs ?? 30_000;
    this.#maxFreshnessMs = (options.maxFreshnessHours ?? 48) * 3_600_000;
    this.#now = options.now ?? (() => new Date());
  }

  async #getRows<T>(table: string, select: string): Promise<T[]> {
    const pageSize = 1000;
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const u = new URL(`${this.#url}/rest/v1/${table}`);
      u.searchParams.set('select', select);
      u.searchParams.set('limit', String(pageSize));
      u.searchParams.set('offset', String(offset));
      if (table === 'catalogo_productos') u.searchParams.set('activo', 'eq.true');
      if (table === 'arm_channel_offers') {
        u.searchParams.set('channel_code', 'eq.WEB_STECH');
      }
      if (table === 'v_ia_producto_capacidades') u.searchParams.set('seccion','eq.TERMICA');
      const response = await this.#fetcher(u, {
        headers: { apikey: this.#key, authorization: `Bearer ${this.#key}` },
      });
      if (!response.ok) throw new Error(`Supabase commercial catalog ${table} HTTP ${response.status}`);
      const page = await response.json();
      if (!Array.isArray(page)) throw new Error(`Invalid Supabase catalog response: ${table}`);
      rows.push(...page as T[]);
      if (page.length < pageSize) break;
    }
    return rows;
  }

  async #load(): Promise<ProductQuote[]> {
    const now = this.#now().getTime();
    if (this.#cache && now - this.#cachedAt < this.#ttlMs) return this.#cache;
    if (this.#pending) return this.#pending;
    this.#pending = (async () => {
      const [products, catalog, offers] = await Promise.all([
        this.#getRows<ArmProduct>('arm_products', 'partnumber,title,brand,price_pen,stock_erp,verified_at'),
        this.#getRows<CatalogProduct>('catalogo_productos', 'producto_id,producto_codigo,nombre,nombre_corto,sku,ean,part_number,activo,categoria_id,subcategoria_id'),
        this.#getRows<ArmChannelOffer>('arm_channel_offers', 'partnumber,channel_code,price_pen,list_price_pen,stock_publicado,active,is_published,source_sync_at'),
      ]);
      const byPn = new Map(catalog.filter(p => p.activo).map(p => [key(p.part_number ?? p.sku), p]));
      const byOffer = new Map(offers.filter(p => p.channel_code === 'WEB_STECH').map(p => [key(p.partnumber), p]));
      const mapped = products.flatMap((p): ProductQuote[] => {
        const canonical = byPn.get(key(p.partnumber));
        // Do not sell unmapped/disabled products.
        if (!canonical) return [];
        const offer = byOffer.get(key(p.partnumber));
        const offerMs = offer?.source_sync_at ? Date.parse(offer.source_sync_at) : NaN;
        const offerFresh = Boolean(offer?.active && offer?.is_published) && Number.isFinite(offerMs) && offerMs <= now && now - offerMs <= this.#maxFreshnessMs;
        const verifiedMs = p.verified_at ? Date.parse(p.verified_at) : NaN;
        const fresh = Number.isFinite(verifiedMs) && verifiedMs <= now && now - verifiedMs <= this.#maxFreshnessMs;
        return [{
          product: canonical.nombre || p.title,
          shortName: canonical.nombre_corto || p.title,
          productCode: canonical.producto_codigo,
          productRagId: canonical.producto_id,
          sku: canonical.sku,
          partNumber: canonical.part_number || p.partnumber,
          ean: canonical.ean,
          price: offer ? (offerFresh ? finitePositive(offer.price_pen) : null) : fresh ? finitePositive(p.price_pen) : null,
          stock: offer ? (offerFresh ? nonnegativeStock(offer.stock_publicado) : null) : fresh ? nonnegativeStock(p.stock_erp) : null,
          currency: 'PEN',
          categoryCode: canonical.categoria_id,
          subcategoryCode: canonical.subcategoria_id,
          source: 'SUPABASE',
        }];
      });
      this.#cache = mapped;
      this.#cachedAt = this.#now().getTime();
      return mapped;
    })();
    try { return await this.#pending; }
    finally { this.#pending = null; }
  }

  async findProductsWithVerifiedFeature(feature:'TERMICA'):Promise<ProductQuote[]> {
    if (feature !== 'TERMICA') return [];
    const rows=await this.#getRows<{producto_id:string;seccion:string;content:string}>(
      'v_ia_producto_capacidades','producto_id,seccion,content'
    );
    const verified=new Set(rows.filter(row=>
      row.seccion==='TERMICA' && /\bcamara termica\s*:\s*si\b/.test(fold(row.content))
    ).map(row=>row.producto_id));
    return (await this.#load()).filter(q=>Boolean(q.productRagId && verified.has(q.productRagId)));
  }

  async listCatalog(filters: { categoryCode?: string | null; subcategoryCode?: string | null; onlyWithStock?: boolean } = {}): Promise<ProductQuote[]> {
    return (await this.#load()).filter(p =>
      p.price != null && // Only verified, published commercial offers enter recommendations.
      (!filters.categoryCode || p.categoryCode === filters.categoryCode) &&
      (!filters.subcategoryCode || p.subcategoryCode === filters.subcategoryCode) &&
      (!filters.onlyWithStock || (p.stock != null && p.stock > 0))
    );
  }

  async searchProducts(text: string, maxResults = 20): Promise<ProductQuote[]> {
    const q = key(text);
    if (!q) return [];
    const ranked = (await this.#load()).map(p => {
      const partNumber = key(p.partNumber);
      const shortName = key(p.shortName);
      const fullName = key(p.product);
      const familyModel = shortName.replace(/^armor/,'');
      let score = 0;
      if (partNumber.length >= 5 && q.includes(partNumber)) score = 110;
      if (shortName.length >= 5 && q.includes(shortName)) score = Math.max(score, 100);
      if (fullName.length >= 5 && q.includes(fullName)) score = Math.max(score, 90);
      if (familyModel.length >= 4 && /\d/.test(familyModel) && q.includes(familyModel)) score = Math.max(score, 85);
      if (q === partNumber || q === shortName || q === fullName) score += 30;
      return { product: p, score };
    }).filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score || a.product.product.localeCompare(b.product.product));
    return ranked.slice(0, Math.max(1, Math.min(50, Math.trunc(maxResults || 20)))).map(row => row.product);
  }

  async getProductQuote(product: string): Promise<ProductQuote | null> {
    return (await this.searchProducts(product, 1))[0] ?? null;
  }

  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    return (await this.#load())
      .filter(p => p.price != null && p.price <= maxBudget && p.stock != null && p.stock > 0)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }
}

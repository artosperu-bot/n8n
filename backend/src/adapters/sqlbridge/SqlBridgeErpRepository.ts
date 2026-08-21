import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { ProductImage, ProductQuote } from '../../domain/types.ts';

type Options = {
  url: string;
  token?: string;
  catalogProcedure: string;
  fetcher?: typeof fetch;
};

export class SqlBridgeErpRepository implements ErpRepository {
  readonly #url: string;
  readonly #token?: string;
  readonly #catalogProcedure: string;
  readonly #fetcher: typeof fetch;

  constructor(options: Options) {
    this.#url = options.url;
    this.#token = options.token;
    this.#catalogProcedure = options.catalogProcedure;
    this.#fetcher = options.fetcher ?? fetch;
  }

  #escape(value: string): string { return value.replace(/'/g, "''"); }

  async #call(query: string): Promise<any[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;
    const response = await this.#fetcher(this.#url, { method: 'POST', headers, body: JSON.stringify({ query }) });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SQL bridge HTTP ${response.status}: ${raw?.error ?? 'UNKNOWN_ERROR'}`);
    if (raw?.ok === false) throw new Error(`SQL bridge: ${raw?.error ?? 'UNKNOWN_ERROR'}`);
    return Array.isArray(raw?.rows) ? raw.rows : [];
  }

  #map(raw: any): ProductQuote | null {
    if (!raw) return null;
    const product = String(raw.product ?? raw.producto ?? raw.nombre ?? raw.nombre_corto ?? '').trim();
    if (!product) return null;
    return {
      product,
      productCode: raw.productCode ?? raw.producto_codigo ?? raw.codigo ?? null,
      price: raw.price == null && raw.precio == null ? null : Number(raw.price ?? raw.precio),
      stock: raw.stock == null ? null : Number(raw.stock),
      currency: String(raw.currency ?? raw.moneda ?? 'PEN'),
      source: 'SQL_BRIDGE',
    };
  }

  async getProductQuote(product: string): Promise<ProductQuote | null> {
    const query = `EXEC ${this.#catalogProcedure} @TextoBusqueda=N'${this.#escape(product)}', @CategoriaCodigo=NULL, @SubcategoriaCodigo=NULL, @SoloConStock=0, @MaxResultados=20;`;
    const rows = await this.#call(query);
    return this.#map(rows[0]);
  }

  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    const query = `EXEC ${this.#catalogProcedure} @TextoBusqueda=NULL, @CategoriaCodigo=NULL, @SubcategoriaCodigo=NULL, @SoloConStock=0, @MaxResultados=100;`;
    const rows = await this.#call(query);
    return rows
      .map((row: any) => this.#map(row))
      .filter((row: ProductQuote | null): row is ProductQuote => row !== null && row.price != null && row.price <= maxBudget)
      .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
  }

  async getProductImages(product: string, maxImages = 10): Promise<ProductImage[]> {
    const limit = Math.max(1, Math.min(20, Math.trunc(maxImages || 10)));
    const query = `EXEC dbo.sp_BuscarImagenesProductoVenta @TextoBusqueda=N'${this.#escape(product)}', @MaxImagenes=${limit};`;
    const rows = await this.#call(query);
    const seen = new Set<string>();
    const out: ProductImage[] = [];
    for (const row of rows) {
      const url = String(row.url_imagen ?? row.url ?? '').trim();
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, type: row.tipo_imagen ?? row.tipo ?? null, source: 'SQL_BRIDGE' });
    }
    return out;
  }
}

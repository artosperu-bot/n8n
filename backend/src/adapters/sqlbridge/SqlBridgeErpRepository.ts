import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { ProductQuote } from '../../domain/types.ts';

type Options = { url: string; token?: string; quoteAction: string; budgetAction: string; fetcher?: typeof fetch };

export class SqlBridgeErpRepository implements ErpRepository {
  readonly #url: string;
  readonly #token?: string;
  readonly #quoteAction: string;
  readonly #budgetAction: string;
  readonly #fetcher: typeof fetch;
  constructor(options: Options) {
    this.#url = options.url; this.#token = options.token; this.#quoteAction = options.quoteAction; this.#budgetAction = options.budgetAction; this.#fetcher = options.fetcher ?? fetch;
  }
  async #call(action: string, payload: Record<string, unknown>): Promise<any> {
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;
    const response = await this.#fetcher(this.#url, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
    if (!response.ok) throw new Error(`SQL bridge HTTP ${response.status}`);
    return response.json();
  }
  #map(raw: any): ProductQuote | null {
    if (!raw) return null;
    return {
      product: String(raw.product ?? raw.producto ?? raw.nombre ?? ''),
      productCode: raw.productCode ?? raw.producto_codigo ?? raw.codigo ?? null,
      price: raw.price == null && raw.precio == null ? null : Number(raw.price ?? raw.precio),
      stock: raw.stock == null ? null : Number(raw.stock),
      currency: String(raw.currency ?? raw.moneda ?? 'PEN'),
      source: 'SQL_BRIDGE'
    };
  }
  async getProductQuote(product: string): Promise<ProductQuote | null> { return this.#map(await this.#call(this.#quoteAction, { product })); }
  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    const raw = await this.#call(this.#budgetAction, { maxBudget });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return rows.map((r: any) => this.#map(r)).filter((q: ProductQuote | null): q is ProductQuote => q != null);
  }
}

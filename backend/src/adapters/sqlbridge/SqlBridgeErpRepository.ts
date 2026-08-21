import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { CatalogResolution, CategoryOption, OrderLookup, ProductImage, ProductQuote, SubcategoryOption } from '../../domain/types.ts';

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
  #nullableLiteral(value?: string | null): string {
    const clean = String(value ?? '').trim();
    return clean ? `'${this.#escape(clean)}'` : 'NULL';
  }

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
    const numberOrNull = (value: any): number | null => value == null || value === '' ? null : Number(value);
    return {
      product,
      productCode: raw.productCode ?? raw.producto_codigo ?? raw.codigo ?? null,
      productRagId: raw.productRagId ?? raw.producto_rag_id ?? null,
      internalId: numberOrNull(raw.producto_id_interno ?? raw.id),
      sku: raw.sku ?? null,
      partNumber: raw.part_number ?? null,
      ean: raw.ean ?? null,
      price: numberOrNull(raw.price ?? raw.precio),
      stock: numberOrNull(raw.stock),
      currency: String(raw.currency ?? raw.moneda ?? 'PEN'),
      categoryCode: raw.categoria_codigo ?? null,
      category: raw.categoria ?? null,
      subcategoryCode: raw.subcategoria_codigo ?? null,
      subcategory: raw.subcategoria ?? null,
      warrantyMonths: numberOrNull(raw.garantia_meses),
      commercialState: raw.estado_comercial ?? null,
      source: 'SQL_BRIDGE',
    };
  }

  async getProductQuote(product: string): Promise<ProductQuote | null> {
    const query = `EXEC ${this.#catalogProcedure} @TextoBusqueda=N'${this.#escape(product)}', @CategoriaCodigo=NULL, @SubcategoriaCodigo=NULL, @SoloConStock=0, @MaxResultados=20;`;
    const rows = await this.#call(query);
    return this.#map(rows[0]);
  }

  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    const rows = await this.listCatalog({});
    return rows
      .filter(row => row.price != null && row.price <= maxBudget)
      .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
  }

  async getProductImages(product: string, maxImages = 10): Promise<ProductImage[]> {
    const limit = Math.max(1, Math.min(20, Math.trunc(maxImages || 10)));
    const rows = await this.#call(`EXEC dbo.sp_BuscarImagenesProductoVenta @TextoBusqueda=N'${this.#escape(product)}', @MaxImagenes=${limit};`);
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

  async resolveCatalogContext(text: string): Promise<CatalogResolution[]> {
    return this.#call(`EXEC dbo.sp_ResolverContextoCatalogoVenta @TextoBusqueda=N'${this.#escape(text)}';`);
  }

  async listCatalog(filters: { categoryCode?: string | null; subcategoryCode?: string | null; onlyWithStock?: boolean } = {}): Promise<ProductQuote[]> {
    const query = `EXEC dbo.sp_ListarCatalogoVenta @CategoriaCodigo=${this.#nullableLiteral(filters.categoryCode)}, @SubcategoriaCodigo=${this.#nullableLiteral(filters.subcategoryCode)}, @SoloConStock=${filters.onlyWithStock ? 1 : 0}, @SoloActivos=1;`;
    return (await this.#call(query)).map(row => this.#map(row)).filter((row): row is ProductQuote => row !== null);
  }

  async listCategories(): Promise<CategoryOption[]> {
    const rows = await this.#call('EXEC dbo.sp_ListarCategoriasVenta @SoloActivas=1;');
    return rows
      .map(row => ({ code: String(row.categoria_codigo ?? row.codigo ?? ''), name: String(row.categoria ?? row.nombre ?? ''), description: row.descripcion ?? null }))
      .filter(row => row.code && row.name);
  }

  async listSubcategories(categoryCode?: string | null): Promise<SubcategoryOption[]> {
    const rows = await this.#call(`EXEC dbo.sp_ListarSubcategoriasVenta @CategoriaCodigo=${this.#nullableLiteral(categoryCode)}, @SoloActivas=1;`);
    return rows
      .map(row => ({ code: String(row.subcategoria_codigo ?? row.codigo ?? ''), name: String(row.subcategoria ?? row.nombre ?? ''), categoryCode: row.categoria_codigo ?? null, category: row.categoria ?? null, description: row.descripcion ?? null }))
      .filter(row => row.code && row.name);
  }

  async consultOrder(orderNumber: string, email: string): Promise<OrderLookup | null> {
    const order = orderNumber.trim();
    const mail = email.trim();
    if (!order || !mail) throw new Error('order number and email are required');
    const rows = await this.#call(`EXEC dbo.sp_ConsultarPedido @NumeroPedido='${this.#escape(order)}', @EmailCliente='${this.#escape(mail)}';`);
    return rows[0] ?? null;
  }
}

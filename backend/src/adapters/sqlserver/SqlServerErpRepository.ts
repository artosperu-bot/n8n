import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { ProductQuote } from '../../domain/types.ts';

type Driver = any;
type Options = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  catalogProcedure: string;
  driverLoader?: () => Promise<Driver>;
};

export class SqlServerErpRepository implements ErpRepository {
  readonly #options: Options;
  readonly #driverLoader: () => Promise<Driver>;
  #poolPromise?: Promise<any>;

  constructor(options: Options) {
    this.#options = options;
    this.#driverLoader = options.driverLoader ?? (async () => import('mssql'));
  }

  async #pool(): Promise<any> {
    if (!this.#poolPromise) {
      this.#poolPromise = (async () => {
        const loaded = await this.#driverLoader();
        const sql = loaded?.default ?? loaded;
        const pool = new sql.ConnectionPool({
          server: this.#options.server,
          port: this.#options.port,
          database: this.#options.database,
          user: this.#options.user,
          password: this.#options.password,
          options: {
            encrypt: this.#options.encrypt,
            trustServerCertificate: this.#options.trustServerCertificate,
            appName: 'STECH Backend',
          },
          pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
          connectionTimeout: 15_000,
          requestTimeout: 15_000,
        });
        pool.on('error', (error: unknown) => console.error('[SQL_SERVER_POOL_ERROR]', error));
        await pool.connect();
        return { sql, pool };
      })();
    }
    return this.#poolPromise;
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
      source: 'SQL_SERVER',
    };
  }

  async #executeCatalog(textSearch: string | null, maxResults: number): Promise<ProductQuote[]> {
    const { sql, pool } = await this.#pool();
    const request = pool.request();
    request.input('TextoBusqueda', sql.NVarChar(200), textSearch);
    request.input('CategoriaCodigo', sql.NVarChar(50), null);
    request.input('SubcategoriaCodigo', sql.NVarChar(50), null);
    request.input('SoloConStock', sql.Bit, 0);
    request.input('MaxResultados', sql.Int, maxResults);
    const result = await request.execute(this.#options.catalogProcedure);
    return (result?.recordset ?? [])
      .map((row: any) => this.#map(row))
      .filter((row: ProductQuote | null): row is ProductQuote => row !== null);
  }

  async getProductQuote(product: string): Promise<ProductQuote | null> {
    const rows = await this.#executeCatalog(product, 20);
    return rows[0] ?? null;
  }

  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    const rows = await this.#executeCatalog(null, 100);
    return rows
      .filter(row => row.price != null && row.price <= maxBudget)
      .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
  }
}

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
  quoteProcedure: string;
  budgetProcedure: string;
  productParameter: string;
  budgetParameter: string;
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
        const sql = await this.#driverLoader();
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
    const product = String(raw.product ?? raw.producto ?? raw.nombre ?? '').trim();
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

  async getProductQuote(product: string): Promise<ProductQuote | null> {
    const { sql, pool } = await this.#pool();
    const request = pool.request();
    request.input(this.#options.productParameter, sql.NVarChar(200), product);
    const result = await request.execute(this.#options.quoteProcedure);
    return this.#map(result?.recordset?.[0]);
  }

  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> {
    const { sql, pool } = await this.#pool();
    const request = pool.request();
    request.input(this.#options.budgetParameter, sql.Int, Math.trunc(maxBudget));
    const result = await request.execute(this.#options.budgetProcedure);
    return (result?.recordset ?? []).map((row: any) => this.#map(row)).filter((row: ProductQuote | null): row is ProductQuote => row !== null);
  }
}

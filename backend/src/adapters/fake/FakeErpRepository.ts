import type { ErpRepository } from '../../ports/ErpRepository.ts';
import type { ProductQuote } from '../../domain/types.ts';

const TEST_QUOTES: ProductQuote[] = [
  { product: 'Armor X12 Pro', productCode: 'P000047', price: 699, stock: 5, currency: 'PEN', source: 'FAKE_TEST_DATA' },
  { product: 'Armor X13', productCode: 'P000048', price: 899, stock: 4, currency: 'PEN', source: 'FAKE_TEST_DATA' },
  { product: 'Armor 22', productCode: 'P000049', price: 1199, stock: 3, currency: 'PEN', source: 'FAKE_TEST_DATA' },
  { product: 'Armor 25T Pro', productCode: 'P000050', price: 1999, stock: 2, currency: 'PEN', source: 'FAKE_TEST_DATA' }
];
export class FakeErpRepository implements ErpRepository {
  async getProductQuote(product: string): Promise<ProductQuote | null> { return structuredClone(TEST_QUOTES.find(q => q.product.toLowerCase() === product.toLowerCase()) ?? null); }
  async listProductsWithinBudget(maxBudget: number): Promise<ProductQuote[]> { return structuredClone(TEST_QUOTES.filter(q => q.price != null && q.price <= maxBudget).sort((a,b) => (b.price ?? 0) - (a.price ?? 0))); }
}

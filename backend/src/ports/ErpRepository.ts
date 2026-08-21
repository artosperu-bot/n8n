import type { ProductImage, ProductQuote } from '../domain/types.ts';
export interface ErpRepository {
  getProductQuote(product:string):Promise<ProductQuote|null>;
  listProductsWithinBudget(maxBudget:number):Promise<ProductQuote[]>;
  getProductImages?(product:string,maxImages?:number):Promise<ProductImage[]>;
}

import type { ProductQuote } from '../domain/types.ts';
export interface ErpRepository{getProductQuote(product:string):Promise<ProductQuote|null>;listProductsWithinBudget(maxBudget:number):Promise<ProductQuote[]>;}

import type { CatalogResolution, CategoryOption, OrderLookup, ProductImage, ProductQuote, SubcategoryOption } from '../domain/types.ts';

export interface ErpRepository {
  getProductQuote(product:string):Promise<ProductQuote|null>;
  listProductsWithinBudget(maxBudget:number):Promise<ProductQuote[]>;
  getProductImages?(product:string,maxImages?:number):Promise<ProductImage[]>;
  resolveCatalogContext?(text:string):Promise<CatalogResolution[]>;
  listCatalog?(filters?:{categoryCode?:string|null;subcategoryCode?:string|null;onlyWithStock?:boolean}):Promise<ProductQuote[]>;
  listCategories?():Promise<CategoryOption[]>;
  listSubcategories?(categoryCode?:string|null):Promise<SubcategoryOption[]>;
  consultOrder?(orderNumber:string,email:string):Promise<OrderLookup|null>;
}

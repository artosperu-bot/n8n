import type { RagEvidence } from '../domain/types.ts';

export interface RagRepository {
  search(query:string,product?:string|null):Promise<RagEvidence[]>;
  searchProduct?(query:string,productId:string,sections?:string[],limit?:number):Promise<RagEvidence[]>;
  searchInstitutional?(query:string,limit?:number):Promise<RagEvidence[]>;
}

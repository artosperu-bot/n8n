import type { RagEvidence } from '../domain/types.ts';
export interface RagRepository{search(query:string,product?:string|null):Promise<RagEvidence[]>;}

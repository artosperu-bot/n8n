import type { RagRepository } from '../../ports/RagRepository.ts';
export class FakeRagRepository implements RagRepository {
  async search(query: string, product?: string | null) { return [{ text: `[FAKE TEST RAG] Evidencia simulada para ${product ?? 'consulta'}: ${query}`, source: 'FAKE_TEST_DATA', score: 1 }]; }
  async searchProduct(query:string,productId:string,sections:string[]=[]){
    const selected=sections.length?sections:['GENERAL'];
    return selected.map((section,index)=>({text:`[FAKE TEST RAG] ${productId} ${section}: ${query}`,source:`FAKE_TEST_DATA:${section}`,score:10-index,productId,section,domain:'PRODUCT' as const}));
  }
  async searchInstitutional(query:string){return [{text:`[FAKE TEST POLICY] ${query}`,source:'FAKE_TEST_DATA:POLICY',score:10,domain:'INSTITUTIONAL' as const}];}
}

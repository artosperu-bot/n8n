import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRagRepository } from '../../src/adapters/supabase/SupabaseRagRepository.ts';

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status:200, headers:{'content-type':'application/json'} });
}

test('product RAG uses query embedding and vector RPC while preserving product scope', async () => {
  let embeddingCalls=0;
  const calls:Array<{url:string;method:string;body:string}>=[];
  const embeddingProvider={
    async embed(text:string){ embeddingCalls+=1; assert.match(text,/bateria/i); return Array(1536).fill(0.01); }
  };
  const fetcher:typeof fetch=async (input:any,init:any={})=>{
    const url=String(input); const method=String(init?.method??'GET').toUpperCase(); const body=String(init?.body??'');
    calls.push({url,method,body});
    if(url.includes('/rest/v1/rpc/buscar_rag_producto_documents_v37')){
      const parsed=JSON.parse(body);
      assert.equal(parsed.p_producto_id,'P-ARMOR-X13');
      assert.equal(parsed.p_query_embedding.length,1536);
      return json([{id:1,producto_id:'P-ARMOR-X13',content:'Sección BATERIA: 6320 mAh',metadata:{seccion:'BATERIA'},similarity:0.91}]);
    }
    if(url.includes('/rest/v1/catalogo_productos')) return json([{producto_id:'P-ARMOR-X13',nombre_corto:'Armor X13'}]);
    if(url.includes('/rest/v1/documents')) return json([]);
    if(url.includes('/rest/v1/rag_institucional')) return json([]);
    return new Response('not found',{status:404});
  };
  const repo=new SupabaseRagRepository({
    url:'https://example.supabase.co',key:'secret',fetcher,
    embeddingProvider,
    productRpc:'buscar_rag_producto_documents_v37',
  } as any);
  const rows=await repo.searchProduct('que bateria trae','P-ARMOR-X13',['BATERIA'],4);
  assert.equal(embeddingCalls,1);
  assert.ok(calls.some(c=>c.method==='POST'&&c.url.includes('/rpc/buscar_rag_producto_documents_v37')));
  assert.equal(rows[0]?.productId,'P-ARMOR-X13');
  assert.equal(rows[0]?.section,'BATERIA');
  assert.equal(rows[0]?.score,0.91);
});

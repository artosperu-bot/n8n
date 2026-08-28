import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIEmbeddingProvider } from '../../src/adapters/openai/OpenAIEmbeddingProvider.ts';

test('uses embeddings endpoint with independent configured model and returns numeric vector', async()=>{
  let seenUrl=''; let seenBody:any=null; let seenAuth='';
  const fetcher:typeof fetch=async(input:any,init:any={})=>{
    seenUrl=String(input); seenBody=JSON.parse(String(init.body)); seenAuth=String(init.headers?.authorization??'');
    return Response.json({data:[{embedding:[0.1,0.2,0.3]}],model:'text-embedding-3-small'});
  };
  const provider=new OpenAIEmbeddingProvider({apiKey:'sk-test',model:'text-embedding-3-small',fetcher});
  const vector=await provider.embed('bateria resistente para delivery');
  assert.match(seenUrl,/\/v1\/embeddings$/);
  assert.equal(seenBody.model,'text-embedding-3-small');
  assert.equal(seenBody.input,'bateria resistente para delivery');
  assert.equal(seenBody.encoding_format,'float');
  assert.equal(seenAuth,'Bearer sk-test');
  assert.deepEqual(vector,[0.1,0.2,0.3]);
});

test('rejects malformed embedding responses instead of returning unusable evidence',async()=>{
  const provider=new OpenAIEmbeddingProvider({apiKey:'sk-test',model:'text-embedding-3-small',fetcher:async()=>Response.json({data:[]})});
  await assert.rejects(()=>provider.embed('x'),/embedding/i);
});

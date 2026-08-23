import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('writer never receives raw RAG when verifiedFacts are empty', async () => {
  let body:any;
  const fetcher:typeof fetch=async (_url,init)=>{
    body=JSON.parse(String(init?.body));
    return Response.json({model:'gpt-5-mini',output_text:'Listo',usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
  };
  const llm=new OpenAIProvider({apiKey:'x',model:'gpt-5-mini',fetcher});
  const raw='Producto ID: P000048 | Código: X13 | SKU: INTERNAL-X13 | Sección: batería | Contenido: dato crudo interno';

  await llm.write({
    message:'¿Qué batería tiene?',
    intent:'ATTRIBUTE',
    state:{activeProduct:'Armor X13'},
    verifiedFacts:[],
    rag:[{text:raw,source:'raw-rag',domain:'PRODUCT'}],
  });

  assert.equal(typeof body?.input,'string');
  assert.doesNotMatch(body.input,/Producto ID:|Código:|SKU:|Sección:|Contenido:/i);
  assert.doesNotMatch(body.input,/dato crudo interno/i);
  assert.match(body.input,/SIN_DATO_VERIFICADO/);
});

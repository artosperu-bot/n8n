import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider{return {async write(){return {text,model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};}
const base:any={message:'quiero uno resistente',intent:'RECOMMEND',state:{},decision:null,deterministicAnswer:'x'};

test('rejects robotic evidence/catalog meta-language from customer-facing writer',async()=>{
  const r=await safeWrite(llm('Según el catálogo verificado, esta es la mejor opción.'),base,'Te recomiendo esta opción por su resistencia confirmada.');
  assert.equal(r.answer,'Te recomiendo esta opción por su resistencia confirmada.');
  assert.equal(r.fallback.delivered,false);
  assert.equal(r.fallback.error,'ROBOTIC_META_LANGUAGE');
});

test('rejects absolute superlative when only one product has evidence',async()=>{
  const r=await safeWrite(llm('Es el más resistente que tenemos.'),{
    ...base,
    rag:[{text:'IP68: Sí',source:'TEST',productId:'P-A',section:'RESISTENCIA',domain:'PRODUCT'}],
  },'Es una opción resistente; puedo compararla con las demás si quieres.');
  assert.equal(r.fallback.error,'UNSUPPORTED_SUPERLATIVE');
});

test('allows a direct benefit-oriented recommendation without robotic filler',async()=>{
  const r=await safeWrite(llm('Para trabajo en campo te conviene priorizar resistencia y batería; este modelo encaja bien por esos dos puntos.'),{
    ...base,
    rag:[{text:'resistencia y batería confirmadas',source:'TEST',productId:'P-A',section:'RESISTENCIA',domain:'PRODUCT'}],
  },'fallback');
  assert.equal(r.fallback.delivered,true);
  assert.match(r.answer,/trabajo en campo/i);
});

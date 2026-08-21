import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider{return{async write(){return{text,model:'test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};}
const base:any={message:'consulta',intent:'PRODUCT_INFO',state:{},rag:[]};

test('writer guard blocks unsolicited price from generated commercial prose',async()=>{
  const r=await safeWrite(llm('Te conviene por resistencia y cuesta S/ 899.'),base,'Respuesta segura.');
  assert.equal(r.answer,'Respuesta segura.');
  assert.equal(r.fallback.delivered,false);
  assert.match(r.fallback.error??'',/UNSOLICITED_PRICE/);
});

test('writer guard blocks fabricated completed side effects',async()=>{
  const r=await safeWrite(llm('Listo, ya reservé el equipo para ti.'),base,'Te paso con un asesor.');
  assert.equal(r.answer,'Te paso con un asesor.');
  assert.match(r.fallback.error??'',/UNVERIFIED_ACTION/);
});

test('writer guard allows verified price wording on explicit price intent',async()=>{
  const r=await safeWrite(llm('El equipo está a S/ 899.'),{...base,intent:'PRICE'},'Fallback');
  assert.equal(r.answer,'El equipo está a S/ 899.');
  assert.equal(r.fallback.delivered,true);
});

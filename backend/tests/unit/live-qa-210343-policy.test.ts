import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstitutionalTopic } from '../../src/conversation/institutional/InstitutionalTopicResolver.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import type { LlmProvider, TurnDecision } from '../../src/ports/LlmProvider.ts';

const usage={inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0};
function decision(patch:Partial<TurnDecision>={}):TurnDecision{return {
  primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
  explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,
  priorities:[],objection:null,commercialStage:null,spinContribution:null,nextBestAction:'ANSWER_ONLY',
  needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:.99,...patch,
};}
function writer(text:string):LlmProvider{return {async write(){return {text,model:'gpt-test',usage,durationMs:1};}};}

test('natural devolver wording routes to changes and returns policy',()=>{
  assert.deepEqual(resolveInstitutionalTopic('puedo devolverlo?'),{category:'postventa',subcategory:'cambios_devoluciones'});
});

test('verified institutional monetary threshold is not treated as unsolicited product price',async()=>{
  const text='Sí, el envío es gratis en compras desde S/ 250.';
  const result=await safeWrite(writer(text),{
    message:'el envio es gratis?',intent:'POLICY',state:{},decision:decision({primaryIntent:'POLICY'}),
    rag:[{text:'Envío gratuito para compras desde S/ 250.',source:'SUPABASE_VECTOR_INSTITUCIONAL:envios:envio_gratuito',domain:'INSTITUTIONAL'}],
  },'No tengo ese dato confirmado.');
  assert.equal(result.answer,text);
  assert.equal(result.fallback.error,undefined);
});

test('customer-facing writer rejects internal N+1 control vocabulary',async()=>{
  const result=await safeWrite(writer('La garantía es de 12 meses. (SOFT_CLOSE)'),{
    message:'cuanto dura la garantia?',intent:'WARRANTY',state:{},decision:decision({primaryIntent:'WARRANTY'}),
    rag:[{text:'Garantía: 12 meses.',source:'TEST',domain:'INSTITUTIONAL'}],
  },'La garantía es de 12 meses.');
  assert.equal(result.answer,'La garantía es de 12 meses.');
  assert.equal(result.fallback.error,'ROBOTIC_META_LANGUAGE');
});

test('ANSWER_ONLY also removes a question from a safety fallback',async()=>{
  const result=await safeWrite(writer('Cuesta S/ 99.'),{
    message:'cuanto pesa?',intent:'CAPABILITY',state:{},decision:decision({primaryIntent:'CAPABILITY',nextBestAction:'ANSWER_ONLY'}),
  },'El Armor 22 pesa 324 g. ¿Quieres que revise otra característica?');
  assert.equal(result.answer,'El Armor 22 pesa 324 g.');
  assert.doesNotMatch(result.answer,/\?/);
});

test('duplicate factual restatement falls back to one concise fact',async()=>{
  const duplicate='Conclusión: el Armor 22 pesa 324 g.\n* **Peso:** 324 g.';
  const result=await safeWrite(writer(duplicate),{
    message:'cuanto pesa el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:decision({primaryIntent:'CAPABILITY'}),allowedProducts:['Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',domain:'PRODUCT',productId:'P-ARMOR-22',section:'FISICO'}],
  },'El **Armor 22 pesa 324 g**.');
  assert.equal(result.answer,'El **Armor 22 pesa 324 g**.');
  assert.equal(result.fallback.error,'DUPLICATE_FACT');
});

test('selected product makes price and stock eligible for contextual soft close while cold factual stays answer-only',()=>{
  assert.equal(nextBestAction('PRICE',{activeProduct:'Armor 22'}),'ANSWER_ONLY');
  assert.equal(nextBestAction('PRICE',{activeProduct:'Armor 22',selectedProduct:'Armor 22'}),'SOFT_CLOSE');
  assert.equal(nextBestAction('STOCK',{activeProduct:'Armor 22',selectedProduct:'Armor 22'}),'SOFT_CLOSE');
});

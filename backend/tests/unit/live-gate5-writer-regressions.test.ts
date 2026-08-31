import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

// These regressions mirror the first-five live sentinel gate and must stay green before any 500-conversation run.
function llm(text:string):LlmProvider{return{async write(){return{text,model:'live-gate-stub',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};}

const quote={product:'Armor X13',shortName:'Armor X13',productRagId:'P-ARMOR-X13',price:899,stock:5,currency:'PEN',source:'TEST'} as any;

test('known work use never emits the robotic Lo tienes pensado para template',async()=>{
  const input:LlmWriteInput={
    message:'Lo quiero para mi trabajo.',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',useCase:'trabajo'},resolvedProduct:'Armor 22',useCase:'trabajo',
    nextBestAction:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',missingFact:'problema principal',decisionImpact:true,
    allowedProducts:['Armor 22'],
  };
  const result=await safeWrite(llm('¿Qué problema quieres resolver con el equipo?'),input,'¿Qué problema quieres resolver con el equipo?');
  assert.doesNotMatch(result.answer,/Lo tienes pensado para/i);
  assert.match(result.answer,/¿[^?]*(?:problema|complica|falla|pasa)[^?]*\?/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
});

test('implication discovery asks one open natural question instead of a menu of options',async()=>{
  const input:LlmWriteInput={
    message:'Se me cae seguido el celular.',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',useCase:'trabajo',problem:'caidas_frecuentes',spinFacts:['uso:trabajo','problema:caidas_frecuentes']},
    resolvedProduct:'Armor 22',useCase:'trabajo',problem:'caidas_frecuentes',
    directAnswer:'Armor 22 tiene resistencia verificada para caídas.',
    nextBestAction:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',missingFact:'impacto',decisionImpact:true,
    allowedProducts:['Armor 22'],
  };
  const result=await safeWrite(llm('Armor 22 tiene resistencia verificada para caídas.'),input,'Armor 22 tiene resistencia verificada para caídas.');
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
  const question=result.answer.match(/¿[^?]+\?/)?.[0]??'';
  assert.match(question,/afecta|genera|ocasiona|impacta|complica/i);
  assert.doesNotMatch(question,/:|\bu otro\b|interrupciones,|p[eé]rdida de tiempo u/i);
});

test('stock-only turn never repeats the product price even during an authorized soft close',async()=>{
  const input:LlmWriteInput={
    message:'¿Hay stock?',intent:'STOCK',resolvedCurrentIntent:'STOCK',
    state:{activeProduct:'Armor X13',lastIntent:'PRICE',lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE',commercialStage:'CONSIDERACION'},
    resolvedProduct:'Armor X13',quote,allowedProducts:['Armor X13'],
    nextBestAction:'SOFT_CLOSE',finalExecutableNba:'SOFT_CLOSE',executableNba:'SOFT_CLOSE',
    commercialResponsePlan:{mode:'SOFT_CLOSE',strategy:'RESPUESTA_DIRECTA',shouldUseLlm:true,acknowledgeContext:false,contextFocus:[],factualCore:'Sí, está disponible.',exactNba:'SOFT_CLOSE',closePurpose:'FULFILLMENT',maxQuestions:1,allowedActions:['SOFT_CLOSE'],forbiddenClaims:[]},
  };
  const result=await safeWrite(llm('Armor X13 está a S/ 899 y sí está disponible. ¿Prefieres envío o recogerlo en nuestro local?'),input,'Sí, está disponible.');
  assert.doesNotMatch(result.answer,/S\/\s*899|\b899\b/i);
  assert.match(result.answer,/disponible|stock/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
});
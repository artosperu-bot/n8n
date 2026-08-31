import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

function writer(text:string):LlmProvider{
  return{async write(){return{text,model:'qa-writer',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};
}

function painInput():LlmWriteInput{
  return{
    message:'Se me cae seguido el celular en el trabajo',
    intent:'EVALUATE_USE',
    resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',activeProductId:'P-ARMOR-22-256G',useCase:'trabajo',problem:'caidas_frecuentes',spinFacts:['uso:trabajo','problema:caidas_frecuentes']},
    resolvedProduct:'Armor 22',
    quote:{product:'Armor 22',shortName:'Armor 22',productRagId:'P-ARMOR-22-256G',price:1399,stock:9,currency:'PEN',source:'FAKE_TEST_DATA'},
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'qa'},
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-ARMOR-22-256G',source:'qa'},
      {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-ARMOR-22-256G',source:'qa'},
    ],
    candidateNba:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',nextBestAction:'ASK_MISSING_FACT',
    missingFact:'impacto',decisionImpact:true,
    useCase:'trabajo',problem:'caidas_frecuentes',
    allowedProducts:['Armor 22'],
  };
}

test('pain discovery fallback never leaks price/stock and keeps a grounded pain-to-benefit bridge',async()=>{
  const input=painInput();
  const badWriter='Armor 22 aguanta caídas. Está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recojo?';
  const legacyFallback='Armor 22: batería 6600 mAh y batería Características confirmadas de batería y carga para Armor 22. Está a S/ 1399 y tenemos disponibilidad.';
  const result=await safeWrite(writer(badWriter),input,legacyFallback);
  assert.equal(result.fallback.delivered,false);
  assert.match(String(result.fallback.error),/UNSOLICITED_PRICE|UNSOLICITED_AVAILABILITY/);
  assert.doesNotMatch(result.answer,/S\/\s*1399|disponibilidad|env[ií]o|recojo/i);
  assert.doesNotMatch(result.answer,/Caracter[ií]sticas confirmadas/i);
  assert.match(result.answer,/ca[ií]d|golpe|1\.5\s*m/i);
  assert.match(result.answer,/¿[^?]*(?:genera|afecta|dañ|repar|interrump|pierdes?|p[eé]rdida)[^?]*\?/i);
  assert.equal((result.answer.match(/¿/g)??[]).length,1);
});

test('known work use asks for the real problem without injecting an unsolicited quote',async()=>{
  const input:LlmWriteInput={
    message:'Lo quiero para mi trabajo',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',activeProductId:'P-ARMOR-22-256G',useCase:'trabajo'},
    resolvedProduct:'Armor 22',useCase:'trabajo',
    quote:{product:'Armor 22',shortName:'Armor 22',productRagId:'P-ARMOR-22-256G',price:1399,stock:9,currency:'PEN',source:'FAKE_TEST_DATA'},
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',source:'qa'},
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',source:'qa'},
      {domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh',source:'qa'},
    ],
    candidateNba:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',nextBestAction:'ASK_MISSING_FACT',missingFact:'problema principal',decisionImpact:true,
    allowedProducts:['Armor 22'],
  };
  const result=await safeWrite(writer('Está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recojo?'),input,'Está a S/ 1399 y tenemos disponibilidad.');
  assert.doesNotMatch(result.answer,/S\/\s*1399|disponibilidad|env[ií]o|recojo/i);
  assert.match(result.answer,/trabajo/i);
  assert.match(result.answer,/¿[^?]*(?:complica|problema|falla|pasa)[^?]*\?/i);
  assert.equal((result.answer.match(/¿/g)??[]).length,1);
});

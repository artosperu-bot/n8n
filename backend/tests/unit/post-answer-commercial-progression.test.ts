import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { priceResponse, stockResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

test('A: a price lookup after meaningful interactions proposes executable progression',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',useCase:'trabajo de campo',priorities:['resistencia'],levelOfInterest:24,interestEvents:['USE_CASE','ATTRIBUTE:ARMOR_22:RESISTENCIA','PRICE:ARMOR_22']},
  });
  assert.equal(result.level,'MEDIUM');
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('B: verified capability plus mature problem context may advance to a bounded close',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',problem:'golpes frecuentes',priorities:['resistencia'],levelOfInterest:24,interestEvents:['USE_CASE','ATTRIBUTE:ARMOR_22:RESISTENCIA','PRICE:ARMOR_22']},
  });
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('C: an isolated verified technical fact receives a light related value, not a forced question',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,relatedValueAvailable:true,
    state:{activeProduct:'Armor 22',levelOfInterest:4,interestEvents:['ATTRIBUTE:ARMOR_22:RAM']},
  });
  assert.equal(result.level,'LOW');
  assert.equal(result.candidateNba,'RELATED_VALUE');
  const prepared=prepareCommercialWriteInput({
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RAM']},
    decision:{nextBestAction:result.candidateNba} as any,allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: hasta 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  });
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.capabilityAction,'ADD_RELATED_VALUE');
  assert.match(prepared.relatedNextValue?.customerSafeText??'',/multitarea|tareas/i);
});

test('LOW price with verified availability selects one light SQL-grounded related value',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,relatedValueAvailable:true,
    state:{activeProduct:'Armor 22',levelOfInterest:8,interestEvents:['PRICE:ARMOR_22']},
  });
  assert.equal(result.level,'LOW');
  assert.equal(result.candidateNba,'RELATED_VALUE');
  const prepared=prepareCommercialWriteInput({
    message:'¿cuánto cuesta?',intent:'PRICE',state:{},decision:{nextBestAction:result.candidateNba} as any,
    allowedProducts:['Producto Prueba'],quote:{product:'Producto Prueba',shortName:'Producto Prueba',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'},
  });
  assert.equal(prepared.resolvedProduct,'Producto Prueba');
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.capabilityAction,'ADD_RELATED_VALUE');
  const answer=priceResponse(prepared.quote??null,false,prepared.relatedNextValue?.customerSafeText??null);
  assert.match(answer,/899/);
  assert.match(answer,/disponible/i);
  assert.equal((answer.match(/disponible/gi)??[]).length,1);
});

test('unavailable stock does not invent an alternative continuation',()=>{
  const answer=stockResponse({product:'Producto Prueba',price:899,stock:0,currency:'PEN',source:'FAKE_TEST_DATA'});
  assert.equal(answer,'Ahora no está disponible.');
});

test('writer guard deterministically delivers exactly one declarative related value',async()=>{
  const llm:LlmProvider={async write(){return{text:'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RAM']},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: hasta 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  },'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.equal((result.answer.match(/multitarea/gi)??[]).length,1);
  assert.doesNotMatch(result.answer,/[¿?]/);
});

test('D: progression does not force a useless question when the decision context is complete',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:null,verifiedCurrentAnswer:false,
    state:{useCase:'campo',problem:'golpes',priorities:['resistencia'],budget:1200,levelOfInterest:30},
  });
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

test('E: explicit interest outranks a lower-value SPIN question',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ASK_MISSING_FACT',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',interestSignal:true,levelOfInterest:15},
  });
  assert.equal(result.level,'HIGH');
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('F: progression emits exactly one bounded NBA',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,state:{selectedProduct:'Armor 22'}});
  assert.equal(typeof result.candidateNba,'string');
  assert.doesNotMatch(result.candidateNba,/[,|]/);
});

test('G: unsupported progression degrades through CAN_EXECUTE without inventing another action',()=>{
  const proposed=evaluatePostAnswerCommercialProgression({intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,state:{interestSignal:true,activeProduct:'Armor 22'}});
  const prepared=prepareCommercialWriteInput({message:'¿cuánto cuesta?',intent:'PRICE',state:{interestSignal:true,activeProduct:'Armor 22'},decision:{nextBestAction:proposed.candidateNba} as any,allowedProducts:['Armor 22']});
  assert.equal(proposed.candidateNba,'SOFT_CLOSE');
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
});

test('H: purchase and closing continuity are never sent back to discovery',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PURCHASE',currentNba:'COLLECT_RESERVATION_DATA',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',selectedProduct:'Armor 22',purchaseSignal:true,commercialStage:'CIERRE'},
  });
  assert.equal(result.level,'HIGH');
  assert.equal(result.candidateNba,'COLLECT_RESERVATION_DATA');
});

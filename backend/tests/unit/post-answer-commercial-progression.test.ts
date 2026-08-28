import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { priceResponse, stockResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { isNbaCompatible } from '../../src/conversation/nba/NbaCompatibility.ts';
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

test('C: verified attribute with a real customer problem carries a contextual semantic move',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,relatedValueAvailable:true,
    state:{activeProduct:'Armor 22',problem:'caídas frecuentes',priorities:['resistencia'],levelOfInterest:4,interestEvents:['ATTRIBUTE:ARMOR_22:RESISTENCIA']},
  });
  assert.equal(result.level,'LOW');
  assert.equal(result.candidateNba,'RELATED_VALUE');
  const prepared=prepareCommercialWriteInput({
    message:'¿aguanta caídas?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RESISTENCIA'],problem:'caídas frecuentes',priorities:['resistencia']},
    decision:{nextBestAction:result.candidateNba} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Resistencia a caídas: 1.5 m. Certificación IP68: Sí.',source:'TEST:RESISTENCIA',section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  });
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.capabilityAction,'ADD_RELATED_VALUE');
  assert.equal(prepared.commercialMove?.kind,'CONTEXTUAL_BENEFIT');
  assert.equal(prepared.commercialMove?.targetProduct,'Armor 22');
  assert.deepEqual(prepared.commercialMove?.relevantCustomerContext.problem,'caídas frecuentes');
  assert.ok(prepared.commercialMove?.verifiedFacts.some(fact=>fact.key==='RESISTENCIA'));
  assert.equal((prepared.commercialMove as any)?.customerSafeText,undefined);
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
  assert.equal(prepared.commercialMove?.kind,'STOCK_STATUS');
  assert.deepEqual(prepared.commercialMove?.basis,['SQL']);
  assert.ok(prepared.commercialMove?.verifiedFacts.some(fact=>fact.key==='DISPONIBILIDAD'&&fact.value==='DISPONIBLE'));
  const answer=priceResponse(prepared.quote??null,false,prepared.commercialMove??null);
  assert.match(answer,/899/);
  assert.match(answer,/disponible/i);
  assert.equal((answer.match(/disponible/gi)??[]).length,1);
});

test('unavailable stock does not invent an alternative continuation',()=>{
  const answer=stockResponse({product:'Producto Prueba',price:899,stock:0,currency:'PEN',source:'FAKE_TEST_DATA'});
  assert.equal(answer,'Ahora no está disponible.');
});

test('writer receives and verbalizes the selected semantic move without a second N+1',async()=>{
  const llm:LlmProvider={async write(input){assert.equal(input.commercialMove?.kind,'CONTEXTUAL_BENEFIT');return{text:'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual; para tus llamadas y mensajería, esa memoria aporta margen de uso.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RAM'],useCase:'llamadas y mensajería'},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: hasta 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  },'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.match(result.answer,/llamadas|mensajer/i);
  assert.doesNotMatch(result.answer,/[¿?]/);
});

test('generic filler that ignores the semantic move is rejected instead of being accepted as N+1',async()=>{
  const llm:LlmProvider={async write(){return{text:'Tiene resistencia a caídas de 1.5 m. Ese atributo te da un criterio concreto para comparar opciones.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿aguanta caídas?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RESISTENCIA'],problem:'caídas frecuentes'},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Resistencia a caídas: 1.5 m.',source:'TEST:RESISTENCIA',section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  },'Tiene resistencia a caídas de 1.5 m.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.equal(result.fallback.error,'COMMERCIAL_MOVE_NOT_DELIVERED');
  assert.match(result.answer,/caídas frecuentes/i);
  assert.doesNotMatch(result.answer,/criterio concreto/i);
});

test('factual intents accept RELATED_VALUE as their final compatible NBA',()=>{
  for(const intent of ['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','PRICE_AVAILABILITY','PRICE','STOCK']){
    assert.equal(isNbaCompatible(intent,'RELATED_VALUE',{}),true,intent);
  }
  assert.equal(isNbaCompatible('POLICY','RELATED_VALUE',{}),false);
});

test('stock keeps RELATED_VALUE and selects a price-supported continuation without exposing the price',()=>{
  const quote={product:'Producto Prueba',shortName:'Producto Prueba',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'};
  const prepared=prepareCommercialWriteInput({
    message:'¿tienen stock?',intent:'STOCK',state:{activeProduct:'Producto Prueba'},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Producto Prueba'],quote,
  });
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.commercialMove?.kind,'RELATED_VERIFIED_FACT');
  assert.ok(prepared.commercialMove?.verifiedFacts.some(fact=>fact.key==='PRECIO'));
  const answer=stockResponse(quote,null,false,prepared.commercialMove??null);
  assert.match(answer,/disponible/i);
  assert.match(answer,/precio/i);
  assert.doesNotMatch(answer,/899/);
});

test('an attribute without customer context can use one distinct verified related fact',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',attribute:'RAM',state:{activeProduct:'Armor 22'},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-22',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'BATERIA',value:'6600 mAh',productId:'P-22',source:'TEST'},
    ],
    verifiedFeatures:[
      {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-22',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'BATERIA',value:'6600 mAh',productId:'P-22',source:'TEST'},
    ],
  });
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.commercialMove?.kind,'RELATED_VERIFIED_FACT');
  assert.deepEqual(prepared.commercialMove?.verifiedFacts.map(fact=>fact.key),['BATERIA']);
});

test('a fresh RAM turn derives the current attribute and delivers verified availability as visible +1',async()=>{
  const quote={product:'Armor 22',shortName:'Armor 22',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'};
  const input:any={
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},quote,
    decision:{attributes:['RAM'],nextBestAction:'RELATED_VALUE'},allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: hasta 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  };
  const prepared=prepareCommercialWriteInput(input);
  assert.equal(prepared.attribute,'RAM');
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.commercialMove?.kind,'STOCK_STATUS');
  const llm:LlmProvider={async write(){return{text:'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,input,'Esa opción encaja con los criterios indicados.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.match(result.answer,/8 GB de RAM física/i);
  assert.match(result.answer,/disponible/i);
});

test('MEMORIA excludes RAM facts from +1 when no distinct verified continuation exists',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    quote:{product:'Armor 22',shortName:'Armor 22',price:899,stock:null,currency:'PEN',source:'FAKE_TEST_DATA'},
    decision:{attributes:['MEMORIA'],nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: hasta 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  });
  assert.equal(prepared.attribute,'MEMORIA');
  assert.equal(prepared.commercialMove,null);
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
});

test('the word disponible in a storage answer does not falsely deliver a stock move',async()=>{
  const llm:LlmProvider={async write(){return{text:'Tiene 256 GB de almacenamiento disponible.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿cuánto almacenamiento tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    quote:{product:'Armor 22',shortName:'Armor 22',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'},
    decision:{attributes:['ALMACENAMIENTO'],nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Almacenamiento interno: 256 GB.',source:'TEST:MEMORIA',section:'ALMACENAMIENTO',domain:'PRODUCT',productId:'P-22'}],
  },'Tiene 256 GB de almacenamiento interno.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.equal(result.fallback.error,'COMMERCIAL_MOVE_NOT_DELIVERED');
  assert.match(result.answer,/está disponible/i);
});

test('failed +1 delivery preserves the grounded weight answer before deterministic stock fallback',async()=>{
  const llm:LlmProvider={async write(){return{text:'El Armor 22 pesa 324 g.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const input:any={
    message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    quote:{product:'Armor 22',shortName:'Armor 22',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'},
    decision:{attributes:['FISICO'],nextBestAction:'RELATED_VALUE'},allowedProducts:['Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',section:'FISICO',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  };
  const prepared=prepareCommercialWriteInput(input);
  assert.match(prepared.directAnswer??'',/324 g/i);
  const result=await safeWrite(llm,input,'Esa opción encaja con los criterios indicados.');
  assert.equal(result.fallback.error,'COMMERCIAL_MOVE_NOT_DELIVERED');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.equal(result.commercialMoveKind,'STOCK_STATUS');
  assert.match(result.answer,/324 g/i);
  assert.match(result.answer,/está disponible/i);
  assert.doesNotMatch(result.answer,/encaja con los criterios/i);
});

test('writer output containing only +1 is composed after immutable grounded N',async()=>{
  const llm:LlmProvider={async write(){return{text:'También está disponible.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    quote:{product:'Armor 22',shortName:'Armor 22',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'},
    decision:{attributes:['FISICO'],nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',section:'FISICO',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  },'Esa opción encaja con los criterios indicados.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.match(result.answer,/324 g/i);
  assert.match(result.answer,/está disponible/i);
});

test('recommendation continuity guard cannot replace an already grounded factual N',async()=>{
  const llm:LlmProvider={async write(){return{text:'El Armor 22 pesa 324 g.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    previousRecommendedProduct:'Armor 21',recommendedProduct:'Armor 22',recommendationChanged:true,
    decision:{attributes:['FISICO'],nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Armor 21','Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',section:'FISICO',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  },'Esa opción encaja con los criterios indicados.');
  assert.equal(result.fallback.error,'RECOMMENDATION_CHANGE_WITHOUT_REASON');
  assert.match(result.answer,/324 g/i);
  assert.doesNotMatch(result.answer,/reevaluar la recomendación/i);
});

test('current factual quote outranks a stale active product when grounding N',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor X13'},
    quote:{product:'Armor 22',shortName:'Armor 22',price:899,stock:3,currency:'PEN',source:'FAKE_TEST_DATA'},
    decision:{targetProduct:'Armor 22',attributes:['FISICO'],nextBestAction:'ANSWER_ONLY'} as any,
    allowedProducts:['Armor X13','Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',section:'FISICO',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  });
  assert.equal(prepared.resolvedProduct,'Armor 22');
  assert.match(prepared.directAnswer??'',/^Armor 22 pesa 324 g\./i);
});

test('explicit factual attribute does not ground N from an unrelated RAG section',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',attribute:'FISICO',state:{activeProduct:'Armor 22'},
    decision:{nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Batería: 6600 mAh.',source:'TEST:BATERIA',section:'BATERIA',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  });
  assert.equal(prepared.directAnswer,null);
});

test('unsupported operational request cannot delete a grounded factual N',async()=>{
  const llm:LlmProvider={async write(){return{text:'Puedo agendar una prueba.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿Cuánto pesa el Armor 22 y puedes agendar una demo?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},
    decision:{attributes:['FISICO'],nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Peso: 324 g.',source:'TEST:FISICO',section:'FISICO',domain:'PRODUCT',productId:'P-ARMOR-22'}],
  },'Esa opción encaja con los criterios indicados.');
  assert.match(result.answer,/324 g/i);
  assert.match(result.answer,/no tengo habilitada una agenda de pruebas/i);
});

test('quantity-specific stock answers also render the selected continuation',()=>{
  const quote={product:'Producto Prueba',price:899,stock:5,currency:'PEN',source:'FAKE_TEST_DATA'};
  const prepared=prepareCommercialWriteInput({message:'¿tienen 3 unidades?',intent:'STOCK',state:{},quote,decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Producto Prueba']});
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.match(stockResponse(quote,3,false,prepared.commercialMove??null),/precio/i);
  assert.match(stockResponse(quote,8,false,prepared.commercialMove??null),/precio/i);
});

test('contextual writer fallback keeps the verified direct answer before the same +1',async()=>{
  const llm:LlmProvider={async write(){return{text:'Tiene resistencia a caídas de 1.5 m.',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const result=await safeWrite(llm,{
    message:'¿aguanta caídas?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',problem:'caídas frecuentes'},
    decision:{attributes:['RESISTENCIA'],nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'Resistencia a caídas: 1.5 m.',source:'TEST:RESISTENCIA',section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  },'Esa opción encaja con los criterios indicados.');
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.match(result.answer,/1[.,]5 m/i);
  assert.match(result.answer,/caídas frecuentes/i);
});

test('query purpose is excluded from contextual-benefit customer context',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',currentAttributes:['RAM'],useCase:'conocer_precio'},
    decision:{nextBestAction:'RELATED_VALUE'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'RAM física: 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  });
  assert.equal(prepared.commercialMove,null);
  assert.notEqual(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.useCase,null);
  assert.equal(prepared.knownFacts?.useCase,null);
  assert.equal(prepared.commercialSignals?.useCase,null);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { noEvidenceResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

const usage={inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0};

function capturingWriter(text:string,onWrite:(input:LlmWriteInput)=>void=()=>{}):LlmProvider{
  return {async write(input){onWrite(input);return{text,model:'gpt-test',usage,durationMs:1};}};
}

test('writer boundary receives explicit commercial context and visibly executes RECOMMEND',async()=>{
  let captured:any=null;
  const result=await safeWrite(capturingWriter('Tiene IP68 y resistencia a caídas de 1.5 m.',input=>{captured=input;}),{
    message:'trabajo en construcción, cuál me recomiendas?',intent:'RECOMMEND',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],interestSignal:true,purchaseSignal:false,commercialStage:'EVALUACION',levelOfInterest:42,currentAttributes:['RESISTENCIA'],pendingCommercialAction:'RECOMMEND'},
    decision:{nextBestAction:'RECOMMEND'} as any,
    rag:[{text:'Resistencia a caídas: 1.5 m. Certificación IP68: Sí.',source:'TEST:RESISTENCIA',score:1,section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
    allowedProducts:['Armor 22'],
  },'Te recomiendo Armor 22 por su resistencia confirmada.');

  assert.equal(captured.nextBestAction,'RECOMMEND');
  assert.equal(captured.executableNba,'RECOMMEND');
  assert.equal(captured.resolvedCurrentIntent,'RECOMMEND');
  assert.equal(captured.resolvedProduct,'Armor 22');
  assert.ok(captured.supportedCapabilities.includes('RECOMMEND_PRODUCT'));
  assert.equal(captured.supportedCapabilities.includes('SCHEDULE_DEMO'),false);
  assert.equal(captured.commercialSignals.purchaseSignal,false);
  assert.equal(captured.commercialStage,'EVALUACION');
  assert.deepEqual(captured.knownFacts.useCase,'trabajo en construcción');
  assert.equal(captured.interestSignal,true);
  assert.equal(captured.purchaseSignal,false);
  assert.equal(captured.activeProduct,'Armor 22');
  assert.equal(captured.recommendedProduct,'Armor 22');
  assert.deepEqual(captured.priorities,['resistencia']);
  assert.ok(captured.verifiedFeatures.some((f:any)=>f.key==='RESISTENCIA'));
  assert.equal(captured.levelOfInterest,42);
  assert.equal(captured.attribute,'RESISTENCIA');
  assert.deepEqual(captured.implications,['RIESGO_INTERRUPCION_POR_DANO']);
  assert.equal(captured.pendingAction,'RECOMMEND');
  assert.deepEqual(captured.customerContext.useCase,'trabajo en construcción');
  assert.match(captured.commercialGoal,/recomendar/i);
  assert.match(result.answer,/te recomiendo\s+(?:el\s+)?Armor 22/i);
  assert.match(result.answer,/1[.,]5\s*m/i);
});

test('ASK_MISSING_FACT asks one truly missing fact when writer omits the action',async()=>{
  const result=await safeWrite(capturingWriter('Tengo varias opciones para ayudarte.'),{
    message:'quiero uno para trabajar',intent:'EVALUATE_USE',state:{useCase:'trabajo',priorities:[]},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    missingFact:'prioridad principal',
  } as any,'¿Qué priorizas más: resistencia, batería o cámara?');
  assert.equal((result.answer.match(/[?]/g)??[]).length,1);
  assert.match(result.answer,/priorizas|importa|prioridad/i);
});

test('ANSWER_ONLY never adds discovery after resolving the question',async()=>{
  const result=await safeWrite(capturingWriter('Sí, tiene NFC.'),{
    message:'tiene NFC?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
  },'Sí, tiene NFC.');
  assert.equal(result.answer,'Sí, tiene NFC.');
});

test('RAM evidence projects physical and virtual memory as separate verified facts',()=>{
  const facts=normalizeEvidence({intent:'CAPABILITY',rag:[{
    text:'Memoria RAM física: 8 GB. Ampliación de RAM virtual: hasta 8 GB. Almacenamiento: 256 GB.',
    source:'TEST:MEMORIA',score:1,section:'MEMORIA',domain:'PRODUCT',productId:'P-22',
  }]});
  assert.ok(facts.some(f=>f.key==='RAM_FISICA'&&f.value==='8 GB'));
  assert.ok(facts.some(f=>f.key==='RAM_VIRTUAL'&&f.value==='hasta 8 GB'));
});

test('writer rejects RAM total presented as physical memory and preserves labelled fallback',async()=>{
  const input:any={
    message:'cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'},
    rag:[{text:'RAM física: 8 GB. RAM virtual: hasta 8 GB.',source:'TEST:MEMORIA',score:1,section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  };
  const result=await safeWrite(capturingWriter('Tiene 16 GB de RAM.'),input,'Tiene 8 GB de RAM física y hasta 8 GB de RAM virtual.');
  assert.equal(result.answer,'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.');
  assert.equal(result.fallback.error,'RAM_VIRTUAL_CONFLATION');
});

test('writer allows a combined RAM total only when physical and virtual memory stay explicit',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'cuánta RAM tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    rag:[{text:'RAM física: 8 GB. RAM virtual: hasta 8 GB.',source:'TEST:MEMORIA',score:1,section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
    allowedProducts:['Armor 22'],
  });
  const answer='Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual (hasta 16 GB combinados).';
  const result=await safeWrite(capturingWriter(answer),prepared,'Tiene 8 GB de RAM física y hasta 8 GB de RAM virtual.');
  assert.equal(result.answer,answer);
  assert.equal(result.fallback.error,undefined);
});

test('writer restores virtual RAM when authority contains both components',async()=>{
  const result=await safeWrite(capturingWriter('Tiene 8 GB de RAM física.'),{
    message:'¿Cuánta RAM tiene el Armor 22?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    rag:[{text:'RAM física: 8 GB. RAM virtual máxima: 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',productId:'P-22',domain:'PRODUCT'}],allowedProducts:['Armor 22'],
  },'No tengo confirmado ese dato exacto.');
  assert.equal(result.answer,'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.');
  assert.equal(result.fallback.error,'RAM_COMPONENT_OMISSION');
});

test('grounded FAB may connect a verified feature to customer context without adding a feature',async()=>{
  const input:any={
    message:'lo quiero para obra',intent:'EVALUATE_USE',state:{useCase:'construcción',problem:'caídas frecuentes',priorities:['resistencia'],recommendedProduct:'Armor 22'},decision:{nextBestAction:'RECOMMEND'},allowedProducts:['Armor 22'],
    rag:[{text:'Resistencia a caídas: 1.5 m. Certificación IP68: Sí.',source:'TEST:RESISTENCIA',score:1,section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  };
  const result=await safeWrite(capturingWriter('Te recomiendo Armor 22: resiste caídas de 1.5 m, una ventaja concreta si trabajas en obra y se te cae seguido.'),input,'Te recomiendo Armor 22 por su resistencia a caídas de 1.5 m.');
  assert.equal(result.fallback.error,undefined);
  assert.match(result.answer,/obra/i);
  assert.doesNotMatch(result.answer,/\b(?:2|3|4)\s*m\b/i);
});

test('customer-facing evidence meta language falls back to natural wording',async()=>{
  const result=await safeWrite(capturingWriter('Según los datos disponibles y la evidencia verificada, tiene 8 GB.'),{
    message:'cuánta RAM física tiene?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    rag:[{text:'RAM física: 8 GB.',source:'TEST:MEMORIA',score:1,section:'MEMORIA',domain:'PRODUCT',productId:'P-22'}],
  },'Tiene 8 GB de RAM física.');
  assert.equal(result.answer,'Tiene 8 GB de RAM física.');
  assert.equal(result.fallback.error,'ROBOTIC_META_LANGUAGE');
  assert.doesNotMatch(result.answer,/evidencia|datos disponibles|sistema/i);
});

test('writer guard limits commercial advancement to one next step',async()=>{
  const result=await safeWrite(capturingWriter('Tengo opciones. ¿Qué uso tendrá? ¿Cuál es tu presupuesto?'),{
    message:'busco un equipo',intent:'OTHER',state:{},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
  },'¿Para qué uso principal lo necesitas?');
  assert.equal(result.answer,'¿Para qué uso principal lo necesitas?');
  assert.equal(result.fallback.error,'MULTIPLE_NEXT_STEPS');
});

test('verified display refresh rate may support a visual scrolling benefit',async()=>{
  const result=await safeWrite(capturingWriter('La pantalla de 120 Hz permite un desplazamiento visual más fluido al navegar.'),{
    message:'qué ventaja tiene la pantalla?',intent:'CAPABILITY',state:{useCase:'navegar y uso visual'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    rag:[{text:'Frecuencia de refresco de pantalla: 120 Hz.',source:'TEST:PANTALLA',score:1,section:'PANTALLA',domain:'PRODUCT',productId:'P-22'}],
  },'La pantalla tiene una frecuencia de refresco de 120 Hz.');
  assert.equal(result.fallback.error,undefined);
  assert.match(result.answer,/desplazamiento visual más fluido/i);
});

test('commercial contract chooses a missing fact without repeating a known priority',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Trabajo en construcción y se me cae el celular.',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',useCase:'trabajo',problem:'caídas frecuentes',priorities:['resistencia'],budget:null},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    missingFact:'prioridad principal',
    allowedProducts:['Armor 22'],
  });
  assert.equal(prepared.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(prepared.missingFact,'presupuesto máximo');
  assert.deepEqual(prepared.missingFacts,['presupuesto máximo']);
  assert.deepEqual(prepared.knownFacts?.priorities,['resistencia']);
  assert.equal(prepared.knownFacts?.activeProduct,'Armor 22');
});

test('non executable RECOMMEND does not invent a recommended product',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuál recomiendas?',intent:'RECOMMEND',state:{useCase:'trabajo',priorities:['resistencia'],budget:1200},
    decision:{nextBestAction:'RECOMMEND'} as any,allowedProducts:['Armor 22'],
  });
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  const result=await safeWrite(capturingWriter('Te recomiendo Armor 30.'),prepared,'Aún no hay una opción que destaque con claridad.');
  assert.equal(result.nextBestAction,'ANSWER_ONLY');
  assert.doesNotMatch(result.answer,/Armor 30/i);
  assert.doesNotMatch(result.answer,/te recomiendo/i);
});

test('executable RECOMMEND is delivered with a verified recommended product',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuál recomiendas?',intent:'RECOMMEND',state:{recommendedProduct:'Armor 22',useCase:'trabajo',priorities:['resistencia']},
    decision:{nextBestAction:'RECOMMEND'} as any,recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    rag:[{text:'Certificación IP68: Sí.',source:'TEST:RESISTENCIA',score:1,section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  });
  assert.equal(prepared.nextBestAction,'RECOMMEND');
  const result=await safeWrite(capturingWriter('Tiene certificación IP68.'),prepared,'Te recomiendo Armor 22 por su resistencia confirmada.');
  assert.match(result.answer,/te recomiendo\s+(?:el\s+)?Armor 22/i);
});

test('OFFER_ALTERNATIVE requires and visibly names an explicit verified alternative',async()=>{
  const withoutOptions=prepareCommercialWriteInput({
    message:'¿Qué otra opción tienes?',intent:'HANDLE_PRICE_OBJECTION',state:{activeProduct:'Armor X13',priorities:['precio']},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,allowedProducts:['Armor X13'],
  });
  assert.equal(withoutOptions.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(withoutOptions.missingFact,'presupuesto máximo');

  const withOptions=prepareCommercialWriteInput({
    message:'¿Qué otra opción tienes?',intent:'HANDLE_PRICE_OBJECTION',state:{activeProduct:'Armor X13',priorities:['precio']},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,allowedProducts:['Armor X13','Armor X12 Pro'],alternatives:['Armor X12 Pro'],
  });
  assert.equal(withOptions.nextBestAction,'OFFER_ALTERNATIVE');
  assert.deepEqual(withOptions.alternatives,['Armor X12 Pro']);
  const result=await safeWrite(capturingWriter('Puedo mostrarte otra alternativa disponible.'),withOptions,'Puedo mostrarte Armor X12 Pro como alternativa.');
  assert.match(result.answer,/Armor X12 Pro/i);
});

test('purchase signal prevents an invalid return to discovery',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Ya ese quiero, ¿cómo compro?',intent:'PURCHASE',state:{activeProduct:'Armor 22',purchaseSignal:true,priorities:['resistencia']},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,allowedProducts:['Armor 22'],
  });
  assert.equal(prepared.nextBestAction,'COLLECT_RESERVATION_DATA');
  assert.equal(prepared.capabilityAction,'RESERVATION_DATA_COLLECTION');
  assert.equal(prepared.missingFact,null);
});

test('FAB guard rejects a numeric feature not present in verified features',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Me sirve para obra?',intent:'EVALUATE_USE',state:{recommendedProduct:'Armor 22',useCase:'construcción',problem:'caídas frecuentes',priorities:['resistencia']},
    decision:{nextBestAction:'RECOMMEND'} as any,recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    rag:[{text:'Resistencia a caídas: 1.5 m.',source:'TEST:RESISTENCIA',score:1,section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
  });
  const result=await safeWrite(capturingWriter('Te recomiendo Armor 22: resiste caídas de 2 m, ideal para obra.'),prepared,'Te recomiendo Armor 22: resiste caídas de 1.5 m, útil para tu trabajo en obra.');
  assert.equal(result.fallback.error,'UNSUPPORTED_NUMERIC_FACT');
  assert.match(result.answer,/1[.,]5\s*m/i);
  assert.doesNotMatch(result.answer,/2\s*m/i);
});

test('SOFT_CLOSE may offer a stock check only with a resolved product and SQL evidence',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'me interesa',intent:'EVALUATE_USE',state:{activeProduct:'Armor 22',interestSignal:true},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',price:1399,stock:2,currency:'PEN',source:'TEST_SQL'},
  } as any);
  assert.equal(prepared.nextBestAction,'SOFT_CLOSE');
  assert.equal(prepared.capabilityAction,'SOFT_CLOSE_TO_STOCK');
  const result=await safeWrite(capturingWriter('El Armor 22 encaja con lo que buscas.'),prepared,'El Armor 22 encaja con lo que buscas.');
  assert.match(result.answer,/disponibilidad|stock/i);
});

test('SOFT_CLOSE without a resolved SQL product degrades to ANSWER_ONLY',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'me interesa',intent:'EVALUATE_USE',state:{interestSignal:true},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,allowedProducts:[],
  });
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  assert.equal(prepared.capabilityAction,'ANSWER_ONLY');
});

test('unsupported commercial action degrades without choosing another promise',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Pueden agendarme una prueba?',intent:'OTHER',state:{activeProduct:'Armor 22'},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,allowedProducts:['Armor 22'],
  });
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  assert.equal(prepared.capabilityAction,'ANSWER_ONLY');
});

test('missing fact without decision impact cannot become a discovery question',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'busco un equipo',intent:'OTHER',state:{},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    missingFact:'uso principal',decisionImpact:false,
  } as any);
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  assert.equal(prepared.missingFact,null);
});

test('customer-facing sourcing language is rejected with natural fallback',async()=>{
  for(const text of ['Según la ficha técnica, tiene NFC.','Según la fuente consultada, tiene NFC.','Los datos recuperados indican que tiene NFC.']){
    const result=await safeWrite(capturingWriter(text),{
      message:'¿tiene NFC?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
      rag:[{text:'NFC: Sí.',source:'TEST:CONECTIVIDAD',score:1,section:'CONECTIVIDAD',domain:'PRODUCT',productId:'P-22'}],allowedProducts:['Armor 22'],
    },'Sí, tiene NFC.');
    assert.equal(result.answer,'Sí, tiene NFC.');
    assert.equal(result.fallback.error,'ROBOTIC_META_LANGUAGE');
  }
});

test('technical use of fuente de alimentación is not mistaken for internal sourcing language',async()=>{
  const result=await safeWrite(capturingWriter('La fuente de alimentación compatible se conecta por USB-C.'),{
    message:'¿cómo se conecta la fuente de alimentación?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    rag:[{text:'La fuente de alimentación compatible se conecta por USB-C.',source:'TEST:CARGA',score:1,section:'BATERIA',domain:'PRODUCT',productId:'P-22'}],allowedProducts:['Armor 22'],
  },'Se conecta por USB-C.');
  assert.equal(result.fallback.error,undefined);
  assert.match(result.answer,/fuente de alimentación/i);
});

test('writer cannot invent an unsupported operational action',async()=>{
  const result=await safeWrite(capturingWriter('Te agendo una prueba del equipo para mañana.'),{
    message:'quiero conocerlo',intent:'PRODUCT_INFO',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    allowedProducts:['Armor 22'],
  },'Puedo contarte sus características confirmadas.');
  assert.equal(result.answer,'Puedo contarte sus características confirmadas.');
  assert.equal(result.fallback.error,'UNSUPPORTED_OPERATIONAL_PROMISE');
});

test('writer blocks the real demo promise even when phrased as coordination',async()=>{
  const result=await safeWrite(capturingWriter('Perfecto: puedo agendar la prueba del equipo; yo coordino y te confirmo luego.'),{
    message:'¿Pueden agendarme una prueba del equipo?',intent:'OTHER',state:{activeProduct:'Armor 22'},
    decision:{nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Armor 22'],
  },'No tengo habilitada una agenda de pruebas desde aquí.');
  assert.equal(result.answer,'No tengo habilitada una agenda de pruebas desde aquí.');
  assert.equal(result.fallback.error,'UNSUPPORTED_OPERATIONAL_PROMISE');
});

test('writer cannot replace ANSWER_ONLY with a recommendation CTA',async()=>{
  const result=await safeWrite(capturingWriter('Te recomiendo el Armor 22.'),{
    message:'¿Tiene NFC?',intent:'CAPABILITY',state:{activeProduct:'Armor 22'},decision:{nextBestAction:'ANSWER_ONLY'} as any,
    allowedProducts:['Armor 22'],rag:[{text:'NFC: Sí.',source:'TEST:CONECTIVIDAD',section:'CONECTIVIDAD',domain:'PRODUCT',productId:'P-22'}],
  },'Sí, tiene NFC.');
  assert.equal(result.answer,'Sí, tiene NFC.');
  assert.equal(result.fallback.error,'UNAUTHORIZED_COMMERCIAL_ACTION');
});

test('ASK_MISSING_FACT rejects a question the backend cannot consume',async()=>{
  const result=await safeWrite(capturingWriter('¿En qué ciudad y a qué hora quieres la demo?'),{
    message:'busco un equipo',intent:'OTHER',state:{},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    missingFact:'presupuesto máximo',decisionImpact:true,
  } as any,'¿Cuál es tu presupuesto máximo?');
  assert.equal(result.answer,'¿Cuál es tu presupuesto máximo?');
  assert.equal(result.fallback.error,'UNPROCESSABLE_QUESTION');
});

test('price objection is acknowledged before asking the missing budget',async()=>{
  const result=await safeWrite(capturingWriter('¿Hasta cuánto quieres llegar?'),{
    message:'Está muy caro, ¿qué alternativa tienes?',intent:'HANDLE_PRICE_OBJECTION',state:{activeProduct:'Armor X13',objection:'precio'},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,missingFact:'presupuesto máximo',decisionImpact:true,
  } as any,'Entiendo; busquemos una opción que se ajuste mejor. ¿Hasta cuánto quieres llegar?');
  assert.match(result.answer,/entiendo|claro|se sale|ajuste|c[oó]modo/i);
  assert.match(result.answer,/\?/);
});

test('price objection fallback removes irrelevant fact-unknown prose before asking budget',async()=>{
  const result=await safeWrite(capturingWriter('Te recomiendo otra alternativa.'),{
    message:'Está muy caro, ¿qué alternativa tienes?',intent:'HANDLE_PRICE_OBJECTION',state:{activeProduct:'Armor X13',objection:'precio'},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,missingFact:'presupuesto máximo',decisionImpact:true,
  } as any,'Sobre Armor X12 Pro, ese detalle no está especificado.');
  assert.doesNotMatch(result.answer,/detalle no est[aá] especificado|no tengo confirmado/i);
  assert.match(result.answer,/entiendo|claro|ajuste|c[oó]mod|alto|caro/i);
  assert.match(result.answer,/presupuesto|hasta cu[aá]nto|tope/i);
});

test('soft close fallback consumes budget without an unrelated fact-unknown disclaimer',async()=>{
  const result=await safeWrite(capturingWriter('Te recomiendo el Armor 22.'),{
    message:'máximo 1500',intent:'RECOMMEND_WITHIN_BUDGET',state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',budget:1500,interestSignal:true},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',price:1199,stock:4,currency:'PEN',source:'FAKE_TEST_DATA'},
  },'Sobre Armor 22, ese detalle no está especificado.');
  assert.doesNotMatch(result.answer,/detalle no est[aá] especificado|no tengo confirmado/i);
  assert.match(result.answer,/presupuesto|informaci[oó]n|contexto|listo/i);
  assert.match(result.answer,/disponibilidad|avanzar/i);
});

test('budget-driven recommendation change is communicated before soft close',async()=>{
  const result=await safeWrite(capturingWriter('Listo, tomo esa información como referencia.'),{
    message:'máximo 1500',intent:'RECOMMEND_WITHIN_BUDGET',
    state:{activeProduct:'Armor X12 Pro',recommendedProduct:'Armor 22',budget:1500,priorities:['resistencia','bateria']},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,allowedProducts:['Armor X12 Pro','Armor 22'],
    previousRecommendedProduct:'Armor X12 Pro',recommendedProduct:'Armor 22',
    recommendationChanged:true,recommendationChangeReason:'batería 6600 mAh y carga 33 W',
    rag:[{text:'Batería: 6600 mAh. Carga: 33 W.',source:'TEST:BATERIA',section:'BATERIA',domain:'PRODUCT',productId:'P-22'}],
    quote:{product:'Armor 22',price:1199,stock:4,currency:'PEN',source:'FAKE_TEST_DATA'},
  } as any,'Listo, tomo esa información como referencia.');
  assert.match(result.answer,/Armor X12 Pro/i);
  assert.match(result.answer,/Armor 22/i);
  assert.match(result.answer,/cambi|ahora.*recom/i);
  assert.match(result.answer,/bater[ií]a|6600|33 W/i);
  assert.match(result.answer,/disponibilidad|stock/i);
  assert.equal((result as any).recommendationContinuity?.communicated,true);
  assert.equal(result.nextBestAction,'SOFT_CLOSE');
});

test('recommendation change without a verified reason cannot advance the new product',async()=>{
  const result=await safeWrite(capturingWriter('¿Quieres que revise disponibilidad?'),{
    message:'máximo 1500',intent:'RECOMMEND_WITHIN_BUDGET',
    state:{activeProduct:'Product A',recommendedProduct:'Product B',budget:1500},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,allowedProducts:['Product A','Product B'],
    previousRecommendedProduct:'Product A',recommendedProduct:'Product B',recommendationChanged:true,
  } as any,'Listo, tomo esa información como referencia.');
  assert.equal(result.nextBestAction,'ANSWER_ONLY');
  assert.equal((result as any).recommendationContinuity?.allowed,false);
  assert.equal((result as any).recommendationContinuity?.effectiveRecommendedProduct,'Product A');
  assert.doesNotMatch(result.answer,/stock|disponibilidad|Product B/i);
});

test('ANSWER_ONLY question salvage still passes through recommendation continuity',async()=>{
  const result=await safeWrite(capturingWriter('Ahora conviene Product B. ¿Quieres avanzar?'),{
    message:'máximo 1500',intent:'RECOMMEND_WITHIN_BUDGET',
    state:{activeProduct:'Product A',recommendedProduct:'Product B',budget:1500},
    decision:{nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Product A','Product B'],
    previousRecommendedProduct:'Product A',recommendedProduct:'Product B',recommendationChanged:true,
    recommendationChangeReason:'encaja en el presupuesto indicado',
  } as any,'Tomo en cuenta tu presupuesto.');
  assert.equal(result.nextBestAction,'ANSWER_ONLY');
  assert.equal(result.recommendationContinuity?.communicated,true);
  assert.match(result.answer,/Product A/i);
  assert.match(result.answer,/Product B/i);
  assert.match(result.answer,/cambi/i);
  assert.doesNotMatch(result.answer,/\?/);
});

test('budget question acknowledges known construction context',async()=>{
  const result=await safeWrite(capturingWriter('¿Cuál es tu presupuesto máximo?'),{
    message:'Trabajo en construcción, se me cae el celular.',intent:'EVALUATE_USE',
    state:{useCase:'trabajo',problem:'caidas_frecuentes',priorities:['resistencia_a_caidas']},
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,missingFact:'presupuesto máximo',decisionImpact:true,
  } as any,'¿Cuál es tu presupuesto máximo?');
  assert.match(result.answer,/trabajo|ca[ií]da|resistencia/i);
  assert.match(result.answer,/presupuesto/i);
});

test('unknown fact uses a natural no-action fallback',()=>{
  assert.equal(noEvidenceResponse(),'No tengo confirmado ese dato exacto.');
});

test('supportedCapabilities contains only operations whose turn preconditions pass',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Tiene NFC?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',useCase:'trabajo'},
    decision:{nextBestAction:'ANSWER_ONLY'} as any,allowedProducts:['Armor 22'],
    rag:[{text:'NFC: Sí.',source:'TEST:CONECTIVIDAD',domain:'PRODUCT',section:'CONECTIVIDAD',productId:'P-22'}],
  });
  assert.ok(prepared.supportedCapabilities?.includes('ANSWER_PRODUCT_FEATURE'));
  assert.equal(prepared.supportedCapabilities?.includes('ASK_USE_CASE'),false);
  assert.equal(prepared.supportedCapabilities?.includes('CHECK_PRICE'),false);
  assert.equal(prepared.supportedCapabilities?.includes('SCHEDULE_DEMO'),false);
});

test('writer receives only the final executable pending question and action',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Gracias.',intent:'OTHER',state:{pendingMissingFact:'presupuesto máximo',pendingCommercialAction:'ASK_MISSING_FACT',budget:1200},
    decision:{nextBestAction:'ANSWER_ONLY'} as any,
  });
  assert.equal(prepared.pendingQuestion,null);
  assert.equal(prepared.pendingAction,'ANSWER_ONLY');
});

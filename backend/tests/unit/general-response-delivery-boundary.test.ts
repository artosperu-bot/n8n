import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { renderCommercialMove } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { N8nAutomationBus } from '../../src/adapters/n8n/N8nAutomationBus.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider {
  return {
    async write(){
      return {text,model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};
    },
  };
}

test('missing RELATED_VALUE is repaired deterministically with the authorized commercial move',async()=>{
  const input:any={
    commercialContractPrepared:true,
    message:'¿Cuánta RAM física y RAM virtual tiene el Armor 22?',
    intent:'CAPABILITY',
    state:{activeProduct:'Armor 22',useCase:'usar el celular principalmente para WhatsApp y llamadas de manera simple y confiable'},
    directAnswer:'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.',
    nextBestAction:'RELATED_VALUE',
    executableNba:'RELATED_VALUE',
    finalExecutableNba:'RELATED_VALUE',
    decision:{nextBestAction:'RELATED_VALUE'},
    allowedProducts:['Armor 22'],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-ARMOR-22-256G',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'RAM_VIRTUAL',value:'hasta 8 GB',productId:'P-ARMOR-22-256G',source:'TEST'},
    ],
    commercialMove:{
      action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RAM_FISICA',
      verifiedFacts:[{domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-ARMOR-22-256G',source:'TEST'}],
      relevantCustomerContext:{useCase:'usar el celular principalmente para WhatsApp y llamadas de manera simple y confiable',problem:null,priorities:[],budget:null,objection:null},
    },
  };
  const result=await safeWrite(llm('Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.'),input,'fallback');
  assert.match(result.answer,/8 GB de RAM física/i);
  assert.match(result.answer,/\badem[aá]s\b/i,'the repaired +1 must be visibly separate from N');
  assert.match(result.answer,/(?:útil|ayuda|sirve|encaja|conviene)/i);
  assert.equal(result.fallback.delivered,true,'a deterministic repair should be considered delivered');
  assert.equal(result.fallback.error,undefined);
});

test('context and feature co-occurrence alone does not count as a delivered contextual benefit',async()=>{
  const input:any={
    commercialContractPrepared:true,
    message:'aguanta caidas?',
    intent:'CAPABILITY',
    state:{activeProduct:'Armor X13',useCase:'Protección contra caídas frecuentes en uso cotidiano y en entornos exigentes',problem:'caidas_frecuentes',priorities:['resistencia']},
    directAnswer:'Armor X13 tiene resistencia a caídas de 1.5 m.',
    nextBestAction:'RELATED_VALUE',
    executableNba:'RELATED_VALUE',
    finalExecutableNba:'RELATED_VALUE',
    decision:{nextBestAction:'RELATED_VALUE'},
    allowedProducts:['Armor X13'],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-X13',source:'TEST'}],
    commercialMove:{
      action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor X13',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA_CAIDAS',
      verifiedFacts:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-X13',source:'TEST'}],
      relevantCustomerContext:{useCase:'Protección contra caídas frecuentes en uso cotidiano y en entornos exigentes',problem:'caidas_frecuentes',priorities:['resistencia'],budget:null,objection:null},
    },
  };
  const onlyFeatureAndContext='Armor X13 tiene resistencia a caídas de 1.5 m para caídas frecuentes en uso cotidiano y entornos exigentes.';
  const result=await safeWrite(llm(onlyFeatureAndContext),input,'fallback');
  assert.match(result.answer,/\badem[aá]s\b/i,'the guard must append the authorized benefit when the writer only co-locates fact and context');
  assert.match(result.answer,/(?:útil|ayuda|sirve|encaja|conviene)/i);
  assert.equal(result.fallback.delivered,true);
  assert.equal(result.fallback.error,undefined);
});

test('availability continuation is customer-readable and not duplicated',async()=>{
  const input:any={
    commercialContractPrepared:true,
    message:'¿Cuánto pesa el Armor 22?',
    intent:'ATTRIBUTE',
    state:{activeProduct:'Armor 22'},
    directAnswer:'Armor 22 pesa 324 g.',
    nextBestAction:'RELATED_VALUE',
    executableNba:'RELATED_VALUE',
    finalExecutableNba:'RELATED_VALUE',
    decision:{nextBestAction:'RELATED_VALUE'},
    allowedProducts:['Armor 22'],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'PESO',value:'324 g',productId:'P-ARMOR-22-256G',source:'TEST'},
      {domain:'SQL',key:'DISPONIBILIDAD',value:'DISPONIBLE',productId:'P-ARMOR-22-256G',source:'SQL_BRIDGE'},
    ],
    commercialMove:{
      action:'RELATED_VALUE',kind:'RELATED_VERIFIED_FACT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'LIGHT_VERIFIED_CONTINUATION',basis:['VERIFIED_SQL_FACT'],attribute:'DISPONIBILIDAD',
      verifiedFacts:[{domain:'SQL',key:'DISPONIBILIDAD',value:'DISPONIBLE',productId:'P-ARMOR-22-256G',source:'SQL_BRIDGE'}],
      relevantCustomerContext:{useCase:null,problem:null,priorities:[],budget:null,objection:null},
    },
  };
  const result=await safeWrite(llm('Armor 22 pesa 324 g. Además: DISPONIBLE. También está disponible.'),input,'fallback');
  assert.doesNotMatch(result.answer,/\bDISPONIBLE\b/,'raw enum-like availability must not be customer-facing');
  assert.equal((result.answer.match(/est[aá] disponible/gi)??[]).length,1,'availability should be stated once');
});

test('comparison presentation is structurally compact even when the writer is verbose',async()=>{
  const verbose=[
    'Armor X13 vs Armor 22.',
    `Armor X13 ${'detalle técnico confirmado '.repeat(14)}`,
    `Armor 22 ${'otro detalle técnico confirmado '.repeat(14)}`,
    '- Batería: Armor 22 tiene mayor capacidad confirmada.',
    '- Cámara: Armor 22 tiene mayor resolución nominal confirmada.',
    '- Tamaño: Armor X13 es más liviano en la comparación.',
    '- Extra: esta cuarta viñeta no debe mostrarse.',
  ].join('\n');
  const result=await safeWrite(llm(verbose),{
    message:'comparalos',intent:'COMPARE',state:{comparisonProducts:['Armor X13','Armor 22']},
    decision:{nextBestAction:'ANSWER_ONLY'},allowedProducts:['Armor X13','Armor 22'],
    deterministicAnswer:'Compara ambos equipos.',
    rag:[
      {text:'Armor 22 batería mayor capacidad confirmada; cámara mayor resolución nominal confirmada.',source:'TEST',productId:'P-A22',section:'GENERAL',domain:'PRODUCT'},
      {text:'Armor X13 más liviano en la comparación.',source:'TEST',productId:'P-X13',section:'GENERAL',domain:'PRODUCT'},
    ],
  } as any,'No tengo suficiente información para comparar.');
  assert.ok(result.answer.length<=750,`comparison must stay chat-sized, got ${result.answer.length}`);
  assert.ok((result.answer.match(/^\s*-\s+/gm)??[]).length<=3);
  assert.match(result.answer,/Armor X13/i);
  assert.match(result.answer,/Armor 22/i);
});

test('n8n automation failure exposes a bounded response body for diagnosis',async()=>{
  const fetcher=async()=>new Response('{"error":"WORKFLOW_NOT_ACTIVE"}',{status:500,headers:{'content-type':'application/json'}});
  const bus=new N8nAutomationBus({url:'https://n8n.example.test/webhook/events',fetcher:fetcher as typeof fetch});
  const result=await bus.publish({type:'conversation.turn.completed',occurredAt:new Date(0).toISOString(),sessionId:'s1',payload:{}} as any);
  assert.equal(result.delivered,false);
  assert.match(String(result.error),/HTTP 500/i);
  assert.match(String(result.error),/WORKFLOW_NOT_ACTIVE/i,'error body must survive in sanitized bounded diagnostics');
});

test('contextual benefit never verbalizes internal use-case prose literally',()=>{
  const text=renderCommercialMove({
    action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor X13',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA_CAIDAS',
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-X13',source:'TEST'}],
    relevantCustomerContext:{useCase:'Uso en entornos con caídas frecuentes; dispositivo que resista impactos por caídas de hasta ~1.5 m',problem:'caidas_frecuentes',priorities:['resistencia'],budget:null,objection:null},
  } as any,'CAPABILITY')??'';
  assert.doesNotMatch(text,/Uso en entornos|dispositivo que|;/i);
  assert.ok(text.length<=150,`benefit must stay conversational, got ${text.length}`);
  assert.match(text,/ca[ií]d|resisten|prote/i);
});

test('RELATED_VALUE keeps one useful continuation instead of stacking extra mini-catalog blocks',async()=>{
  const input:any={
    commercialContractPrepared:true,message:'¿Cuánta RAM física y RAM virtual tiene el Armor 22?',intent:'CAPABILITY',
    state:{activeProduct:'Armor 22',useCase:'WhatsApp y llamadas'},directAnswer:'Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.',
    nextBestAction:'RELATED_VALUE',executableNba:'RELATED_VALUE',finalExecutableNba:'RELATED_VALUE',decision:{nextBestAction:'RELATED_VALUE'},allowedProducts:['Armor 22'],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-ARMOR-22-256G',source:'TEST'}],
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RAM_FISICA',verifiedFacts:[{domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-ARMOR-22-256G',source:'TEST'}],relevantCustomerContext:{useCase:'WhatsApp y llamadas',problem:null,priorities:['simplicidad'],budget:null,objection:null}},
  };
  const verbose='Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual.\n- Contexto útil: almacenamiento interno 256 GB y microSD dedicada hasta 512 GB, conveniente si quieres respaldo o apps. Además, para WhatsApp y llamadas, este dato puede ser útil al elegir el equipo.';
  const result=await safeWrite(llm(verbose),input,'fallback');
  assert.doesNotMatch(result.answer,/Contexto útil|microSD|512 GB/i);
  assert.match(result.answer,/8 GB de RAM física/i);
  assert.match(result.answer,/WhatsApp|llamadas/i);
  assert.ok(result.answer.length<=260,`N+1 should stay compact, got ${result.answer.length}`);
});

test('SPIN acknowledgement uses customer language instead of internal priority labels',async()=>{
  const input:any={
    commercialContractPrepared:true,message:'Quiero un celular para uso simple, WhatsApp y llamadas.',intent:'OTHER',
    state:{useCase:'uso simple, WhatsApp y llamadas',priorities:['simplicidad','comunicaciones (WhatsApp y llamadas)']},
    useCase:'uso simple, WhatsApp y llamadas',priorities:['simplicidad','comunicaciones (WhatsApp y llamadas)'],
    decisionImpact:true,missingFact:'presupuesto máximo',nextBestAction:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',decision:{nextBestAction:'ASK_MISSING_FACT'},allowedProducts:[],
  };
  const result=await safeWrite(llm('¿Cuál es tu presupuesto máximo para el celular?'),input,'fallback');
  assert.doesNotMatch(result.answer,/tomo en cuenta simplicidad/i);
  assert.match(result.answer,/WhatsApp|llamadas|uso simple/i);
  assert.match(result.answer,/presupuesto/i);
});

test('price objection stays consultative instead of dumping a mini catalog',async()=>{
  const input:any={
    commercialContractPrepared:true,message:'Está muy caro, ¿qué alternativa tienes?',intent:'HANDLE_PRICE_OBJECTION',
    state:{activeProduct:'Armor X12 Pro',problem:'precio alto',objection:'precio'},problem:'precio alto',objection:'precio',
    nextBestAction:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',missingFact:'presupuesto máximo',decision:{nextBestAction:'ASK_MISSING_FACT'},allowedProducts:['Armor X12 Pro'],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'4 GB',productId:'P-X12',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'BATERIA',value:'4860 mAh',productId:'P-X12',source:'TEST'},
    ],
  };
  const verbose='Entiendo la objeción; una alternativa recomendada: Armor X12 Pro.\n- Memoria: 4 GB de RAM física + hasta 4 GB de RAM virtual; 64 GB de almacenamiento interno y microSD dedicada.\n- Conectividad: NFC, Wi-Fi, Bluetooth 5, Dual SIM, USB Type-C 2.0.\n- Otros: Procesador MediaTek Helio G36; Android 15; peso 257 g; grosor 14.34 mm.\n¿Cuál es tu presupuesto máximo?';
  const result=await safeWrite(llm(verbose),input,'fallback');
  assert.ok(result.answer.length<=360,`objection response should be compact, got ${result.answer.length}`);
  assert.ok((result.answer.match(/^\s*-\s+/gm)??[]).length<=2,'objection should not dump three technical blocks');
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';
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
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],interestSignal:true,purchaseSignal:false,commercialStage:'EVALUACION'},
    decision:{nextBestAction:'RECOMMEND'} as any,
    rag:[{text:'Resistencia a caídas: 1.5 m. Certificación IP68: Sí.',source:'TEST:RESISTENCIA',score:1,section:'RESISTENCIA',domain:'PRODUCT',productId:'P-22'}],
    allowedProducts:['Armor 22'],
  },'Te recomiendo Armor 22 por su resistencia confirmada.');

  assert.equal(captured.nextBestAction,'RECOMMEND');
  assert.equal(captured.commercialStage,'EVALUACION');
  assert.deepEqual(captured.knownFacts.useCase,'trabajo en construcción');
  assert.equal(captured.interestSignal,true);
  assert.equal(captured.purchaseSignal,false);
  assert.equal(captured.activeProduct,'Armor 22');
  assert.equal(captured.recommendedProduct,'Armor 22');
  assert.deepEqual(captured.priorities,['resistencia']);
  assert.ok(captured.verifiedFeatures.some((f:any)=>f.key==='RESISTENCIA'));
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
  assert.equal(result.answer,'Tiene 8 GB de RAM física y hasta 8 GB de RAM virtual.');
  assert.equal(result.fallback.error,'RAM_VIRTUAL_CONFLATION');
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

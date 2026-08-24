import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullRagAnswer } from '../../src/conversation/commercial/FullRagAnswerKernel.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { reduceState } from '../../src/conversation/state/StateReducer.ts';

function rag(product:string,productId:string,section:string,text:string):any{
  return {domain:'PRODUCT',productId,section,source:`TEST:${section}`,text:`Producto: ${product}\n${text}`};
}

const armor22=[
  rag('Armor 22','P-22','RENDIMIENTO','- Procesador: MediaTek Helio G96.\n- GPU: Mali-G57 MC2.'),
  rag('Armor 22','P-22','MEMORIA','- RAM física: 8 GB.\n- RAM virtual máxima: 8 GB.\n- Almacenamiento interno: 256 GB.\n- microSD máxima: 512 GB.'),
  rag('Armor 22','P-22','BATERIA','- Capacidad de batería: 6600 mAh.\n- Carga cableada: 33 W.'),
  rag('Armor 22','P-22','RESISTENCIA','- Certificación IP68: Sí.\n- Certificación IP69K: Sí.\n- MIL-STD-810H: Sí.\n- Resistencia a caídas: 1.5 m.\n- Profundidad IP68: 1.5 m.\n- Tiempo IP68: 30 min.'),
  rag('Armor 22','P-22','CAMARA','- Cámara principal: 64 MP.\n- Cámara frontal: 8 MP.\n- Cámara de visión nocturna: 64 MP.\n- Resolución máxima de video: 2K.'),
  rag('Armor 22','P-22','PANTALLA','- Tamaño de pantalla: 6.58 pulgadas.\n- Frecuencia de pantalla: 120 Hz.\n- Resolución de pantalla: 1080 x 2408.'),
];

const armorX13=[
  rag('Armor X13','P-X13','RENDIMIENTO','- Procesador: MediaTek Helio G36.'),
  rag('Armor X13','P-X13','MEMORIA','- RAM física: 6 GB.\n- RAM virtual máxima: 6 GB.\n- Almacenamiento interno: 64 GB.'),
  rag('Armor X13','P-X13','BATERIA','- Capacidad de batería: 6320 mAh.\n- Carga cableada: 10 W.'),
  rag('Armor X13','P-X13','RESISTENCIA','- Certificación IP68: Sí.\n- Certificación IP69K: Sí.\n- MIL-STD-810H: Sí.\n- Resistencia a caídas: 1.5 m.'),
  rag('Armor X13','P-X13','CAMARA','- Cámara principal: 50 MP.\n- Cámara de visión nocturna: 24 MP.\n- Resolución máxima de video: 1080p.'),
  rag('Armor X13','P-X13','PANTALLA','- Tamaño de pantalla: 6.52 pulgadas.'),
];

test('overview uses six separated commercial blocks, includes virtual RAM and one FAB line',()=>{
  const result=buildFullRagAnswer({message:'Info del Armor 22',intent:'PRODUCT_INFO',resolvedProduct:'Armor 22',state:{},rag:armor22} as any);
  assert.ok(result);
  const points=result!.answer.split('\n').filter(line=>/^\d+\.\s/.test(line));
  assert.equal(points.length,6);
  assert.match(result!.answer,/1\. Rendimiento:/);
  assert.match(result!.answer,/2\. Memoria:/);
  assert.match(result!.answer,/8 GB de RAM física/i);
  assert.match(result!.answer,/8 GB de RAM virtual/i);
  assert.match(result!.answer,/3\. Batería:/);
  assert.match(result!.answer,/4\. Resistencia:/);
  assert.match(result!.answer,/5\. Cámaras:/);
  assert.match(result!.answer,/6\. Pantalla:/);
  assert.equal((result!.answer.match(/En la práctica:/g)??[]).length,1);
});

test('state remembers explored products by recency without selecting or recommending them',()=>{
  const first=reduceState({}, {lastIntent:'PRODUCT_INFO',lastRoute:'RAG_PRODUCT',queryTarget:'Armor 22',salientProduct:'Armor 22',activeProduct:'Armor 22'} as any);
  assert.deepEqual(first.exploredProducts,['Armor 22']);
  const second=reduceState(first,{lastIntent:'PRODUCT_INFO',lastRoute:'RAG_PRODUCT',queryTarget:'Armor X13',salientProduct:'Armor X13',activeProduct:'Armor X13'} as any);
  assert.deepEqual(second.exploredProducts,['Armor 22','Armor X13']);
  assert.deepEqual(second.comparisonProducts,['Armor 22','Armor X13']);
  assert.equal(second.selectedProduct??null,null);
  assert.equal(second.recommendedProduct??null,null);
});

test('natural product browsing does not compare until customer asks to choose or compare',()=>{
  assert.equal(resolveIntentPlan('Y el Armor X13 qué tal?').primary,'PRODUCT_INFO');
  assert.equal(resolveIntentPlan('Ya vi los dos, cuál me conviene?').primary,'COMPARE');
  assert.equal(resolveIntentPlan('Qué diferencia hay entre los dos?').primary,'COMPARE');
  assert.equal(resolveIntentPlan('Con cuál te quedarías para trabajo?').primary,'COMPARE');
});

test('focused capability FAB remains part of N and does not become RELATED_VALUE automatically',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'CAPABILITY',currentNba:'ANSWER_ONLY',state:{useCase:'trabajo en construcción',priorities:['resistencia']},resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,relatedValueAvailable:true});
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

test('comparison uses remembered customer priority before generic catalog differences',()=>{
  const result=buildFullRagAnswer({message:'Ya vi los dos, cuál me conviene?',intent:'COMPARE',state:{priorities:['bateria'],comparisonProducts:['Armor 22','Armor X13']},rag:[...armor22,...armorX13]} as any);
  assert.ok(result);
  assert.match(result!.answer,/bater/i);
  assert.match(result!.answer,/6600/);
  assert.match(result!.answer,/6320/);
  assert.doesNotMatch(result!.answer,/64 MP principal/i);
});

test('gaming comparison uses processor, RAM and display instead of collapsing gaming into processor only',()=>{
  const result=buildFullRagAnswer({message:'De los dos cuál conviene para Free Fire?',intent:'COMPARE',state:{comparisonProducts:['Armor 22','Armor X13']},rag:[...armor22,...armorX13]} as any);
  assert.ok(result);
  assert.match(result!.answer,/Helio G96/i);
  assert.match(result!.answer,/8 GB de RAM física/i);
  assert.match(result!.answer,/120 Hz/i);
});

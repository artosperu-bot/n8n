import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCommercialPersistence } from '../../src/adapters/supabase/PersistenceProjection.ts';

test('turn event stores only newly detected commercial facts, while context keeps accumulated memory',()=>{
  const previous={useCase:'trabajo_construccion',priorities:['resistencia'],spinFacts:['uso:trabajo_construccion','prioridad:resistencia']};
  const current={...previous,problem:'caidas_frecuentes',spinFacts:[...previous.spinFacts,'problema:caidas_frecuentes'],lastSpinContribution:'PROBLEMA'};
  const p=projectCommercialPersistence(previous,current,{messageId:'m2'});
  assert.equal(p.turn.actividad_detectada,null);
  assert.deepEqual(p.turn.problemas_detectados,['caidas_frecuentes']);
  assert.deepEqual(p.turn.prioridades_detectadas,[]);
  assert.equal(p.context.customer.useCase,'trabajo_construccion');
  assert.equal(p.context.customer.problem,'caidas_frecuentes');
  assert.deepEqual(p.context.customer.priorities,['resistencia']);
});

test('problem does not fabricate an implication',()=>{
  const p=projectCommercialPersistence({}, {problem:'caidas_frecuentes',spinFacts:['problema:caidas_frecuentes'],lastSpinContribution:'PROBLEMA'}, {messageId:'m1'});
  assert.deepEqual(p.turn.implicaciones_detectadas,[]);
  assert.deepEqual(p.context.customer.implications,[]);
});

test('only explicit new implication facts are persisted as implications',()=>{
  const previous={problem:'caidas_frecuentes',spinFacts:['problema:caidas_frecuentes']};
  const current={...previous,spinFacts:[...previous.spinFacts,'implicacion:perdida_tiempo_interrupcion'],lastSpinContribution:'IMPLICACION'};
  const p=projectCommercialPersistence(previous,current,{messageId:'m2'});
  assert.deepEqual(p.turn.implicaciones_detectadas,['perdida_tiempo_interrupcion']);
  assert.deepEqual(p.context.customer.implications,['perdida_tiempo_interrupcion']);
});

test('ANSWER_ONLY creates no pending action and ASK_MISSING_FACT creates a typed pending question',()=>{
  const answer=projectCommercialPersistence({}, {lastNba:'ANSWER_ONLY',pendingCommercialAction:'ANSWER_ONLY'}, {messageId:'m1'});
  assert.equal(answer.turn.accion_pendiente_turno,null);
  assert.equal(answer.context.pendingAction,null);

  const ask=projectCommercialPersistence({}, {lastNba:'ASK_MISSING_FACT',pendingMissingFact:'impacto del problema',pendingCommercialAction:'ASK_MISSING_FACT'}, {messageId:'m2'});
  assert.deepEqual(ask.turn.pregunta_pendiente_turno,{kind:'DISCOVERY',target:'IMPLICATION',status:'PENDING',createdMessageId:'m2'});
  assert.equal(ask.turn.accion_pendiente_turno,null);
});

test('purchase signal remains a current-state fact and is not inferred from interest or pending actions',()=>{
  const p=projectCommercialPersistence({}, {levelOfInterest:90,interestEvents:['PRICE:X','STOCK:X'],purchaseSignal:false,lastNba:'SOFT_CLOSE'}, {messageId:'m1'});
  assert.equal(p.context.commercial.purchaseSignal,false);
  assert.equal(p.context.commercial.interestLevel,90);
});

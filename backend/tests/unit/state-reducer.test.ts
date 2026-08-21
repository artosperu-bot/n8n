import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceState } from '../../src/conversation/state/StateReducer.ts';

test('spin helper field is not leaked into canonical persisted state',()=>{
  const s=reduceState({spinFacts:[]},{budget:1500,spinResidual:'lo quiero para trabajo'});
  assert.deepEqual(s.spinFacts,['lo quiero para trabajo']);
  assert.equal(Object.prototype.hasOwnProperty.call(s,'spinResidual'),false);
});

test('policy followup does not erase an active assisted quote journey',()=>{
  const s=reduceState({
    handoffActive:true,
    blockAutomaticReply:true,
    handoffReason:'COTIZACION_LISTA_PARA_ASESOR',
    pendingCommercialAction:'ASSISTED_HANDOFF',
    lastIntent:'QUOTE',
    commercialStage:'CIERRE_ASISTIDO',
    commercialStrategy:'CIERRE_PROGRESIVO',
    quantity:20,
  },{
    lastIntent:'POLICY',
    lastNba:'ANSWER_ONLY',
    pendingCommercialAction:'ANSWER_ONLY',
    handoffActive:false,
    blockAutomaticReply:false,
    handoffReason:null,
    commercialStage:'DESCUBRIMIENTO',
    commercialStrategy:'RESPUESTA_DIRECTA',
  });
  assert.equal(s.handoffActive,true);
  assert.equal(s.blockAutomaticReply,true);
  assert.equal(s.handoffReason,'COTIZACION_LISTA_PARA_ASESOR');
  assert.equal(s.lastNba,'ANSWER_ONLY');
  assert.equal(s.pendingCommercialAction,'ASSISTED_HANDOFF');
  assert.equal(s.commercialStage,'CIERRE_ASISTIDO');
  assert.equal(s.commercialStrategy,'CIERRE_PROGRESIVO');
});

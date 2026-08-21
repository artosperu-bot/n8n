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

test('recommendation winner becomes active followup focus without becoming selected',()=>{
  const s=reduceState({
    sessionId:'qa-demo',
    activeProduct:'Armor X12 Pro',
    activeProductId:'P-ARMOR-X12Pro',
    activeProductCode:'P000047',
    queryTarget:'Armor X12 Pro',
    salientProduct:'Armor X12 Pro',
    selectedProduct:null,
    recommendedProduct:'Armor X12 Pro',
  },{
    lastIntent:'RECOMMEND_WITHIN_BUDGET',
    lastRoute:'RAG_RECOMMENDATION',
    activeProduct:'Armor X12 Pro',
    activeProductId:'P-ARMOR-X12Pro',
    activeProductCode:'P000047',
    queryTarget:'Armor X12 Pro',
    salientProduct:'Armor 22',
    selectedProduct:null,
    recommendedProduct:'Armor 22',
    lastResolvedProductId:'P-ARMOR-22-256G',
    lastResolvedProductCode:'P000049',
    lastDecisionTrace:{
      deterministicIntent:'RECOMMEND_WITHIN_BUDGET',plannerIntent:'RECOMMENDATION',finalIntent:'RECOMMEND_WITHIN_BUDGET',route:'RAG_RECOMMENDATION',nextBestAction:'RECOMMEND',targetProduct:'Armor X12 Pro',recommendation:null,
    },
  });
  assert.equal(s.activeProduct,'Armor 22');
  assert.equal(s.activeProductId,'P-ARMOR-22-256G');
  assert.equal(s.activeProductCode,'P000049');
  assert.equal(s.queryTarget,'Armor 22');
  assert.equal(s.salientProduct,'Armor 22');
  assert.equal(s.selectedProduct,null);
  const flow=(s.lastDecisionTrace as any)?.productFlow;
  assert.equal(flow?.before?.activeProduct,'Armor X12 Pro');
  assert.equal(flow?.after?.activeProduct,'Armor 22');
  assert.equal(flow?.reason,'RECOMMENDATION_WINNER_FOCUS');
});

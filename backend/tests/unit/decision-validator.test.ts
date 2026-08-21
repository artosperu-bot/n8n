import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import type { TurnDecision } from '../../src/ports/LlmProvider.ts';

function decision(patch: Partial<TurnDecision>): TurnDecision {
  return {
    primaryIntent:'OTHER', secondaryIntents:[], targetProduct:null, mentionedProducts:[], referenceType:null,
    explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null,
    customerProblem:null, priorities:[], objection:null, commercialStage:null, spinContribution:null,
    nextBestAction:null, needsSql:false, needsProductRag:false, needsInstitutionalRag:false, confidence:0.9,
    ...patch,
  };
}

test('recent explicit selection beats stale recommendation for selection reference', () => {
  const r = validateTurnDecision(decision({
    primaryIntent:'PURCHASE', targetProduct:'Armor 25T Pro', referenceType:'SELECTION',
    selectedProduct:'Armor 25T Pro', explicitSwitch:false, nextBestAction:'ASK_BUDGET'
  }), {
    activeProduct:'Armor 22', selectedProduct:'Armor 22', salientProduct:'Armor 22', recommendedProduct:'Armor 25T Pro',
    comparisonProducts:['Armor X13','Armor 22']
  }, ['Armor X13','Armor 22','Armor 25T Pro']);
  assert.equal(r.targetProduct,'Armor 22');
  assert.equal(r.selectedProduct,'Armor 22');
  assert.equal(r.nextBestAction,'COLLECT_RESERVATION_DATA');
});

test('mere product mention cannot become an explicit switch without selection', () => {
  const r = validateTurnDecision(decision({
    primaryIntent:'ATTRIBUTE', targetProduct:'Armor 22', mentionedProducts:['Armor 22'], explicitSwitch:true, selectedProduct:null
  }), { activeProduct:'Armor X13' }, ['Armor X13','Armor 22']);
  assert.equal(r.explicitSwitch,false);
});

test('unknown requested model remains a SQL lookup target so alternatives can be recovered', () => {
  const r = validateTurnDecision(decision({ primaryIntent:'PRODUCT_INFO', targetProduct:'Armor 30', needsSql:false }), {}, ['Armor X13','Armor 22']);
  assert.equal(r.targetProduct,'Armor 30');
  assert.equal(r.needsSql,true);
});

test('validator accepts only bounded contextual N+1 actions proposed by the planner', () => {
  for (const action of ['ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE'] as const) {
    const r = validateTurnDecision(decision({ primaryIntent:'OTHER', nextBestAction:action }), {});
    assert.equal(r.nextBestAction, action);
  }
  const invalid = validateTurnDecision(decision({ primaryIntent:'OTHER', nextBestAction:'DO_RANDOM_THING' }), {});
  assert.equal(invalid.nextBestAction, null);
});

test('factual price cannot be escalated to assisted handoff without a purchase signal', () => {
  const planner = decision({ primaryIntent:'PRICE', nextBestAction:'ASSISTED_HANDOFF' });
  const deterministic = decision({ primaryIntent:'PRICE', nextBestAction:'ANSWER_ONLY' });
  const r = validateTurnDecision(planner, { purchaseSignal:false }, ['Armor X13'], deterministic);
  assert.equal(r.nextBestAction,'ANSWER_ONLY');
});

test('two or more units remain assisted handoff',()=>{
  const r=validateTurnDecision(decision({primaryIntent:'PURCHASE',targetProduct:'Armor X13'}),{quantity:2,purchaseSignal:true},['Armor X13']);
  assert.equal(r.nextBestAction,'ASSISTED_HANDOFF');
});

test('specific deterministic attribute intent beats generic PRODUCT_INFO from planner',()=>{
  const planner=decision({
    primaryIntent:'PRODUCT_INFO',
    targetProduct:'Armor 22',
    attributes:[],
    nextBestAction:'ANSWER_ONLY',
  });
  const deterministic=decision({
    primaryIntent:'CAPABILITY',
    targetProduct:'Armor 22',
    attributes:['SEGURIDAD'],
    nextBestAction:'ANSWER_ONLY',
    confidence:0.99,
  });
  const r=validateTurnDecision(planner,{activeProduct:'Armor 22'},['Armor 22'],deterministic);
  assert.equal(r.primaryIntent,'CAPABILITY');
  assert.deepEqual(r.attributes,['SEGURIDAD']);
  assert.equal(r.nextBestAction,'ANSWER_ONLY');
});

test('planner cannot turn a named factual query into an explicit product selection',()=>{
  const planner=decision({
    primaryIntent:'PRICE',targetProduct:'Armor X13',mentionedProducts:['Armor X13'],selectedProduct:'Armor X13',explicitSwitch:true,referenceType:'NAMED_QUERY_TARGET',
  });
  const deterministic=decision({
    primaryIntent:'PRICE',targetProduct:'Armor X13',mentionedProducts:['Armor X13'],selectedProduct:null,explicitSwitch:false,referenceType:'NAMED_QUERY_TARGET',nextBestAction:'ANSWER_ONLY',
  });
  const r=validateTurnDecision(planner,{activeProduct:null,selectedProduct:null},['Armor X13','Armor 22'],deterministic);
  assert.equal(r.targetProduct,'Armor X13');
  assert.equal(r.selectedProduct,null);
  assert.equal(r.explicitSwitch,false);
});

test('mentioning a second canonical product builds a comparison pair instead of switching',()=>{
  const planner=decision({
    primaryIntent:'PRODUCT_INFO',targetProduct:'Armor 22',mentionedProducts:['Armor 22'],selectedProduct:'Armor 22',explicitSwitch:true,
  });
  const deterministic=decision({
    primaryIntent:'PRODUCT_INFO',targetProduct:'Armor 22',mentionedProducts:['Armor 22'],selectedProduct:null,explicitSwitch:false,referenceType:'NAMED_QUERY_TARGET',nextBestAction:'ANSWER_ONLY',
  });
  const r=validateTurnDecision(planner,{activeProduct:'Armor X13',selectedProduct:null},['Armor X13','Armor 22'],deterministic);
  assert.equal(r.explicitSwitch,false);
  assert.equal(r.selectedProduct,null);
  assert.deepEqual(r.comparisonProducts,['Armor X13','Armor 22']);
});

test('generic need phrase cannot survive validation as if it were a product model',()=>{
  const planner=decision({
    primaryIntent:'CAPABILITY',targetProduct:'cámara resistente para fotos de trabajos y redes sociales',mentionedProducts:['cámara resistente para fotos de trabajos y redes sociales'],
  });
  const deterministic=decision({primaryIntent:'CAPABILITY',targetProduct:null,attributes:['CAMARA'],nextBestAction:'ANSWER_ONLY'});
  const r=validateTurnDecision(planner,{},['Armor X12 Pro','Armor X13','Armor 22'],deterministic);
  assert.equal(r.targetProduct,null);
  assert.deepEqual(r.mentionedProducts,[]);
});

test('short catalog alias from planner is canonicalized instead of persisting raw numeric model text',()=>{
  const planner=decision({primaryIntent:'COMPARE',targetProduct:'22',mentionedProducts:['22'],comparisonProducts:['Armor X13','22']});
  const deterministic=decision({primaryIntent:'COMPARE',targetProduct:'Armor 22',mentionedProducts:['Armor 22'],comparisonProducts:['Armor X13','Armor 22'],referenceType:'NAMED_QUERY_TARGET'});
  const r=validateTurnDecision(planner,{activeProduct:'Armor X13',comparisonProducts:['Armor X13','Armor 22']},['Armor X13','Armor 22'],deterministic);
  assert.equal(r.targetProduct,'Armor 22');
  assert.deepEqual(r.comparisonProducts,['Armor X13','Armor 22']);
  assert.ok(!r.mentionedProducts.includes('22'));
});

test('ambiguous factual followup keeps canonical active product even if planner proposes another target',()=>{
  const planner=decision({primaryIntent:'STOCK',targetProduct:'Armor X12 Pro',mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK'});
  const deterministic=decision({primaryIntent:'STOCK',targetProduct:'Armor X13',mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',nextBestAction:'ANSWER_ONLY'});
  const r=validateTurnDecision(planner,{activeProduct:'Armor X13'},['Armor X12 Pro'],deterministic);
  assert.equal(r.targetProduct,'Armor X13');
  assert.equal(r.selectedProduct,null);
});

test('explicit purchase with one canonical SQL candidate overrides stale active product',()=>{
  const planner=decision({primaryIntent:'PURCHASE',targetProduct:'Armor X12 Pro',selectedProduct:'Armor X12 Pro',referenceType:'ACTIVE_PRODUCT_FALLBACK'});
  const deterministic=decision({primaryIntent:'PURCHASE',targetProduct:'Armor X12 Pro',selectedProduct:null,referenceType:'ACTIVE_PRODUCT_FALLBACK',nextBestAction:'COLLECT_RESERVATION_DATA'});
  const r=validateTurnDecision(planner,{activeProduct:'Armor X12 Pro',selectedProduct:null},['Armor 22'],deterministic);
  assert.equal(r.targetProduct,'Armor 22');
  assert.equal(r.selectedProduct,'Armor 22');
  assert.equal(r.explicitSwitch,true);
});

test('canonical planner target from current SQL candidates beats stale active fallback',()=>{
  const planner=decision({
    primaryIntent:'PURCHASE',
    targetProduct:'Armor 22',
    mentionedProducts:[],
    referenceType:'NAMED_QUERY_TARGET',
    nextBestAction:'COLLECT_RESERVATION_DATA',
  });
  const deterministic=decision({
    primaryIntent:'PURCHASE',
    targetProduct:'Armor X13',
    mentionedProducts:[],
    referenceType:'ACTIVE_PRODUCT_FALLBACK',
    nextBestAction:'COLLECT_RESERVATION_DATA',
  });
  const r=validateTurnDecision(planner,{activeProduct:'Armor X13'},['Armor 22','Armor X13'],deterministic);
  assert.equal(r.targetProduct,'Armor 22');
  assert.equal(r.referenceType,'NAMED_QUERY_TARGET');
});

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
  assert.equal(r.nextBestAction,'ASSISTED_HANDOFF');
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

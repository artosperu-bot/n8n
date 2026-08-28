import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleNba } from '../../src/conversation/nba/NbaCompatibility.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';

test('compatible semantic planner action wins over generic deterministic discovery fallback',()=>{
  const nba=compatibleNba(
    'EVALUATE_USE',
    {activeProduct:'Armor 22',useCase:'trabajo'},
    'ANSWER_ONLY',
    'ASK_MISSING_FACT',
  );
  assert.equal(nba,'ANSWER_ONLY');
});

test('generic distrust can answer current objection instead of forcing an alternative',()=>{
  const nba=compatibleNba(
    'OBJECTION',
    {activeProduct:'Armor 22',objection:'desconfianza'},
    'ANSWER_ONLY',
    'OFFER_ALTERNATIVE',
  );
  assert.equal(nba,'ANSWER_ONLY');
});

test('grounded worker suitability does not manufacture another SPIN question',()=>{
  const progression=evaluatePostAnswerCommercialProgression({
    intent:'EVALUATE_USE',
    currentNba:'ANSWER_ONLY',
    state:{activeProduct:'Armor 22',useCase:'trabajo'},
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
  });
  assert.equal(progression.candidateNba,'ANSWER_ONLY');
});

test('generic distrust with verified alternatives still answers objection unless alternative was chosen',()=>{
  const progression=evaluatePostAnswerCommercialProgression({
    intent:'OBJECTION',
    currentNba:'ANSWER_ONLY',
    state:{activeProduct:'Armor 22',objection:'desconfianza'},
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
    verifiedAlternatives:2,
  });
  assert.equal(progression.candidateNba,'ANSWER_ONLY');
});

test('suitability evidence follows semantic durability and battery attributes',()=>{
  const sections=productEvidenceSections(
    {primary:'EVALUATE_USE',attributes:['DURABILITY','BATTERY','WATER RESISTANCE']},
    {activeProduct:'Armor 22',useCase:'trabajo'},
  );
  assert.ok(sections.includes('RESISTENCIA'));
  assert.ok(sections.includes('BATERIA'));
  assert.ok(!sections.includes('MEMORIA'));
});

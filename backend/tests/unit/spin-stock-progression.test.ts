import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';

test('use-case language is not purchase intent',()=>{
  const message='Lo quiero para trabajar en construcción.';
  assert.equal(resolveIntentPlan(message).primary,'EVALUATE_USE');
  const facts=extractCommercialFacts(message,{});
  assert.equal(facts.useCase,'trabajo_construccion');
  assert.equal(facts.purchaseSignal,false);
});

test('situation only continues SPIN instead of jumping to stock or purchase',()=>{
  const nba=nextBestAction('EVALUATE_USE',{useCase:'trabajo_construccion',priorities:[],purchaseSignal:false});
  assert.equal(nba,'ASK_MISSING_FACT');
});

test('need-solution plus grounded product advances to stock check',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',
    currentNba:'ANSWER_ONLY',
    state:{useCase:'trabajo_construccion',priorities:['resistencia'],lastSpinContribution:'NECESIDAD_SOLUCION',purchaseSignal:false},
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
    relatedValueAvailable:true,
  });
  assert.equal(result.candidateNba,'SOFT_CLOSE');
  assert.equal(result.reason,'SPIN_READY_FOR_STOCK');
});

test('two explicit needs in a use case are enough to offer stock after recommendation',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'EVALUATE_USE',
    currentNba:'RECOMMEND',
    state:{useCase:'trabajo_en_campo',priorities:['resistencia','bateria'],explicitPriorities:['resistencia','bateria'],purchaseSignal:false},
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
    relatedValueAvailable:true,
  });
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('focused factual question without SPIN context remains answer only',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',
    currentNba:'ANSWER_ONLY',
    state:{priorities:['conectividad'],purchaseSignal:false},
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
    relatedValueAvailable:true,
  });
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

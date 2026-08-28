import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';

test('broad product info asks one useful next question only while discovery context is missing',()=>{
  assert.equal(nextBestAction('PRODUCT_INFO',{activeProduct:'Armor 22'}),'ASK_MISSING_FACT');
  assert.equal(nextBestAction('PRODUCT_INFO',{activeProduct:'Armor 22',useCase:'trabajo'}),'ANSWER_ONLY');
  assert.equal(nextBestAction('PRODUCT_INFO',{activeProduct:'Armor 22',priorities:['resistencia']}),'ANSWER_ONLY');
});

test('broad product info keeps overview mode while allowing exactly one follow-up question',()=>{
  const plan=buildCommercialResponsePlan({
    message:'Info del Armor 22',
    intent:'PRODUCT_INFO',
    resolvedCurrentIntent:'PRODUCT_INFO',
    state:{activeProduct:'Armor 22'},
    resolvedProduct:'Armor 22',
    directAnswer:'Armor 22 tiene información verificada.',
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh'}],
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh'}],
    finalExecutableNba:'ASK_MISSING_FACT',
    missingFact:'uso principal',
    commercialContractPrepared:true,
  } as any,'Armor 22 tiene información verificada.');

  assert.equal(plan.mode,'PRODUCT_OVERVIEW');
  assert.equal(plan.shouldUseLlm,true);
  assert.equal(plan.exactNba,'ASK_MISSING_FACT');
  assert.equal(plan.maxQuestions,1);
});

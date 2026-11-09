import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('colloquial misspelling of price and stock still receives factual authority', () => {
  const plan=resolveIntentPlan('kuanto ta y hay stoc?');
  assert.equal(plan.primary,'PRICE_AVAILABILITY');
  assert.ok(plan.secondary.includes('STOCK'));
});

test('short product availability question is classified as stock',()=>{
  assert.equal(resolveIntentPlan('oe tienen el armor x12 pro?').primary,'STOCK');
});

test('informal comparison follow-up selects a technical recommendation rather than a generic answer',()=>{
  const plan=resolveIntentPlan('el q tiene camra termica cual es?');
  assert.equal(plan.primary,'RECOMMEND');
  assert.ok(plan.attributes.includes('TERMICA'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';

test('product overview asks one useful missing fact when there is no decision context',()=>{
  assert.equal(nextBestAction('PRODUCT_INFO',{activeProduct:'Armor 22',priorities:[]}), 'ASK_MISSING_FACT');
});

test('product overview does not restart discovery when useful context already exists',()=>{
  assert.equal(nextBestAction('PRODUCT_INFO',{activeProduct:'Armor 22',useCase:'construcción',priorities:['resistencia']}), 'ANSWER_ONLY');
});

test('attribute and institutional factual turns remain answer-first',()=>{
  assert.equal(nextBestAction('CAPABILITY',{activeProduct:'Armor 22'}),'ANSWER_ONLY');
  assert.equal(nextBestAction('POLICY',{activeProduct:'Armor 22'}),'ANSWER_ONLY');
});

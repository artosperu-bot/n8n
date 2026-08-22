import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceState } from '../../src/conversation/state/StateReducer.ts';

test('state reducer preserves and merges extracted SPIN facts', () => {
  const next=reduceState({spinFacts:['sector:construccion'],turnCount:1},{spinFacts:['cantidad:12','prioridad:bateria'],customerType:'BUSINESS',quantity:12});
  assert.deepEqual(next.spinFacts,['sector:construccion','cantidad:12','prioridad:bateria']);
  assert.equal(next.customerType,'BUSINESS');
  assert.equal(next.quantity,12);
});

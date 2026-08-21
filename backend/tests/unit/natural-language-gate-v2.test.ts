import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('recognizes natural colloquial price wording without falling to OTHER', () => {
  const result = resolveIntentPlan('cuanto esta ese');
  assert.equal(result.primary, 'PRICE_AVAILABILITY');
});

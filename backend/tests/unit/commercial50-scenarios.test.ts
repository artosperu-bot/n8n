import test from 'node:test';
import assert from 'node:assert/strict';
import { commercial50Scenarios, COMMERCIAL_50_TURN_COUNT } from '../../qa/scenarios/commercial50.ts';

test('commercial50 is ten five-turn conversations',()=>{
  assert.equal(commercial50Scenarios.length,10);
  assert.equal(COMMERCIAL_50_TURN_COUNT,50);
  for(const scenario of commercial50Scenarios)assert.equal(scenario.turns.length,5);
});

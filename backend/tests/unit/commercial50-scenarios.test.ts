import test from 'node:test';
import assert from 'node:assert/strict';
import { commercial50Scenarios, COMMERCIAL_50_TURN_COUNT } from '../../qa/scenarios/commercial50.ts';

test('commercial50 is fifty coherent multi-turn conversations',()=>{
  assert.equal(commercial50Scenarios.length,50);
  assert.ok(COMMERCIAL_50_TURN_COUNT>=200);
  for(const scenario of commercial50Scenarios){
    assert.ok(scenario.turns.length>=3&&scenario.turns.length<=8,`${scenario.id} must remain a coherent multi-turn conversation`);
  }
});

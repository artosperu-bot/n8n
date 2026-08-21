import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyScenarios } from '../../qa/scenarios/journeys.ts';
import { coreScenarios } from '../../qa/scenarios/core.ts';
import { parseQaSuite, selectScenarios } from '../../scripts/qa-live.ts';

test('live journey suite uses long multi-turn conversations', () => {
  assert.ok(journeyScenarios.length >= 6);
  assert.ok(journeyScenarios.every(s => s.turns.length >= 6), 'every journey must have at least 6 turns');
  assert.ok(journeyScenarios.some(s => s.family === 'COMPARISON'));
  assert.ok(journeyScenarios.some(s => s.family === 'INSTITUTIONAL'));
  assert.ok(journeyScenarios.some(s => s.family === 'POLICY'));
  assert.equal(new Set(journeyScenarios.map(s => s.id)).size, journeyScenarios.length);
});

test('qa suite selector keeps journeys as the default and core as a separate fast suite', () => {
  assert.equal(parseQaSuite([]), 'journeys');
  assert.equal(parseQaSuite(['--suite=core']), 'core');
  assert.equal(selectScenarios('journeys'), journeyScenarios);
  assert.equal(selectScenarios('core'), coreScenarios);
  assert.equal(selectScenarios('all').length, journeyScenarios.length + coreScenarios.length);
});

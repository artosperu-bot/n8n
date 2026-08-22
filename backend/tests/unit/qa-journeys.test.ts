import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyScenarios } from '../../qa/scenarios/journeys.ts';
import { imageScenarios } from '../../qa/scenarios/images.ts';
import { coreScenarios } from '../../qa/scenarios/core.ts';
import { parseQaSuite, selectScenarios } from '../../scripts/qa-live.ts';

test('live journey suite uses long multi-turn conversations', () => {
  assert.ok(journeyScenarios.length >= 6);
  assert.ok(journeyScenarios.every(s => s.turns.length >= 6), 'every long journey must have at least 6 turns');
  assert.ok(journeyScenarios.some(s => s.family === 'COMPARISON'));
  assert.ok(journeyScenarios.some(s => s.family === 'POLICY'));
  assert.ok(journeyScenarios.flatMap(s=>s.turns).some(t=>/garant[ií]a/i.test(t.message)));
  assert.equal(new Set(journeyScenarios.map(s => s.id)).size, journeyScenarios.length);
});

test('qa suite selector keeps commercial journeys plus image flow as default and core separate', () => {
  assert.equal(parseQaSuite([]), 'journeys');
  assert.equal(parseQaSuite(['--suite=core']), 'core');
  assert.deepEqual(selectScenarios('journeys'), [...journeyScenarios, ...imageScenarios]);
  assert.equal(selectScenarios('core'), coreScenarios);
  assert.equal(selectScenarios('all').length, journeyScenarios.length + imageScenarios.length + coreScenarios.length);
});

test('primary journeys and core stay B2C while preserving one bounded business handoff elsewhere',()=>{
  assert.equal(journeyScenarios.some(s=>s.id==='JOURNEY-INSTITUTIONAL-TEAM'),false);
  assert.ok(journeyScenarios.some(s=>s.id==='JOURNEY-DELIVERY-LIMA'));
  const coreText=coreScenarios.flatMap(s=>s.turns).map(t=>t.message).join(' ');
  assert.doesNotMatch(coreText,/\b(?:empresa|corporativ|12\s+(?:equipos|celulares)|20\s+(?:equipos|celulares))\b/i);
  assert.ok(coreScenarios.some(s=>s.id==='B2C-CONDITIONAL-INTEREST'));
});

test('attribute followups inside a known comparison protect comparison semantics',()=>{
  const comparison=journeyScenarios.find(s=>s.id==='JOURNEY-COMPARE-X13-22');
  assert.ok(comparison);
  for(const message of ['¿Cuál de los dos tiene mejor batería?','¿Y en cámara cuál conviene más?']){
    const turn=comparison.turns.find(t=>t.message===message);
    assert.equal(turn?.expected?.intent,'COMPARE',message);
  }
});

test('CORE includes the compact B2C N+1 funnel without a rigid budget intent enum',()=>{
  const funnel=coreScenarios.find(s=>s.id==='N1-B2C-CONSTRUCTION');
  assert.ok(funnel);
  assert.deepEqual(funnel.turns.map(t=>t.message),[
    'Trabajo en construcción, se me cae el celular.',
    'y necesito batería todo el día',
    'máximo 1500',
    'si está disponible me interesa',
    'ya ese quiero, como compro?',
  ]);
  assert.equal(funnel.turns[2].expected?.budget,1500);
  assert.equal(funnel.turns[2].expected?.intent,undefined);
  assert.ok(coreScenarios.some(s=>s.id==='N1-B2C-INTERESTED-PRICE'&&s.turns.some(t=>t.message==='cuánto cuesta?')));
});

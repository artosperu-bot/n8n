import test from 'node:test';
import assert from 'node:assert/strict';
import { golden100Scenarios } from '../../qa/scenarios/golden100.ts';

test('Golden 100 is exactly twenty five-turn customer conversations',()=>{
  assert.equal(golden100Scenarios.length,20);
  assert.ok(golden100Scenarios.every(s=>s.turns.length===5));
  assert.equal(golden100Scenarios.flatMap(s=>s.turns).length,100);
});

test('Golden 100 covers commercial, truth, reference, policy, closing and reliability families',()=>{
  const families=new Set(golden100Scenarios.map(s=>s.family));
  for(const family of ['COMMERCIAL','TRUTH','REFERENCE','POLICY','CLOSING','INSTITUTIONAL','COMPARISON','RELIABILITY'])assert.ok(families.has(family as any),family);
});

test('every Golden 100 turn declares an independent oracle source',()=>{
  const turns=golden100Scenarios.flatMap(s=>s.turns);
  assert.ok(turns.every(t=>t.oracleSpec?.domain));
  assert.ok(turns.some(t=>/\bq\b|\bstk\b|\bta\b|ps\b/i.test(t.message)),'includes realistic short/typo customer language');
});

test('Golden 100 is B2C-first with only one bounded business handoff journey',()=>{
  const business=golden100Scenarios.filter(s=>s.turns.some(t=>/\b(?:empresa|corporativ|12\s+celulares|20\s+equipos)\b/i.test(t.message)));
  assert.equal(business.length,1);
  assert.equal(business[0]?.id,'G100-18-BUSINESS-12');
});

test('personal purchase journeys expect safe reservation capture instead of assisted handoff',()=>{
  const personalPurchaseTurns=golden100Scenarios
    .filter(s=>!s.id.includes('BUSINESS'))
    .flatMap(s=>s.turns)
    .filter(t=>t.oracleSpec?.intentClass==='PURCHASE');
  assert.ok(personalPurchaseTurns.length>=3);
  for(const turn of personalPurchaseTurns){
    assert.equal(turn.oracleSpec?.requiresHandoff,false,turn.message);
    assert.equal(turn.oracleSpec?.expectedNba,'COLLECT_RESERVATION_DATA',turn.message);
    assert.equal(turn.oracleSpec?.expectedState?.purchaseSignal,true,turn.message);
    assert.equal(turn.oracleSpec?.expectedState?.reservationStage,'NEED_DOCUMENT',turn.message);
  }
});

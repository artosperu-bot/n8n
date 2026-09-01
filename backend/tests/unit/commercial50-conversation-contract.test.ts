import test from 'node:test';
import assert from 'node:assert/strict';
import { commercial50Scenarios, COMMERCIAL_50_TURN_COUNT } from '../../qa/scenarios/commercial50.ts';

const ALLOWED_SHORT_CONFIRMATIONS=new Set(['si','ok','dale','gracias','ya','listo']);
const fold=(value:string)=>value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const shortToken=(value:string)=>fold(value).replace(/^[¿¡\s]+|[?.!,;:¡¿\s]+$/g,'');

test('commercial50 means 50 complete conversations, not 50 isolated turns',()=>{
  assert.equal(commercial50Scenarios.length,50,'qa:commercial50 must contain exactly 50 independent conversations');
  assert.ok(COMMERCIAL_50_TURN_COUNT>=200,`expected at least 200 customer turns across 50 conversations, got ${COMMERCIAL_50_TURN_COUNT}`);
});

test('every commercial50 conversation has enough context to test continuity without becoming artificial',()=>{
  const ids=new Set<string>();
  const titles=new Set<string>();
  for(const scenario of commercial50Scenarios){
    assert.ok(!ids.has(scenario.id),`duplicate scenario id: ${scenario.id}`);ids.add(scenario.id);
    assert.ok(!titles.has(scenario.title),`duplicate scenario title: ${scenario.title}`);titles.add(scenario.title);
    assert.ok(scenario.turns.length>=3&&scenario.turns.length<=8,`${scenario.id} must have 3-8 coherent customer turns, got ${scenario.turns.length}`);
    const normalized=scenario.turns.map(turn=>fold(turn.message));
    assert.equal(new Set(normalized).size,normalized.length,`${scenario.id} repeats the same customer message inside one conversation`);
    for(const turn of scenario.turns){
      const text=fold(turn.message);
      assert.ok(text.length>=2,`${scenario.id} contains an empty/nonsense customer turn`);
      if(text.length<=4)assert.ok(ALLOWED_SHORT_CONFIRMATIONS.has(shortToken(turn.message)),`${scenario.id} contains an unexplained short turn: ${turn.message}`);
    }
  }
});

test('commercial50 includes realistic reservation journeys with explicitly fictitious customer data',()=>{
  const joined=commercial50Scenarios.map(s=>s.turns.map(t=>t.message).join(' | '));
  const reservationJourneys=joined.filter(text=>/quiero comprar|me lo llevo|reserv|separ/i.test(text));
  const withDocument=reservationJourneys.filter(text=>/7000\d{4}|7400\d{4}|7500\d{4}/.test(text));
  const withName=reservationJourneys.filter(text=>/QA (?:Cliente|Prueba|Venta)/i.test(text));
  const withAddress=reservationJourneys.filter(text=>/Av\. QA|Jr\. QA|Calle QA/i.test(text));
  assert.ok(reservationJourneys.length>=8,`expected at least 8 purchase/reservation journeys, got ${reservationJourneys.length}`);
  assert.ok(withDocument.length>=6,'at least 6 reservation journeys must include a fictitious document');
  assert.ok(withName.length>=6,'at least 6 reservation journeys must include an obviously fictitious customer name');
  assert.ok(withAddress.length>=6,'at least 6 reservation journeys must include an obviously fictitious address');
});

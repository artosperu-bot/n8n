import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../../src/conversation/recommendation/RecommendationPolicy.ts';
import type { ProductQuote, RagEvidence } from '../../src/domain/types.ts';

function quote(name:string,price:number):ProductQuote{
  return {product:name,shortName:name,productRagId:`P-${name}`,price,stock:5,currency:'PEN',source:'FAKE_TEST_DATA'};
}
function ev(product:string,section:string,text:string,similarity:number):RagEvidence{
  return {text,source:`TEST:${section}`,score:similarity,productId:`P-${product}`,section,domain:'PRODUCT'};
}

test('vector similarity never outranks stronger battery evidence',()=>{
  const rows=rankRecommendations([
    {quote:quote('A',799),evidence:[ev('A','BATERIA','Capacidad de batería: 4860 mAh. Carga cableada: 10 W. Autonomía en llamadas: 20 horas.',0.99)]},
    {quote:quote('B',899),evidence:[ev('B','BATERIA','Capacidad de batería: 6320 mAh. Carga cableada: 10 W. Autonomía en llamadas: 29 horas.',0.41)]},
  ],{priorities:['bateria'],maxBudget:1000});
  assert.equal(rows[0]?.quote.shortName,'B');
  assert.ok((rows[0]?.criterionScores.BATERIA??0)>(rows[1]?.criterionScores.BATERIA??0));
});

test('resistance ranking uses comparable certified metrics, not retrieval score',()=>{
  const rows=rankRecommendations([
    {quote:quote('A',900),evidence:[ev('A','RESISTENCIA','Certificación IP68: Sí. Certificación IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m. Profundidad IP68: 1.5 m.',0.98)]},
    {quote:quote('B',1400),evidence:[ev('B','RESISTENCIA','Certificación IP68: Sí. Certificación IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 2 m. Profundidad IP68: 2 m.',0.45)]},
  ],{priorities:['resistencia']});
  assert.equal(rows[0]?.quote.shortName,'B');
  assert.ok(rows[0]?.reasons.some(x=>/ca[ií]da|resistencia/i.test(x)));
});

test('hard budget filter happens before technical ranking',()=>{
  const rows=rankRecommendations([
    {quote:quote('Premium',1400),evidence:[ev('Premium','BATERIA','Capacidad de batería: 9000 mAh. Carga cableada: 66 W.',0.9)]},
    {quote:quote('Fit',899),evidence:[ev('Fit','BATERIA','Capacidad de batería: 6320 mAh. Carga cableada: 10 W.',0.7)]},
  ],{priorities:['bateria'],maxBudget:1000});
  assert.deepEqual(rows.map(x=>x.quote.shortName),['Fit']);
});

test('delivery context derives battery and resistance criteria without product hardcoding',()=>{
  const rows=rankRecommendations([
    {quote:quote('A',799),evidence:[ev('A','BATERIA','Capacidad de batería: 4860 mAh. Carga cableada: 10 W.',0.8),ev('A','RESISTENCIA','IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m.',0.8)]},
    {quote:quote('B',899),evidence:[ev('B','BATERIA','Capacidad de batería: 6320 mAh. Carga cableada: 10 W.',0.8),ev('B','RESISTENCIA','IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m.',0.8)]},
  ],{useCase:'delivery',maxBudget:1000});
  assert.equal(rows[0]?.quote.shortName,'B');
  assert.ok(rows[0]?.criteria.includes('BATERIA'));
  assert.ok(rows[0]?.criteria.includes('RESISTENCIA'));
});

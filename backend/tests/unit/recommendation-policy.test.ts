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

test('thermal inspection need makes TERMICA a first-class criterion',()=>{
  const rows=rankRecommendations([
    {quote:quote('Standard',900),evidence:[ev('Standard','TERMICA','Cámara térmica: No.',0.99)]},
    {quote:quote('Thermal',1900),evidence:[ev('Thermal','TERMICA','Cámara térmica: Sí. Frecuencia térmica: 25 Hz. Resolución térmica horizontal: 160 px. Resolución térmica vertical: 120 px. Temperatura máxima térmica: 550 °C.',0.41)]},
  ],{priorities:['termica'],useCase:'inspeccion de temperatura en mantenimiento industrial'});
  assert.equal(rows[0]?.quote.shortName,'Thermal');
  assert.ok(rows[0]?.criteria.includes('TERMICA'));
  assert.ok((rows[0]?.criterionScores.TERMICA??0)>(rows[1]?.criterionScores.TERMICA??0));
});

test('technical tie does not silently become cheapest-product preference when price is not a criterion',()=>{
  const rows=rankRecommendations([
    {quote:quote('FirstCandidate',1200),evidence:[ev('FirstCandidate','CAMARA','Cámara principal: 50 MP. Cámara nocturna: 24 MP.',0.5)]},
    {quote:quote('CheaperCandidate',700),evidence:[ev('CheaperCandidate','CAMARA','Cámara principal: 50 MP. Cámara nocturna: 24 MP.',0.5)]},
  ],{priorities:['camara']});
  assert.deepEqual(rows.map(x=>x.quote.shortName),['FirstCandidate','CheaperCandidate']);
  assert.equal((rows[0] as any).winnerStatus,'TOP_TIE');
});

test('zero comparable evidence has no winner regardless of catalog order',()=>{
  const candidates=[
    {quote:quote('CatalogFirst',800),evidence:[]},
    {quote:quote('CatalogSecond',900),evidence:[]},
  ];
  const first=rankRecommendations(candidates,{priorities:['resistencia']});
  const reversed=rankRecommendations([...candidates].reverse(),{priorities:['resistencia']});
  assert.equal((first[0] as any).winnerStatus,'NO_COMPARABLE_EVIDENCE');
  assert.equal((reversed[0] as any).winnerStatus,'NO_COMPARABLE_EVIDENCE');
});

test('candidate with evidence for only one of four criteria cannot outrank broad evidence coverage',()=>{
  const rows=rankRecommendations([
    {quote:quote('Partial',700),evidence:[
      ev('Partial','RESISTENCIA','Certificación IP68: Sí. Certificación IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 2 m. Profundidad IP68: 2 m.',0.9),
    ]},
    {quote:quote('Covered',1100),evidence:[
      ev('Covered','RESISTENCIA','Certificación IP68: Sí. Certificación IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m. Profundidad IP68: 1.5 m.',0.7),
      ev('Covered','BATERIA','Capacidad de batería: 6600 mAh. Carga cableada: 33 W.',0.7),
      ev('Covered','CAMARA','Cámara principal: 64 MP. Cámara nocturna: 64 MP.',0.7),
      ev('Covered','MEMORIA','RAM física: 8 GB. Almacenamiento interno: 256 GB.',0.7),
    ]},
  ],{priorities:['resistencia','bateria','camara','memoria']});
  assert.equal(rows[0]?.quote.shortName,'Covered');
  assert.ok((rows[0]?.score??0)>(rows[1]?.score??0));
  assert.ok((rows[0]?.confidence??0)>(rows[1]?.confidence??0));
});

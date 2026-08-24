import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';

test('extracts business quantity sector problem and priorities without an LLM', () => {
  const f = extractCommercialFacts('Somos una empresa y necesitamos 12 celulares para técnicos que trabajan en construcción. Se les caen y necesitamos buena batería y resistencia.', {});
  assert.equal(f.customerType, 'BUSINESS');
  assert.equal(f.quantity, 12);
  assert.equal(f.sector, 'construccion');
  assert.match(f.problem ?? '', /caid/);
  assert.deepEqual(f.priorities?.sort(), ['bateria', 'resistencia']);
  assert.ok((f.spinFacts ?? []).includes('cantidad:12'));
});

test('preserves prior commercial facts and detects invoice and purchase signal', () => {
  const f = extractCommercialFacts('Necesitamos factura y quiero avanzar con la compra', { customerType: 'BUSINESS', quantity: 12, sector: 'construccion' });
  assert.equal(f.customerType, 'BUSINESS');
  assert.equal(f.quantity, 12);
  assert.equal(f.invoiceRequired, true);
  assert.equal(f.purchaseSignal, true);
});

test('recognizes strong purchase signals without returning to discovery', () => {
  const messages = [
    'ya ese quiero',
    'me llevo ese',
    'me decidi por ese',
    'como compro',
    'lo compro',
    'quiero avanzar',
    'quiero q un asesor siga con la compra',
  ];
  for (const message of messages) {
    assert.equal(extractCommercialFacts(message, {}).purchaseSignal, true, message);
  }
});

test('delivery is persisted as a use case so explicit repeated-use criteria can become priorities',()=>{
  const f=extractCommercialFacts('hago delivery todo el dia, quiero algo q aguante golpes',{});
  assert.equal(f.useCase,'delivery');
  assert.ok(f.priorities?.includes('resistencia'));
  const next=extractCommercialFacts('tambien uso gps siempre y datos todo el tiempo',{useCase:f.useCase,priorities:f.priorities});
  assert.equal(next.useCase,'delivery');
  assert.ok(next.priorities?.includes('conectividad'));
});

test('an isolated factual capability question does not become a customer priority or SPIN need',()=>{
  const f=extractCommercialFacts('¿Tiene NFC?',{activeProduct:'Armor 22'});
  assert.deepEqual(f.priorities,[]);
  assert.equal(f.spinFacts?.some(value=>/prioridad:nfc|prioridad:conectividad/i.test(value)),false);
});

test('an isolated durability question does not fabricate a customer problem or priority',()=>{
  const f=extractCommercialFacts('¿Aguanta caídas?',{activeProduct:'Armor 22'});
  assert.equal(f.problem??null,null);
  assert.deepEqual(f.priorities,[]);
  assert.equal(f.spinFacts?.some(value=>/problema:|prioridad:resistencia/i.test(value)),false);
});

test('a recurring drop statement is a SPIN problem, not automatically a need-payoff',()=>{
  const f=extractCommercialFacts('Se me cae seguido el celular.',{useCase:'trabajo_construccion'});
  assert.equal(f.problem,'caidas_frecuentes');
  assert.deepEqual(f.priorities,[]);
  assert.ok(f.spinFacts?.includes('problema:caidas_frecuentes'));
  assert.equal(f.spinFacts?.some(value=>/^prioridad:/i.test(value)),false);
});

test('a declared implication is stored separately from problem and need',()=>{
  const f=extractCommercialFacts('Cuando pasa pierdo tiempo y tengo que parar el trabajo.',{useCase:'trabajo_construccion',problem:'caidas_frecuentes',spinFacts:['uso:trabajo_construccion','problema:caidas_frecuentes']});
  assert.ok(f.spinFacts?.includes('implicacion:perdida_tiempo_interrupcion'));
  assert.deepEqual(f.priorities,[]);
});

test('a declared loss of work hours is persisted as implication without replacing prior use case/problem',()=>{
  const f=extractCommercialFacts('Cuando se rompe pierdo horas de trabajo.',{
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    spinFacts:['uso:trabajo_construccion','problema:caidas_frecuentes'],
  });
  assert.equal(f.useCase,'trabajo_construccion');
  assert.equal(f.problem,'caidas_frecuentes');
  assert.ok(f.spinFacts?.includes('implicacion:perdida_tiempo_interrupcion'));
});

test('a recurring drop plus explicit resistance requirement becomes both problem and need',()=>{
  const f=extractCommercialFacts('Se me cae seguido el celular y necesito que sea resistente.',{});
  assert.equal(f.problem,'caidas_frecuentes');
  assert.ok(f.priorities?.includes('resistencia'));
  assert.ok(f.spinFacts?.includes('problema:caidas_frecuentes'));
  assert.ok(f.spinFacts?.includes('prioridad:resistencia'));
});

test('an explicit hard requirement still becomes a priority',()=>{
  const f=extractCommercialFacts('Necesito NFC sí o sí porque pago con el celular.',{});
  assert.ok(f.priorities?.includes('nfc'));
  assert.ok(f.spinFacts?.includes('prioridad:nfc'));
});

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

test('delivery is persisted as a use case so recommendation can infer battery resistance and connectivity needs',()=>{
  const f=extractCommercialFacts('hago delivery todo el dia, quiero algo q aguante golpes',{});
  assert.equal(f.useCase,'delivery');
  assert.ok(f.priorities?.includes('resistencia'));
  const next=extractCommercialFacts('tambien uso gps siempre y datos todo el tiempo',{useCase:f.useCase,priorities:f.priorities});
  assert.equal(next.useCase,'delivery');
  assert.ok(next.priorities?.includes('conectividad'));
});

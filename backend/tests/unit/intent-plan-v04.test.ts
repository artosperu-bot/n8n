import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('keeps explicit price as primary and images/use as secondary intents', () => {
  const r = resolveIntentPlan('Precio, fotos y dime si sirve para juegos');
  assert.equal(r.primary, 'PRICE_AVAILABILITY');
  assert.ok(r.secondary.includes('IMAGES'));
  assert.ok(r.secondary.includes('EVALUATE_USE'));
});

test('recognizes product information separately from a single attribute', () => {
  assert.equal(resolveIntentPlan('Dame información del Armor X13').primary, 'PRODUCT_INFO');
  const attr = resolveIntentPlan('¿Qué batería tiene el Armor X13?');
  assert.equal(attr.primary, 'ATTRIBUTE');
  assert.deepEqual(attr.attributes, ['BATERIA']);
});

test('recognizes consultative need when customer describes work problem', () => {
  const r = resolveIntentPlan('Trabajo en construcción y se me caen seguido los celulares. Necesito algo resistente.');
  assert.equal(r.primary, 'EVALUATE_USE');
});

test('recognizes direct budget-fit request as recommendation', () => {
  assert.equal(resolveIntentPlan('¿Cuál entra en mi presupuesto?').primary, 'RECOMMEND');
  assert.equal(resolveIntentPlan('¿Qué modelo queda dentro de mi presupuesto?').primary, 'RECOMMEND');
});

test('recognizes catalog navigation and protected order lookup', () => {
  assert.equal(resolveIntentPlan('¿Qué categorías tienen?').primary, 'CATEGORIES');
  assert.equal(resolveIntentPlan('Muéstrame el catálogo de celulares').primary, 'CATALOG');
  assert.equal(resolveIntentPlan('Quiero consultar mi pedido 12345').primary, 'ORDER_STATUS');
});

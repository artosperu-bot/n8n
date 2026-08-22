import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('warranty is a distinct institutional intent', () => {
  assert.equal(resolveIntentPlan('¿Qué garantía tendríamos por los equipos?').primary, 'WARRANTY');
});

test('declarative business requirements stay consultative while factura remains secondary', () => {
  const r = resolveIntentPlan('Necesitamos equipos resistentes, buena batería y factura para la empresa.');
  assert.equal(r.primary, 'EVALUATE_USE');
  assert.ok(r.secondary.includes('POLICY'));
});

test('asking for another cheaper resistant option is a recommendation, not a bare attribute', () => {
  const r = resolveIntentPlan('¿Hay otra opción más económica sin perder resistencia?');
  assert.equal(r.primary, 'RECOMMEND');
  assert.ok(r.secondary.includes('ATTRIBUTE'));
});

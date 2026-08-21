import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('recognizes natural colloquial price wording without falling to OTHER', () => {
  const result = resolveIntentPlan('cuanto esta ese');
  assert.equal(result.primary, 'PRICE_AVAILABILITY');
});

test('recognizes common abbreviated availability wording', () => {
  assert.equal(resolveIntentPlan('y stk?').primary, 'STOCK');
});

test('recognizes explicit purchase decisions expressed naturally', () => {
  assert.equal(resolveIntentPlan('ya ese quiero').primary, 'PURCHASE');
  assert.equal(resolveIntentPlan('ya me decidi por ese').primary, 'PURCHASE');
});

test('maps resistance language to the product resistance attribute family', () => {
  const result = resolveIntentPlan('aguanta agua y polvo?');
  assert.equal(result.primary, 'ATTRIBUTE');
  assert.ok(result.attributes.includes('RESISTENCIA'));
});

test('maps security, SIM and physical language to canonical attribute families', () => {
  const security = resolveIntentPlan('tiene huella?');
  assert.equal(security.primary, 'ATTRIBUTE');
  assert.ok(security.attributes.includes('SEGURIDAD'));

  const sim = resolveIntentPlan('acepta dual sim?');
  assert.equal(sim.primary, 'ATTRIBUTE');
  assert.ok(sim.attributes.includes('SIM'));

  const physical = resolveIntentPlan('q peso tiene?');
  assert.equal(physical.primary, 'ATTRIBUTE');
  assert.ok(physical.attributes.includes('FISICO'));
});

test('camera-use wording is not confused with a request to show product images', () => {
  const result = resolveIntentPlan('quiero un celular con buena camara para tomar fotos para redes');
  assert.notEqual(result.primary, 'IMAGES');
  assert.ok(result.attributes.includes('CAMARA'));
});

test('explicit short model purchase wording is recognized as purchase', () => {
  assert.equal(resolveIntentPlan('ya el 22 quiero').primary, 'PURCHASE');
});

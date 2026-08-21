import test from 'node:test';
import assert from 'node:assert/strict';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';

test('general product info uses the six commercial ficha sections', () => {
  assert.deepEqual(productEvidenceSections({ primary: 'PRODUCT_INFO', attributes: [] } as any, {}), ['PANTALLA','RENDIMIENTO','MEMORIA','CAMARA','BATERIA','RESISTENCIA']);
});

test('single attribute retrieves only the requested technical section', () => {
  assert.deepEqual(productEvidenceSections({ primary: 'ATTRIBUTE', attributes: ['BATERIA'] } as any, {}), ['BATERIA']);
});

test('comparison prioritizes the customer criteria and limits evidence dimensions', () => {
  const sections = productEvidenceSections({ primary: 'COMPARE', attributes: [] } as any, { priorities: ['resistencia','bateria','camara','precio'] });
  assert.deepEqual(sections, ['RESISTENCIA','BATERIA','CAMARA']);
  assert.ok(sections.length <= 4);
});

test('N+1 asks only the missing decision-changing fact', () => {
  assert.equal(nextBestAction('EVALUATE_USE', { problem: 'caidas_frecuentes', budget: null }), 'ASK_BUDGET');
  assert.equal(nextBestAction('PRODUCT_INFO', { activeProduct: 'Armor X13' }), 'ASK_USE');
});

test('purchase moves to assisted handoff, never automatic reservation', () => {
  assert.equal(nextBestAction('PURCHASE', { purchaseSignal: true }), 'ASSISTED_HANDOFF');
});

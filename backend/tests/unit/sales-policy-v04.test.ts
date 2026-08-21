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

test('technical aliases map to real Supabase product sections', () => {
  assert.deepEqual(productEvidenceSections({ primary:'ATTRIBUTE', attributes:['NFC'] }, {}), ['CONECTIVIDAD','FUNCIONES']);
  assert.deepEqual(productEvidenceSections({ primary:'ATTRIBUTE', attributes:['5G'] }, {}), ['REDES','CONECTIVIDAD']);
  assert.deepEqual(productEvidenceSections({ primary:'ATTRIBUTE', attributes:['TERMICA'] }, {}), ['TERMICA']);
  assert.deepEqual(productEvidenceSections({ primary:'ATTRIBUTE', attributes:['sensor de huella'] }, {}), ['SEGURIDAD','SENSORES']);
});

test('comparison prioritizes the customer criteria and limits evidence dimensions', () => {
  const sections = productEvidenceSections({ primary: 'COMPARE', attributes: [] } as any, { priorities: ['resistencia','bateria','camara','precio'] });
  assert.deepEqual(sections, ['RESISTENCIA','BATERIA','CAMARA']);
  assert.ok(sections.length <= 4);
});

test('comparison honors an explicit technical criterion before generic priorities', () => {
  assert.deepEqual(productEvidenceSections({ primary:'COMPARE', attributes:['5G'] }, { priorities:['bateria'] }), ['REDES','CONECTIVIDAD']);
});

test('contextual N+1 answers complete factual questions without a forced follow-up', () => {
  assert.equal(nextBestAction('CAPABILITY', { activeProduct:'Armor X13' }), 'ANSWER_ONLY');
  assert.equal(nextBestAction('PRICE', { activeProduct:'Armor X13' }), 'ANSWER_ONLY');
  assert.equal(nextBestAction('STOCK', { activeProduct:'Armor X13' }), 'ANSWER_ONLY');
  assert.equal(nextBestAction('POLICY', {}), 'ANSWER_ONLY');
});

test('contextual N+1 asks only a decision-changing missing fact', () => {
  assert.equal(nextBestAction('EVALUATE_USE', { problem:'caidas_frecuentes', budget:null }), 'ASK_MISSING_FACT');
});

test('recommendation and comparison choose bounded commercial actions', () => {
  assert.equal(nextBestAction('RECOMMEND', { recommendedProduct:'Armor X13' }), 'SOFT_CLOSE');
  assert.equal(nextBestAction('COMPARE', { comparisonProducts:['Armor X13','Armor 22'], priorities:['resistencia'] }), 'RECOMMEND');
});

test('strong purchase signal can never return to discovery', () => {
  assert.equal(nextBestAction('OTHER', { purchaseSignal:true }), 'ASSISTED_HANDOFF');
  assert.equal(nextBestAction('PURCHASE', { purchaseSignal:true }), 'ASSISTED_HANDOFF');
});

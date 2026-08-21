import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReference } from '../../src/conversation/reference/ReferenceResolver.ts';

test('recent selected/salient product beats stale recommendation for selection referent', () => {
  const r = resolveReference('Entonces me quedo con ese.', {
    activeProduct:'Armor 22',
    salientProduct:'Armor 22',
    selectedProduct:'Armor 22',
    recommendedProduct:'Armor 25T Pro',
    comparisonProducts:['Armor X13','Armor 22'],
  });
  assert.equal(r.queryTarget,'Armor 22');
  assert.equal(r.selectedProduct,'Armor 22');
});

test('el otro is relative to latest salient product inside comparison pair', () => {
  const r = resolveReference('¿Y cuánto cuesta el otro?', {
    activeProduct:'Armor X13',
    salientProduct:'Armor 22',
    comparisonProducts:['Armor X13','Armor 22'],
  });
  assert.equal(r.queryTarget,'Armor X13');
  assert.equal(r.explicitSwitch,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProductName, resolveReference } from '../../src/conversation/reference/ReferenceResolver.ts';

test('canonicalizes ERP product names', () => {
  assert.equal(canonicalProductName('Smartphone Armor X12 Pro Rugged 64Gb'), 'Armor X12 Pro');
});

test('captures two products and resolves the alternative', () => {
  const first = resolveReference('Estoy entre el Armor X13 y el Armor 22', { comparisonProducts: [] });
  assert.deepEqual(first.mentionedProducts, ['Armor X13', 'Armor 22']);
  const other = resolveReference('¿Y el otro cuánto cuesta?', { activeProduct: 'Armor X13', comparisonProducts: ['Armor X13', 'Armor 22'] });
  assert.equal(other.queryTarget, 'Armor 22');
});

test('attribute preference does not switch active product', () => {
  const r = resolveReference('Prefiero la batería del Armor 22', { activeProduct: 'Armor X13', comparisonProducts: ['Armor X13', 'Armor 22'] });
  assert.equal(r.queryTarget, 'Armor 22');
  assert.equal(r.nextActiveProduct, 'Armor X13');
  assert.equal(r.explicitSwitch, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReference } from '../../src/conversation/reference/ReferenceResolver.ts';
const state={activeProduct:'Armor 22',recommendedProduct:'Armor 25T Pro',comparisonProducts:['Armor 22','Armor X13'] as string[]};

test('recommended referent resolves query target without switching active product',()=>{const r=resolveReference('¿Cuánto cuesta el recomendado?',state);assert.equal(r.queryTarget,'Armor 25T Pro');assert.equal(r.explicitSwitch,false);assert.equal(r.nextActiveProduct,'Armor 22');});
test('mentioning another product does not switch active product',()=>{const r=resolveReference('También vi el Armor X13.',state);assert.equal(r.queryTarget,'Armor X13');assert.equal(r.explicitSwitch,false);assert.equal(r.nextActiveProduct,'Armor 22');});
test('explicit preference for another product switches active product',()=>{const r=resolveReference('Prefiero el Armor X13.',state);assert.equal(r.queryTarget,'Armor X13');assert.equal(r.explicitSwitch,true);assert.equal(r.nextActiveProduct,'Armor X13');});
test('preference for one attribute does not switch product',()=>{const r=resolveReference('Prefiero la batería del Armor X13.',state);assert.equal(r.queryTarget,'Armor X13');assert.equal(r.explicitSwitch,false);assert.equal(r.nextActiveProduct,'Armor 22');});
test('selection referent me quedo con ese resolves recommended product and makes it active',()=>{const r=resolveReference('Me quedo con ese.',state);assert.equal(r.queryTarget,'Armor 25T Pro');assert.equal(r.explicitSwitch,true);assert.equal(r.nextActiveProduct,'Armor 25T Pro');});
test('el otro resolves the alternative in the preserved comparison pair without switching',()=>{const r=resolveReference('¿Y el otro?',state);assert.equal(r.queryTarget,'Armor X13');assert.equal(r.explicitSwitch,false);assert.equal(r.nextActiveProduct,'Armor 22');});

test('short contextual model alias selects Armor 22 instead of treating 22 as a date',()=>{
  const r=resolveReference('ya el 22 quiero',state);
  assert.equal(r.queryTarget,'Armor 22');
  assert.equal(r.selectedProduct,'Armor 22');
  assert.equal(r.explicitSwitch,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProductName, resolveReference } from '../../src/conversation/reference/ReferenceResolver.ts';

test('canonicalizes ERP product names',()=>{assert.equal(canonicalProductName('Smartphone Armor X12 Pro Rugged 64Gb'),'Armor X12 Pro');});
test('captures two products and resolves the alternative',()=>{const first=resolveReference('Estoy entre el Armor X13 y el Armor 22',{comparisonProducts:[]});assert.deepEqual(first.mentionedProducts,['Armor X13','Armor 22']);const other=resolveReference('¿Y el otro cuánto cuesta?',{activeProduct:'Armor X13',comparisonProducts:['Armor X13','Armor 22']});assert.equal(other.queryTarget,'Armor 22');});
test('recommended referent participates in comparison pair',()=>{const r=resolveReference('Compara el recomendado con el Armor X13',{recommendedProduct:'Armor 22',comparisonProducts:[]});assert.deepEqual(r.mentionedProducts,['Armor 22','Armor X13']);});
test('attribute preference does not switch active product',()=>{const r=resolveReference('Prefiero la batería del Armor 22',{activeProduct:'Armor X13',comparisonProducts:['Armor X13','Armor 22']});assert.equal(r.queryTarget,'Armor 22');assert.equal(r.nextActiveProduct,'Armor X13');assert.equal(r.explicitSwitch,false);});
test('unknown named Armor does not reuse stale product',()=>{const r=resolveReference('Dame información del Armor 30',{activeProduct:'Armor X13'});assert.equal(r.unknownNamedProduct,true);assert.equal(r.queryTarget,null);assert.equal(r.nextActiveProduct,'Armor X13');});

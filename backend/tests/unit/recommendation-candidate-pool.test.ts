import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRecommendationCandidates } from '../../src/conversation/recommendation/CandidatePool.ts';

const rows:any[]=[
  {product:'Armor X12 Pro',shortName:'Armor X12 Pro',price:699,stock:5,currency:'PEN',source:'SQL_BRIDGE'},
  {product:'Armor X13',shortName:'Armor X13',price:899,stock:7,currency:'PEN',source:'SQL_BRIDGE'},
  {product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'SQL_BRIDGE'},
  {product:'Armor 25T Pro',shortName:'Armor 25T Pro',price:1999,stock:0,currency:'PEN',source:'SQL_BRIDGE'},
];

test('catalog and documentary eligibility keep real products even when stock is zero',()=>{
  const result=partitionRecommendationCandidates(rows,{maxBudget:999999,exclude:null});
  assert.deepEqual(result.catalog.map(x=>x.shortName),['Armor X12 Pro','Armor X13','Armor 22','Armor 25T Pro']);
  assert.deepEqual(result.available.map(x=>x.shortName),['Armor X12 Pro','Armor X13','Armor 22']);
  assert.deepEqual(result.eligible.map(x=>x.shortName),['Armor X12 Pro','Armor X13','Armor 22','Armor 25T Pro']);
  assert.ok(!result.discarded.some(x=>x.product==='Armor 25T Pro'&&x.reason==='NO_STOCK'));
});

test('budget filters eligibility but never erases products from catalog',()=>{
  const result=partitionRecommendationCandidates(rows,{maxBudget:1000,exclude:null});
  assert.equal(result.catalog.length,4);
  assert.deepEqual(result.eligible.map(x=>x.shortName),['Armor X12 Pro','Armor X13']);
  assert.ok(result.discarded.some(x=>x.product==='Armor 22'&&x.reason==='BUDGET'));
  assert.ok(result.discarded.some(x=>x.product==='Armor 25T Pro'&&x.reason==='BUDGET'));
});

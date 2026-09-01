import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceState } from '../../src/conversation/state/StateReducer.ts';

test('legacy singleton comparison is cleared on the next canonical turn',()=>{
  const next=reduceState({
    activeProduct:'Armor 22',
    queryTarget:'Armor 22',
    salientProduct:'Armor 22',
    comparisonProducts:['Armor 22'],
    exploredProducts:['Armor 22'],
  } as any,{
    lastIntent:'EVALUATE_USE',
    lastRoute:'RAG_PRODUCT',
    lastUserMessage:'para mi trabajo',
    useCase:'trabajo',
    comparisonProducts:['Armor 22'],
  } as any);
  assert.deepEqual(next.comparisonProducts,[]);
  assert.deepEqual(next.exploredProducts,['Armor 22']);
});

test('a genuine two-product comparison remains intact',()=>{
  const next=reduceState({activeProduct:'Armor 22'} as any,{
    lastIntent:'COMPARE',
    lastRoute:'RAG_PRODUCT',
    comparisonProducts:['Armor 22','Armor X13'],
  } as any);
  assert.deepEqual(next.comparisonProducts,['Armor 22','Armor X13']);
});

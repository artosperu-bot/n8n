import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBudgetTurn } from '../../src/conversation/budget/BudgetResolver.ts';

test('pure budget stays budget constraint, not price objection or SPIN',()=>{
  const r=classifyBudgetTurn('Podría gastar hasta S/ 1,500.');
  assert.equal(r.budget?.max,1500);
  assert.equal(r.budgetConstraint,true);
  assert.equal(r.priceObjection,false);
  assert.equal(r.preferredIntent,'BUDGET_CONSTRAINT');
  assert.equal(r.spinResidual,'');
});

test('price objection can coexist with a budget',()=>{
  const r=classifyBudgetTurn('Está muy caro, tengo máximo S/ 900.');
  assert.equal(r.budget?.max,900);
  assert.equal(r.priceObjection,true);
  assert.equal(r.preferredIntent,'HANDLE_PRICE_OBJECTION');
});

test('budget and work context remain independent',()=>{
  const r=classifyBudgetTurn('Lo quiero para trabajo y podría gastar hasta S/ 1,500.');
  assert.equal(r.budget?.max,1500);
  assert.match(r.spinResidual,/trabajo/);
});

test('recognizes natural cap phrases used by real customers',()=>{
  assert.equal(classifyBudgetTurn('mi tope es 900').budget?.max,900);
  assert.equal(classifyBudgetTurn('maximo 1500 soles').budget?.max,1500);
  assert.equal(classifyBudgetTurn('hay algo por menos de 1000?').budget?.max,1000);
  assert.equal(classifyBudgetTurn('tengo 1000 max').budget?.max,1000);
});

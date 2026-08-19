const assert = require('assert');
const { classifyBudgetTurn, sanitizeSpinCandidate } = require('../patches/P3_BUDGET_ROUTING_GUARD_NODE06');

function c(msg, prevBudget=null){ return classifyBudgetTurn(msg,{prevBudget}); }

// B1 pure budget
let r=c('Podría gastar hasta S/ 1,500.');
assert.equal(r.budget.kind,'CAP'); assert.equal(r.budget.max,1500); assert.equal(r.priceObjection,false); assert.equal(r.budgetConstraint,true);
assert.equal(sanitizeSpinCandidate({tipo:'IMPLICACION',valor:'Podría gastar hasta S/ 1,500.',evidencia:'Podría gastar hasta S/ 1,500.'},r).accepted,false);
// B2 low cap
r=c('Tengo máximo S/ 900.'); assert.equal(r.budget.max,900); assert.equal(r.priceObjection,false);
// B3 range
r=c('Busco algo entre S/ 800 y S/ 1,100.'); assert.equal(r.budget.kind,'RANGE'); assert.equal(r.budget.min,800); assert.equal(r.budget.max,1100); assert.equal(r.priceObjection,false);
// B4 budget after real problem: budget itself must not become implication
r=c('Podría gastar hasta S/ 1,500.',1500); assert.equal(r.budgetConstraint,true); assert.equal(r.priceObjection,false);
// B5 direct budget question
r=c('¿Cuál sí entra en mi presupuesto?',900); assert.equal(r.budgetQuery,true); assert.equal(r.effectiveBudget.max,900); assert.equal(r.preferredIntent,'RECOMMEND_WITHIN_BUDGET');
// B6 real price objection
r=c('Está caro.'); assert.equal(r.priceObjection,true); assert.equal(r.budgetConstraint,false);
// B7 explicit objection + budget
r=c('Se sale de mi presupuesto; tengo máximo S/ 900.'); assert.equal(r.priceObjection,true); assert.equal(r.budget.max,900); assert.equal(r.budgetConstraint,true);
// mixed use + budget preserves non-budget SPIN
r=c('Trabajo todo el día fuera y podría gastar hasta S/ 1,500.');
let s=sanitizeSpinCandidate({tipo:'SITUACION',valor:'Trabajo todo el día fuera y podría gastar hasta S/ 1,500.',evidencia:'Trabajo todo el día fuera y podría gastar hasta S/ 1,500.'},r);
assert.equal(s.accepted,true); assert.ok(/trabajo todo el dia fuera/i.test(s.valor)); assert.ok(!/1,?500/.test(s.valor));
console.log('BUDGET_ROUTING_GUARD_TESTS_PASS');
// B8-B10 neighbor no-op contract: budget guard must not seize unrelated turns.
for (const msg of ['Creo que me quedo con ese.','Quiero comprarlo.','Ya entendí.']) {
  const n=c(msg,1500);
  assert.equal(n.budgetConstraint,false, msg);
  assert.equal(n.budgetQuery,false, msg);
  assert.equal(n.priceObjection,false, msg);
  assert.equal(n.preferredIntent,null, msg);
}
console.log('B8_B10_BUDGET_GUARD_NOOP_PASS');

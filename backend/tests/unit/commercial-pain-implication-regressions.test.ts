import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { evaluateSpinReadiness } from '../../src/conversation/nba/SpinProgression.ts';

test('customer consequence follow-up is treated as consultative context, not neutral OTHER',()=>{
  const plan=resolveIntentPlan('Ya se me malogró un celular por eso');
  assert.equal(plan.primary,'EVALUATE_USE');
});

test('damage consequence advances SPIN from problem to need-payoff instead of losing the pain',()=>{
  const previous={
    activeProduct:'Armor 22',
    useCase:'trabajo',
    problem:'exposicion_agua_polvo',
    spinFacts:['uso:trabajo','problema:exposicion_agua_polvo'],
  } as any;
  const facts=extractCommercialFacts('Ya se me malogró un celular por eso',previous);
  assert.ok(facts.spinFacts.some(value=>/^implicacion:/i.test(value)),`expected implication fact, got ${JSON.stringify(facts.spinFacts)}`);
  const spin=evaluateSpinReadiness({...previous,...facts});
  assert.equal(spin.hasImplication,true);
  assert.equal(spin.stage,'NEED_PAYOFF');
  assert.equal(spin.nextMissingFact,'prioridad principal');
});

test('repeated repair consequence is preserved as a real implication',()=>{
  const previous={useCase:'trabajo',problem:'caidas_frecuentes',spinFacts:['uso:trabajo','problema:caidas_frecuentes']} as any;
  const facts=extractCommercialFacts('Por eso ya tuve que repararlo dos veces',previous);
  assert.ok(facts.spinFacts.some(value=>/^implicacion:/i.test(value)));
  assert.equal(evaluateSpinReadiness({...previous,...facts}).hasImplication,true);
});

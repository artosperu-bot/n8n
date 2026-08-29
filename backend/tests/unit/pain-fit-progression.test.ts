import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';

for(const problem of ['reparaciones_repetidas','caidas_frecuentes','autonomia_insuficiente','exposicion_agua_polvo']){
  test(`specific pain ${problem} does not bypass a still-missing implication`,()=>{
    const state={
      activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo',problem,
      spinFacts:['uso:trabajo',`problema:${problem}`],
    } as any;
    assert.equal(nextBestAction('EVALUATE_USE',state),'ASK_MISSING_FACT');
    const progression=evaluatePostAnswerCommercialProgression({
      intent:'EVALUATE_USE',currentNba:'RECOMMEND',state,resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    });
    assert.equal(progression.candidateNba,'ASK_MISSING_FACT');
    assert.equal(progression.reason,'SPIN_NEEDS_IMPLICATION');
  });
}

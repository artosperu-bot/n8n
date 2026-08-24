import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';

for(const problem of ['reparaciones_repetidas','caidas_frecuentes','autonomia_insuficiente','exposicion_agua_polvo']){
  test(`specific pain ${problem} is enough to advance once a grounded product fit exists`,()=>{
    const state={activeProduct:'Armor 22',recommendedProduct:'Armor 22',problem,spinFacts:[`problema:${problem}`]} as any;
    assert.equal(nextBestAction('EVALUATE_USE',state),'SOFT_CLOSE');
    const progression=evaluatePostAnswerCommercialProgression({intent:'EVALUATE_USE',currentNba:'RECOMMEND',state,resolvedProduct:'Armor 22',verifiedCurrentAnswer:true});
    assert.equal(progression.candidateNba,'SOFT_CLOSE');
  });
}

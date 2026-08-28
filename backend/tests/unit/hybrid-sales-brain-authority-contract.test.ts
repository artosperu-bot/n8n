import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';
import { mergeSemanticUseCase, shouldUseRecommendationCandidates } from '../../src/conversation/commercial/HybridSalesAuthority.ts';

test('generic objection never turns into a synthetic budget objection',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'No confío mucho en ese equipo Armor 22.',
    intent:'OBJECTION',
    state:{activeProduct:'Armor 22',objection:'desconfianza'},
    decision:{nextBestAction:'ASK_MISSING_FACT',objection:'desconfianza'} as any,
    resolvedProduct:'Armor 22',
    allowedProducts:['Armor 22'],
  });
  assert.notEqual(prepared.missingFact,'presupuesto máximo');
  assert.equal(prepared.finalExecutableNba,'ANSWER_ONLY');
});

test('generic LAER objection instruction does not pretend the objection is price',()=>{
  const plan=buildCommercialResponsePlan({
    message:'No confío mucho en ese equipo Armor 22.',
    intent:'OBJECTION',resolvedCurrentIntent:'OBJECTION',objection:'desconfianza',
    state:{activeProduct:'Armor 22',commercialStrategy:'LAER'},
    directAnswer:'El Armor 22 tiene evidencia técnica verificada.',
    finalExecutableNba:'ANSWER_ONLY',verifiedFacts:[],commercialContractPrepared:true,
  } as any,'El Armor 22 tiene evidencia técnica verificada.');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.equal(plan.mode,'OBJECTION_LAER');
  assert.doesNotMatch(instruction,/precio le parece alto/i);
  assert.match(instruction,/objeci[oó]n|duda|preocupaci[oó]n/i);
});

test('price objection that asks why choose current product does not trigger candidate search when planner says answer only',()=>{
  assert.equal(shouldUseRecommendationCandidates({
    intent:'HANDLE_PRICE_OBJECTION',
    nba:'ANSWER_ONLY',
    hasTarget:true,
    hasDecisionContext:true,
  }),false);
  assert.equal(shouldUseRecommendationCandidates({
    intent:'HANDLE_PRICE_OBJECTION',
    nba:'OFFER_ALTERNATIVE',
    hasTarget:true,
    hasDecisionContext:true,
  }),true);
});

test('richer semantic current-turn use context beats a generic fallback but not durable prior context',()=>{
  assert.equal(mergeSemanticUseCase({
    previousUseCase:null,
    fallbackUseCase:'trabajo',
    semanticUseCase:'trabajo en obra',
  }),'trabajo en obra');

  assert.equal(mergeSemanticUseCase({
    previousUseCase:'delivery',
    fallbackUseCase:'delivery',
    semanticUseCase:'trabajo en obra',
  }),'delivery');
});

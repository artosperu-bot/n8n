import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';

test('A: a price lookup after meaningful interactions proposes executable progression',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',useCase:'trabajo de campo',priorities:['resistencia'],levelOfInterest:24,interestEvents:['USE_CASE','ATTRIBUTE:ARMOR_22:RESISTENCIA','PRICE:ARMOR_22']},
  });
  assert.equal(result.level,'MEDIUM');
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('B: verified capability plus mature problem context may advance to a bounded close',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',problem:'golpes frecuentes',priorities:['resistencia'],levelOfInterest:24,interestEvents:['USE_CASE','ATTRIBUTE:ARMOR_22:RESISTENCIA','PRICE:ARMOR_22']},
  });
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('C: an isolated technical fact remains ANSWER_ONLY',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',levelOfInterest:4,interestEvents:['ATTRIBUTE:ARMOR_22:RAM']},
  });
  assert.equal(result.level,'LOW');
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

test('D: progression does not force a useless question when the decision context is complete',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'CAPABILITY',currentNba:'ANSWER_ONLY',resolvedProduct:null,verifiedCurrentAnswer:false,
    state:{useCase:'campo',problem:'golpes',priorities:['resistencia'],budget:1200,levelOfInterest:30},
  });
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

test('E: explicit interest outranks a lower-value SPIN question',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ASK_MISSING_FACT',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',interestSignal:true,levelOfInterest:15},
  });
  assert.equal(result.level,'HIGH');
  assert.equal(result.candidateNba,'SOFT_CLOSE');
});

test('F: progression emits exactly one bounded NBA',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,state:{selectedProduct:'Armor 22'}});
  assert.equal(typeof result.candidateNba,'string');
  assert.doesNotMatch(result.candidateNba,/[,|]/);
});

test('G: unsupported progression degrades through CAN_EXECUTE without inventing another action',()=>{
  const proposed=evaluatePostAnswerCommercialProgression({intent:'PRICE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,state:{interestSignal:true,activeProduct:'Armor 22'}});
  const prepared=prepareCommercialWriteInput({message:'¿cuánto cuesta?',intent:'PRICE',state:{interestSignal:true,activeProduct:'Armor 22'},decision:{nextBestAction:proposed.candidateNba} as any,allowedProducts:['Armor 22']});
  assert.equal(proposed.candidateNba,'SOFT_CLOSE');
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
});

test('H: purchase and closing continuity are never sent back to discovery',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'PURCHASE',currentNba:'COLLECT_RESERVATION_DATA',resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,
    state:{activeProduct:'Armor 22',selectedProduct:'Armor 22',purchaseSignal:true,commercialStage:'CIERRE'},
  });
  assert.equal(result.level,'HIGH');
  assert.equal(result.candidateNba,'COLLECT_RESERVATION_DATA');
});

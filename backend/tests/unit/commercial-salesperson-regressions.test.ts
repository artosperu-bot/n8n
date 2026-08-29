import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpinReadiness } from '../../src/conversation/nba/SpinProgression.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { reduceState } from '../../src/conversation/state/StateReducer.ts';

function turnDecision(primaryIntent:string):any{
  return {
    primaryIntent,secondaryIntents:[],targetProduct:'Armor 22',mentionedProducts:[],referenceType:null,
    explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,
    customerProblem:null,priorities:[],objection:null,commercialStage:null,spinContribution:null,
    nextBestAction:'ANSWER_ONLY',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.9,
  };
}

test('explicit substantive priorities skip redundant situation discovery',()=>{
  const spin=evaluateSpinReadiness({priorities:['resistencia','bateria']});
  assert.equal(spin.readyForRecommendation,true);
  assert.equal(spin.nextMissingFact,null);
  assert.equal(spin.stage,'READY');
});

test('real customer wording extracts substantive criteria without asking for a synthetic use case',()=>{
  const facts=extractCommercialFacts('Quiero uno resistente y con buena batería',{});
  assert.deepEqual(facts.priorities.sort(),['bateria','resistencia']);
  const spin=evaluateSpinReadiness({priorities:facts.priorities});
  assert.equal(spin.readyForRecommendation,true);
  assert.equal(spin.nextMissingFact,null);
});

test('budget alone is not enough context for a recommendation',()=>{
  const spin=evaluateSpinReadiness({budget:800});
  assert.equal(spin.readyForRecommendation,false);
  assert.equal(spin.nextMissingFact,'uso principal');
});

test('price-only priority is not enough context for a recommendation',()=>{
  const spin=evaluateSpinReadiness({priorities:['precio'],budget:800});
  assert.equal(spin.readyForRecommendation,false);
  assert.equal(spin.nextMissingFact,'uso principal');
});

test('neutral OTHER does not invent commercial discovery',()=>{
  assert.equal(nextBestAction('OTHER',{}),'ANSWER_ONLY');
});

test('deterministic intent separates generic objection from price objection',()=>{
  assert.equal(resolveIntentPlan('Está caro').primary,'HANDLE_PRICE_OBJECTION');
  assert.equal(resolveIntentPlan('No confío mucho en ese equipo').primary,'OBJECTION');
  assert.equal(resolveIntentPlan('Se me hace muy grande').primary,'OBJECTION');
});

test('current deterministic objection subtype outranks planner disagreement',()=>{
  const generic=validateTurnDecision(
    turnDecision('HANDLE_PRICE_OBJECTION'),
    {activeProduct:'Armor 22',objection:null},
    ['Armor 22'],
    turnDecision('OBJECTION'),
  );
  assert.equal(generic.primaryIntent,'OBJECTION');

  const price=validateTurnDecision(
    turnDecision('OBJECTION'),
    {activeProduct:'Armor 22',objection:'precio'},
    ['Armor 22'],
    turnDecision('HANDLE_PRICE_OBJECTION'),
  );
  assert.equal(price.primaryIntent,'HANDLE_PRICE_OBJECTION');
});

test('generic objection without a verified alternative answers without inventing a budget question',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Se me hace muy grande.',
    intent:'OBJECTION',
    state:{activeProduct:'Armor 22',objection:'tamano'},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(prepared.nextBestAction,'ANSWER_ONLY');
  assert.equal(prepared.missingFact,null);
});

test('price objection without verified alternative asks budget only when budget is unknown',()=>{
  const unknown=prepareCommercialWriteInput({
    message:'Está caro.',
    intent:'HANDLE_PRICE_OBJECTION',
    state:{activeProduct:'Armor 22',objection:'precio'},
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(unknown.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(unknown.missingFact,'presupuesto máximo');

  const known=prepareCommercialWriteInput({
    message:'Está caro, mi tope es 900.',
    intent:'HANDLE_PRICE_OBJECTION',
    state:{activeProduct:'Armor 22',objection:'precio',budget:900},
    budget:900,
    decision:{nextBestAction:'OFFER_ALTERNATIVE'} as any,
    allowedProducts:['Armor 22'],
    alternatives:[],
  });
  assert.equal(known.nextBestAction,'ANSWER_ONLY');
  assert.equal(known.missingFact,null);
});

test('worker self-description is a real work use case and does not ask for use again',()=>{
  const facts=extractCommercialFacts('Soy obrero, ¿me sirve?',{activeProduct:'Armor 22'});
  assert.equal(facts.useCase,'trabajo');
  const spin=evaluateSpinReadiness({...facts,activeProduct:'Armor 22'});
  assert.equal(spin.hasSituation,true);
  assert.notEqual(spin.nextMissingFact,'uso principal');
});

test('deterministic evaluate-use intent outranks planner product-info downgrade',()=>{
  const decision=validateTurnDecision(
    turnDecision('PRODUCT_INFO'),
    {activeProduct:'Armor 22',useCase:'trabajo'},
    ['Armor 22'],
    turnDecision('EVALUATE_USE'),
  );
  assert.equal(decision.primaryIntent,'EVALUATE_USE');
});

test('worker suitability produces a grounded answer before any discovery question',()=>{
  const answer=buildGroundedDirectAnswer({
    message:'Soy obrero, ¿me sirve el Armor 22?',
    intent:'EVALUATE_USE',
    attribute:null,
    resolvedProduct:'Armor 22',
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí'},
      {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí'},
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m'},
      {domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh'},
    ] as any,
  });
  assert.ok(answer);
  assert.match(answer,/Armor 22/i);
  assert.match(answer,/trabajo/i);
  assert.match(answer,/IP68|1\.5 m|6600 mAh/i);
});

test('work use plus fall problem continues discovery before price or fulfillment close',()=>{
  const state={
    activeProduct:'Armor 22',
    useCase:'trabajo',
    problem:'caidas_frecuentes',
    spinFacts:['uso:trabajo','problema:caidas_frecuentes'],
  } as any;
  assert.equal(evaluateSpinReadiness(state).nextMissingFact,'impacto');
  assert.equal(nextBestAction('EVALUATE_USE',state),'ASK_MISSING_FACT');
  const progression=evaluatePostAnswerCommercialProgression({
    intent:'EVALUATE_USE',
    currentNba:'ASK_MISSING_FACT',
    state,
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
  });
  assert.equal(progression.candidateNba,'ASK_MISSING_FACT');
  assert.equal(progression.reason,'SPIN_NEEDS_IMPLICATION');
});

test('decision validator removes the primary intent from secondary intents',()=>{
  const planner={...turnDecision('EVALUATE_USE'),secondaryIntents:['EVALUATE_USE','PRODUCT_INFO']};
  const decision=validateTurnDecision(planner,{activeProduct:'Armor 22'},['Armor 22'],turnDecision('EVALUATE_USE'));
  assert.deepEqual(decision.secondaryIntents,['PRODUCT_INFO']);
});

test('decision validator does not persist a singleton comparison product',()=>{
  const planner={...turnDecision('EVALUATE_USE'),comparisonProducts:['Armor 22']};
  const decision=validateTurnDecision(planner,{activeProduct:'Armor 22'},['Armor 22'],turnDecision('EVALUATE_USE'));
  assert.deepEqual(decision.comparisonProducts,[]);
});

test('evaluate-use attributes come from the current deterministic message instead of planner feature dumps',()=>{
  const planner={...turnDecision('EVALUATE_USE'),attributes:['8 GB RAM + HASTA 8 GB VIRTUAL','256 GB INTERNO','6600 MAH BATERÍA']};
  const noAttribute=validateTurnDecision(planner,{activeProduct:'Armor 22',useCase:'trabajo'},['Armor 22'],turnDecision('EVALUATE_USE'));
  assert.deepEqual(noAttribute.attributes,[]);

  const deterministic={...turnDecision('EVALUATE_USE'),attributes:['RESISTENCIA']};
  const resistance=validateTurnDecision(planner,{activeProduct:'Armor 22',useCase:'trabajo'},['Armor 22'],deterministic);
  assert.deepEqual(resistance.attributes,['RESISTENCIA']);
});

test('exploring one product does not create a comparison pair',()=>{
  const next=reduceState({}, {
    lastIntent:'PRODUCT_INFO',
    lastRoute:'RAG_PRODUCT',
    queryTarget:'Armor 22',
    salientProduct:'Armor 22',
    activeProduct:'Armor 22',
    lastUserMessage:'info del armor 22',
  } as any);
  assert.deepEqual(next.exploredProducts,['Armor 22']);
  assert.deepEqual(next.comparisonProducts,[]);
});
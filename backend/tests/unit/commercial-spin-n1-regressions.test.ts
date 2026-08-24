import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpinReadiness } from '../../src/conversation/nba/SpinProgression.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { isNbaCompatible } from '../../src/conversation/nba/NbaCompatibility.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, TurnDecision } from '../../src/ports/LlmProvider.ts';

function decision(patch:Partial<TurnDecision>):TurnDecision{
  return{
    primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
    explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,
    customerProblem:null,priorities:[],objection:null,commercialStage:null,spinContribution:null,
    nextBestAction:null,needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.9,
    ...patch,
  };
}

const echoWriter:LlmProvider={
  async write(){return{text:'Tomo ese dato como contexto.',model:'test-writer',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};},
};

test('SPIN exposes the next missing conversational fact in order without making budget a generic step',()=>{
  const empty=evaluateSpinReadiness({});
  assert.equal(empty.nextMissingFact,'uso principal');
  assert.equal(empty.stage,'SITUATION');

  const situation=evaluateSpinReadiness({useCase:'trabajo_construccion'});
  assert.equal(situation.nextMissingFact,'problema principal');
  assert.equal(situation.stage,'PROBLEM');

  const problem=evaluateSpinReadiness({useCase:'trabajo_construccion',problem:'caidas_frecuentes'});
  assert.equal(problem.nextMissingFact,'impacto del problema');
  assert.equal(problem.stage,'IMPLICATION');

  const implication=evaluateSpinReadiness({useCase:'trabajo_construccion',problem:'caidas_frecuentes',spinFacts:['implicacion:me hace perder tiempo en obra']});
  assert.equal(implication.nextMissingFact,'prioridad principal');
  assert.equal(implication.stage,'NEED_PAYOFF');
});

test('an explicitly stated need can skip redundant SPIN questions',()=>{
  const spin=evaluateSpinReadiness({useCase:'trabajo_en_campo',priorities:['resistencia']});
  assert.equal(spin.hasSituation,true);
  assert.equal(spin.hasNeed,true);
  assert.equal(spin.nextMissingFact,null);
  assert.equal(spin.stage,'READY');
  assert.equal(spin.readyForRecommendation,true);
});

test('broad PRODUCT_INFO opens one useful SPIN question while a focused capability stays factual',()=>{
  assert.equal(nextBestAction('PRODUCT_INFO',{}),'ASK_MISSING_FACT');
  assert.equal(nextBestAction('CAPABILITY',{}),'ANSWER_ONLY');
  assert.equal(isNbaCompatible('PRODUCT_INFO','ASK_MISSING_FACT',{}),true);
});

test('deterministic N+1 outranks a conflicting compatible planner proposal',()=>{
  const plannerOverview=decision({primaryIntent:'PRODUCT_INFO',nextBestAction:'ANSWER_ONLY',targetProduct:'Armor 22'});
  const deterministicOverview=decision({primaryIntent:'PRODUCT_INFO',nextBestAction:'ASK_MISSING_FACT',targetProduct:'Armor 22'});
  const overview=validateTurnDecision(plannerOverview,{activeProduct:'Armor 22'},['Armor 22'],deterministicOverview);
  assert.equal(overview.nextBestAction,'ASK_MISSING_FACT');

  const plannerCapability=decision({primaryIntent:'CAPABILITY',attributes:['NFC'],nextBestAction:'SOFT_CLOSE',targetProduct:'Armor 22'});
  const deterministicCapability=decision({primaryIntent:'CAPABILITY',attributes:['NFC'],nextBestAction:'ANSWER_ONLY',targetProduct:'Armor 22'});
  const capability=validateTurnDecision(plannerCapability,{activeProduct:'Armor 22'},['Armor 22'],deterministicCapability);
  assert.equal(capability.nextBestAction,'ANSWER_ONLY');
});

test('recommendation can use one SPIN discovery N+1 before enough context exists',()=>{
  assert.equal(nextBestAction('RECOMMEND',{priorities:['resistencia','bateria']}),'ASK_MISSING_FACT');
  assert.equal(isNbaCompatible('RECOMMEND','ASK_MISSING_FACT',{}),true);
  const prepared=prepareCommercialWriteInput({
    message:'Busco uno resistente y con buena batería, ¿qué me recomiendas?',intent:'RECOMMEND',
    state:{priorities:['resistencia','bateria']},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    allowedProducts:[],
  });
  assert.equal(prepared.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(prepared.missingFact,'uso principal');
});

test('construction problem does not jump to budget as the next SPIN question',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Trabajo en construcción y se me cae seguido el celular.',intent:'EVALUATE_USE',
    state:{useCase:'trabajo_construccion',problem:'caidas_frecuentes'},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    allowedProducts:[],
  });
  assert.notEqual(prepared.missingFact,'presupuesto máximo');
  assert.equal(prepared.missingFact,'impacto del problema');
});

test('writer executes the authorized implication question and only one question',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Se me cae seguido el celular.',intent:'EVALUATE_USE',
    state:{useCase:'trabajo_construccion',problem:'caidas_frecuentes'},decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    allowedProducts:[],
  });
  const result=await safeWrite(echoWriter,prepared,'Tomo ese dato como contexto.');
  assert.equal(result.nextBestAction,'ASK_MISSING_FACT');
  assert.equal(result.missingFact,'impacto del problema');
  assert.match(result.answer,/genera|interrupciones|p[eé]rdida de tiempo/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
});

test('interest language cannot be escalated by the planner into PURCHASE',()=>{
  const planner=decision({primaryIntent:'PURCHASE',nextBestAction:'COLLECT_RESERVATION_DATA',targetProduct:'Armor 22'});
  const deterministic=decision({primaryIntent:'OTHER',nextBestAction:'ANSWER_ONLY',targetProduct:'Armor 22'});
  const result=validateTurnDecision(planner,{activeProduct:'Armor 22',interestSignal:true,purchaseSignal:false},['Armor 22'],deterministic);
  assert.notEqual(result.primaryIntent,'PURCHASE');
  assert.notEqual(result.nextBestAction,'COLLECT_RESERVATION_DATA');
});

test('explicit purchase remains authoritative',()=>{
  const planner=decision({primaryIntent:'PURCHASE',nextBestAction:'COLLECT_RESERVATION_DATA',targetProduct:'Armor 22'});
  const deterministic=decision({primaryIntent:'PURCHASE',nextBestAction:'COLLECT_RESERVATION_DATA',targetProduct:'Armor 22'});
  const result=validateTurnDecision(planner,{activeProduct:'Armor 22',purchaseSignal:true},['Armor 22'],deterministic);
  assert.equal(result.primaryIntent,'PURCHASE');
  assert.equal(result.nextBestAction,'COLLECT_RESERVATION_DATA');
});

test('current deterministic use-case or budget recommendation outranks stale comparison context',()=>{
  const planner=decision({primaryIntent:'COMPARE',comparisonProducts:['Armor X13','Armor 22'],nextBestAction:'RECOMMEND'});
  const useCase=decision({primaryIntent:'EVALUATE_USE',comparisonProducts:['Armor X13','Armor 22'],nextBestAction:'RECOMMEND'});
  const useResult=validateTurnDecision(planner,{comparisonProducts:['Armor X13','Armor 22'],useCase:'delivery'},['Armor X13','Armor 22'],useCase);
  assert.equal(useResult.primaryIntent,'EVALUATE_USE');

  const budget=decision({primaryIntent:'RECOMMEND_WITHIN_BUDGET',comparisonProducts:['Armor X13','Armor 22'],nextBestAction:'RECOMMEND'});
  const budgetResult=validateTurnDecision(planner,{comparisonProducts:['Armor X13','Armor 22'],budget:1500},['Armor X13','Armor 22'],budget);
  assert.equal(budgetResult.primaryIntent,'RECOMMEND_WITHIN_BUDGET');
});

test('factual turns cannot persist planner-created SPIN contribution',()=>{
  const planner=decision({primaryIntent:'CAPABILITY',spinContribution:'NECESIDAD_SOLUCION',priorities:['nfc'],customerNeed:'pagar con el celular'});
  const deterministic=decision({primaryIntent:'CAPABILITY',attributes:['NFC'],nextBestAction:'ANSWER_ONLY'});
  const result=validateTurnDecision(planner,{activeProduct:'Armor 22'},['Armor 22'],deterministic);
  assert.equal(result.spinContribution,null);
  assert.deepEqual(result.priorities,[]);
  assert.equal(result.customerNeed,null);
});

test('neutral OTHER turns cannot fabricate SPIN memory unless answering a pending SPIN question',()=>{
  const planner=decision({primaryIntent:'OTHER',spinContribution:'SITUACION',priorities:['confirmar demanda'],customerNeed:'asegurar compra',customerProblem:'se puede agotar',nextBestAction:'ANSWER_ONLY'});
  const deterministic=decision({primaryIntent:'OTHER',nextBestAction:'ANSWER_ONLY'});
  const neutral=validateTurnDecision(planner,{activeProduct:'Armor 22'},['Armor 22'],deterministic);
  assert.equal(neutral.customerNeed,null);
  assert.equal(neutral.customerProblem,null);
  assert.equal(neutral.spinContribution,null);
  assert.deepEqual(neutral.priorities,[]);

  const pending=validateTurnDecision(decision({...planner,spinContribution:'IMPLICACION'}),{activeProduct:'Armor 22',useCase:'trabajo',problem:'caidas',pendingMissingFact:'impacto del problema'},['Armor 22'],deterministic);
  assert.equal(pending.spinContribution,'IMPLICACION');
});

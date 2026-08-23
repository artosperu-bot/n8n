import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';

test('affirmative reply after stock soft-close enters purchase reservation flow',()=>{
  const previous:any={
    sessionId:'live-test',
    activeProduct:'Armor X12 Pro',
    queryTarget:'Armor X12 Pro',
    salientProduct:'Armor X12 Pro',
    selectedProduct:null,
    recommendedProduct:'Armor X12 Pro',
    comparisonProducts:[],
    lastIntent:'STOCK',
    lastNba:'SOFT_CLOSE',
    pendingCommercialAction:'SOFT_CLOSE',
    lastAssistantMessage:'Sí, está disponible. ¿Quieres avanzar con ese modelo?',
    purchaseSignal:false,
    interestSignal:true,
    quantity:1,
  };

  const facts=extractCommercialFacts('si',previous);
  assert.equal(facts.purchaseSignal,true,'the short affirmative must consume the prior purchase-oriented soft close');

  const state:any={...previous,...facts};
  const planner:any={
    primaryIntent:'PURCHASE_INTENT',secondaryIntents:[],targetProduct:'Armor X12 Pro',mentionedProducts:[],
    referenceType:'ACTIVE_PRODUCT_FALLBACK',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],
    customerNeed:null,customerProblem:null,priorities:[],objection:null,commercialStage:'CIERRE',spinContribution:null,
    nextBestAction:'COLLECT_RESERVATION_DATA',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.99,
  };
  const fallback:any={...planner,primaryIntent:'OTHER',nextBestAction:'COLLECT_RESERVATION_DATA'};
  const decision=validateTurnDecision(planner,state,['Armor X12 Pro'],fallback);

  assert.equal(decision.primaryIntent,'PURCHASE');
  assert.equal(decision.selectedProduct,'Armor X12 Pro');
  assert.equal(decision.nextBestAction,'COLLECT_RESERVATION_DATA');
});

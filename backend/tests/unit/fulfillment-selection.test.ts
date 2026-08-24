import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { isNbaCompatible } from '../../src/conversation/nba/NbaCompatibility.ts';

test('FULFILLMENT_SELECTION survives decision validation and stays on reservation close',()=>{
  const state={
    activeProduct:'Armor 22',
    lastNba:'SOFT_CLOSE',
    pendingCommercialAction:'SOFT_CLOSE',
    lastAssistantMessage:'Armor 22 está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recogerlo en nuestro local?',
  } as any;
  const decision={
    primaryIntent:'FULFILLMENT_SELECTION',secondaryIntents:[],targetProduct:'Armor 22',mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:['ENVÍO'],customerNeed:null,customerProblem:null,priorities:[],objection:null,commercialStage:'CONSIDERACION',spinContribution:null,nextBestAction:'SOFT_CLOSE',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.99,
  } as any;
  const fallback={...decision,primaryIntent:'POLICY',needsInstitutionalRag:true} as any;
  const validated=validateTurnDecision(decision,state,['Armor 22'],fallback);
  assert.equal(validated.primaryIntent,'FULFILLMENT_SELECTION');
  assert.equal(validated.nextBestAction,'SOFT_CLOSE');
  assert.equal(validated.needsInstitutionalRag,false);
});

test('FULFILLMENT_SELECTION is compatible only with the reservation soft close',()=>{
  const state={activeProduct:'Armor 22',lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE'} as any;
  assert.equal(nextBestAction('FULFILLMENT_SELECTION',state),'SOFT_CLOSE');
  assert.equal(isNbaCompatible('FULFILLMENT_SELECTION','SOFT_CLOSE',state),true);
  assert.equal(isNbaCompatible('FULFILLMENT_SELECTION','ASK_MISSING_FACT',state),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';

const base:any={
  primaryIntent:'GREETING',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
  explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,
  priorities:[],objection:null,commercialStage:null,spinContribution:null,nextBestAction:'WAIT_FOR_NEXT_QUESTION',
  needsSql:true,needsProductRag:true,needsInstitutionalRag:true,confidence:0.9,
};

test('GPT routing flags cannot force SQL or RAG on a greeting',()=>{
  const validated=validateTurnDecision(base,{},[],{...base,needsSql:false,needsProductRag:false,needsInstitutionalRag:false});
  assert.equal(validated.needsSql,false);
  assert.equal(validated.needsProductRag,false);
  assert.equal(validated.needsInstitutionalRag,false);
});

test('code derives authoritative sources from canonical intent',()=>{
  const price=validateTurnDecision({...base,primaryIntent:'PRICE',needsSql:false}, {}, [], {...base,primaryIntent:'PRICE',needsSql:false});
  assert.equal(price.needsSql,true);
  assert.equal(price.needsProductRag,false);
  const policy=validateTurnDecision({...base,primaryIntent:'POLICY',needsInstitutionalRag:false}, {}, [], {...base,primaryIntent:'POLICY',needsInstitutionalRag:false});
  assert.equal(policy.needsInstitutionalRag,true);
  assert.equal(policy.needsSql,false);
});

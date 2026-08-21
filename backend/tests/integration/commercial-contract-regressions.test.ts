import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmWriteInput, TurnDecision } from '../../src/ports/LlmProvider.ts';

const usage = { inputTokens:10, outputTokens:5, totalTokens:15, cachedInputTokens:0 };
function result(decision:TurnDecision):LlmDecisionResult {
  return { decision, model:'gpt-5-mini-test', usage, durationMs:1 };
}
function baseDecision(patch:Partial<TurnDecision>):TurnDecision {
  return {
    primaryIntent:'OTHER', secondaryIntents:[], targetProduct:null, mentionedProducts:[], referenceType:null,
    explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null,
    customerProblem:null, priorities:[], objection:null, commercialStage:null, spinContribution:null,
    nextBestAction:'WAIT_FOR_NEXT_QUESTION', needsSql:false, needsProductRag:false,
    needsInstitutionalRag:false, confidence:0.95, ...patch,
  };
}
function deps(llm:LlmProvider, conversations=new MemoryConversationRepository()) {
  return {
    conversations,
    telemetry:new NoopTelemetryRepository(),
    erp:new FakeErpRepository(),
    rag:new FakeRagRepository(),
    llm,
    automation:new NoopAutomationBus(),
  };
}

test('mere mention of a second product does not force comparison or switch active product', async () => {
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-mention',{
    sessionId:'s-mention', contextVersion:0, turnCount:2,
    activeProduct:'Armor X13', activeProductId:'P-ARMOR-X13', activeProductCode:'P000048',
    salientProduct:'Armor X13', comparisonProducts:[], spinFacts:[], priorities:[],
  });
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(_input:LlmDecisionInput){
      return result(baseDecision({
        primaryIntent:'COMPARE', targetProduct:'Armor X13', mentionedProducts:['Armor 22'],
        referenceType:'ACTIVE_PRODUCT_FALLBACK', comparisonProducts:['Armor 22'],
        needsSql:true, needsProductRag:true, nextBestAction:'GUIDE_SELECTION',
      }));
    },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-mention', message:'También estoy viendo el Armor 22.', messageId:'m-mention',
  });
  assert.notEqual(r.debug.intent,'COMPARE');
  assert.doesNotMatch(r.answer,/qué dos modelos quieres comparar/i);
  assert.equal(r.state.activeProduct,'Armor X13');
  assert.equal(r.state.salientProduct,'Armor 22');
  assert.deepEqual(r.state.comparisonProducts,['Armor X13','Armor 22']);
  assert.equal(r.state.explicitSwitch,false);
});

test('after unknown product alternatives, ambiguous price continues with recommended real alternative instead of stale unknown', async () => {
  const conversations=new MemoryConversationRepository();
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(input:LlmDecisionInput){
      if(/armor 30/i.test(input.message)){
        return result(baseDecision({
          primaryIntent:'PRODUCT_INFO', targetProduct:'Armor 30', mentionedProducts:['Armor 30'],
          referenceType:'NAMED', needsSql:true, needsProductRag:true,
          customerNeed:'trabajo', priorities:['resistencia'], nextBestAction:'OFFER_ALTERNATIVES',
        }));
      }
      return result(baseDecision({
        primaryIntent:'PRICE', targetProduct:'Armor 30', referenceType:'ACTIVE_PRODUCT_FALLBACK',
        needsSql:true, nextBestAction:'ADVANCE_IF_INTEREST',
      }));
    },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const engine=new HybridConversationEngine(deps(llm,conversations));
  const first=await engine.processTurn({sessionId:'s-unknown-follow',message:'¿Tienen Armor 30 para trabajo?',messageId:'m-u1'});
  assert.ok(first.state.recommendedProduct);
  const recommended=first.state.recommendedProduct!;
  assert.notEqual(recommended,'Armor 30');

  const second=await engine.processTurn({sessionId:'s-unknown-follow',message:'¿Cuánto cuesta?',messageId:'m-u2'});
  assert.equal(second.debug.intent,'PRICE');
  assert.equal(second.debug.queryTarget,recommended);
  assert.match(second.answer,/S\/\s*\d+/);
  assert.doesNotMatch(second.answer,/Armor 30.*no aparece|No encuentro Armor 30/i);
});

test('strong institutional pre-router wins when semantic planner returns OTHER', async () => {
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){ return result(baseDecision({ primaryIntent:'OTHER', nextBestAction:'DISCOVER_ONE_FACT' })); },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm)).processTurn({
    sessionId:'s-institutional-prerouter', message:'hasta q hora atienden?', messageId:'m-institutional-prerouter',
  });
  assert.equal(r.debug.intent,'POLICY');
  assert.equal(r.debug.route,'RAG_INSTITUTIONAL');
  assert.equal(r.state.requiresRag,true);
});

test('el otro inherits the previous factual intent while resolving the comparison alternative', async () => {
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-intent-inheritance',{
    sessionId:'s-intent-inheritance', contextVersion:0, turnCount:3,
    activeProduct:'Armor X13', activeProductId:'P-ARMOR-X13', activeProductCode:'P000048',
    queryTarget:'Armor X13', salientProduct:'Armor X13', comparisonProducts:['Armor X13','Armor 22'],
    lastIntent:'PRICE', spinFacts:[], priorities:[],
  });
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){ return result(baseDecision({ primaryIntent:'OTHER', nextBestAction:'DISCOVER_ONE_FACT' })); },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-intent-inheritance', message:'y el otro?', messageId:'m-intent-inheritance',
  });
  assert.equal(r.debug.intent,'PRICE');
  assert.equal(r.debug.queryTarget,'Armor 22');
  assert.match(r.answer,/S\/\s*1199/);
});

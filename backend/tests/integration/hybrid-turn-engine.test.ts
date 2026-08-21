import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmProvider, LlmDecisionInput, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

function deps(llm: LlmProvider, conversations = new MemoryConversationRepository()) {
  return { conversations, telemetry:new NoopTelemetryRepository(), erp:new FakeErpRepository(), rag:new FakeRagRepository(), llm, automation:new NoopAutomationBus() };
}

test('hybrid engine lets semantic planner reason but hard guard preserves recent selection on purchase', async () => {
  const conversations = new MemoryConversationRepository();
  await conversations.saveState('s-hybrid', {
    activeProduct:'Armor 22', selectedProduct:'Armor 22', salientProduct:'Armor 22', recommendedProduct:'Armor 25T Pro',
    comparisonProducts:['Armor X13','Armor 22'], turnCount:4
  });
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide(_input: LlmDecisionInput) {
      return { decision:{
        primaryIntent:'PURCHASE', secondaryIntents:[], targetProduct:'Armor 25T Pro', mentionedProducts:[], referenceType:'SELECTION',
        explicitSwitch:false, selectedProduct:'Armor 25T Pro', comparisonProducts:['Armor X13','Armor 22'], attributes:[],
        customerNeed:null, customerProblem:null, priorities:[], objection:null, commercialStage:'DECISION', spinContribution:null,
        nextBestAction:'ASK_BUDGET', needsSql:true, needsProductRag:false, needsInstitutionalRag:false, confidence:0.98
      }, model:'gpt-5-mini-test', usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:0}, durationMs:1 };
    },
    write(input: LlmWriteInput){ return base.write(input); }
  };
  const engine = new HybridConversationEngine(deps(llm, conversations));
  const r = await engine.processTurn({sessionId:'s-hybrid',message:'Entonces me quedo con ese'});
  assert.equal(r.state.selectedProduct,'Armor 22');
  assert.equal(r.state.activeProduct,'Armor 22');
  assert.equal(r.state.lastNba,'ASSISTED_HANDOFF');
  assert.equal(r.state.handoffActive,true);
  assert.match(r.answer,/Armor 22/);
});

test('unknown requested product recovers with verified catalog alternatives instead of a dead end', async () => {
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide() {
      return { decision:{
        primaryIntent:'PRODUCT_INFO', secondaryIntents:[], targetProduct:'Armor 30', mentionedProducts:['Armor 30'], referenceType:'NAMED',
        explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:'construccion', customerProblem:'caidas frecuentes',
        priorities:['resistencia','bateria'], objection:null, commercialStage:'DESCUBRIMIENTO', spinContribution:'problema:caidas', nextBestAction:'OFFER_ALTERNATIVES',
        needsSql:true, needsProductRag:true, needsInstitutionalRag:false, confidence:0.96
      }, model:'gpt-5-mini-test', usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:0}, durationMs:1 };
    },
    write(input: LlmWriteInput){ return base.write(input); }
  };
  const engine = new HybridConversationEngine(deps(llm));
  const r = await engine.processTurn({sessionId:'s-unknown',message:'Busco el Armor 30 para construcción'});
  assert.doesNotMatch(r.answer,/no tengo ese dato confirmado todavía/i);
  assert.match(r.answer,/Armor X12 Pro|Armor X13|Armor 22|Armor 25T Pro/);
  assert.equal(r.state.lastNba,'OFFER_ALTERNATIVES');
});

test('direct image request remains a deterministic URL-only fast path', async () => {
  const engine = new HybridConversationEngine(deps(new FakeLlmProvider()));
  const r = await engine.processTurn({sessionId:'s-images',message:'Mándame imágenes del Armor 22'});
  assert.match(r.answer,/^https:\/\//);
  assert.doesNotMatch(r.answer,/aqui|imagen|foto/i);
});

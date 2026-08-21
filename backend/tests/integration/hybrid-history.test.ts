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

test('engine supplies at most the last three complete turns to semantic planner', async () => {
  const conversations = new MemoryConversationRepository();
  for (let i = 1; i <= 4; i += 1) {
    await conversations.appendMessage('s-history','user',`u${i}`);
    await conversations.appendMessage('s-history','assistant',`a${i}`);
  }
  await conversations.saveState('s-history',{ activeProduct:'Armor 22', recommendedProduct:'Armor 22', turnCount:4, comparisonProducts:[], spinFacts:[] });
  let captured: LlmDecisionInput | null = null;
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide(input) {
      captured = input;
      return { decision:{
        primaryIntent:'PRICE', secondaryIntents:[], targetProduct:'Armor 22', mentionedProducts:[], referenceType:'RECOMMENDED',
        explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null, customerProblem:null,
        priorities:[], objection:null, commercialStage:null, spinContribution:null, nextBestAction:'ADVANCE_IF_INTEREST',
        needsSql:false, needsProductRag:false, needsInstitutionalRag:false, confidence:0.95,
      }, model:'gpt-5-mini-test', usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0}, durationMs:1 };
    },
    write(input: LlmWriteInput) { return base.write(input); },
  };
  const engine = new HybridConversationEngine({ conversations, telemetry:new NoopTelemetryRepository(), erp:new FakeErpRepository(), rag:new FakeRagRepository(), llm, automation:new NoopAutomationBus() });
  await engine.processTurn({ sessionId:'s-history', message:'¿y ese cuánto está?' });

  const history = (captured as any)?.history ?? [];
  assert.deepEqual(history.map((x:any)=>x.content), ['u2','a2','u3','a3','u4','a4']);
});

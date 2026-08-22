import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { RecentHistoryLlmProvider } from '../../src/conversation/history/RecentHistoryLlmProvider.ts';
import type { LlmProvider, LlmDecisionInput, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

test('recent history provider supplies at most the last two complete turns to semantic planner', async () => {
  const conversations = new MemoryConversationRepository();
  for (let i = 1; i <= 4; i += 1) {
    await conversations.appendMessage('s-history','user',`u${i}`);
    await conversations.appendMessage('s-history','assistant',`a${i}`);
  }
  let captured: LlmDecisionInput | null = null;
  const inner: LlmProvider = {
    async decide(input) {
      captured = input;
      return { decision:{
        primaryIntent:'PRICE', secondaryIntents:[], targetProduct:'Armor 22', mentionedProducts:[], referenceType:'RECOMMENDED',
        explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null, customerProblem:null,
        priorities:[], objection:null, commercialStage:null, spinContribution:null, nextBestAction:'ADVANCE_IF_INTEREST',
        needsSql:false, needsProductRag:false, needsInstitutionalRag:false, confidence:0.95,
      }, model:'gpt-5-mini-test', usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0}, durationMs:1 };
    },
    async write(_input: LlmWriteInput) {
      return { text:'ok', model:'gpt-5-mini-test', usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0}, durationMs:1 };
    },
  };
  const llm = new RecentHistoryLlmProvider(inner, conversations, 4);
  await llm.decide!({ message:'¿y ese cuánto está?', state:{ sessionId:'s-history', activeProduct:'Armor 22' } });

  const history = captured?.history ?? [];
  assert.deepEqual(history.map(x=>x.content), ['u3','a3','u4','a4']);
});

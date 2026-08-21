import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationEngine } from '../../src/conversation/ConversationEngine.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';

function defaultState(sessionId: string) {
  return { sessionId, turnCount: 0, comparisonProducts: [], spinFacts: [] };
}

test('QA requests use the full messageId as globally unique requestId', async () => {
  const userMeta: any[] = [];
  const states = new Map<string, any>();
  const conversations: any = {
    async getState(sessionId: string) { return states.get(sessionId) ?? defaultState(sessionId); },
    async saveState(sessionId: string, state: any) { states.set(sessionId, state); },
    async appendMessage(_sessionId: string, role: string, _content: string, meta?: any) {
      if (role === 'user') userMeta.push(meta);
    },
    async getMessages() { return []; },
    async reset() {},
  };

  const engine = new ConversationEngine({
    conversations,
    telemetry: new NoopTelemetryRepository(),
    erp: new FakeErpRepository(),
    rag: new FakeRagRepository(),
    llm: new FakeLlmProvider(),
    automation: new NoopAutomationBus(),
  });

  await engine.processTurn({
    sessionId: 'qa-20260821-004316-932a-CASE-A',
    message: 'Hola',
    messageId: 'qa-20260821-004316-932a:CASE-A:t01',
  });
  await engine.processTurn({
    sessionId: 'qa-20260821-004316-932a-CASE-B',
    message: 'Hola',
    messageId: 'qa-20260821-004316-932a:CASE-B:t01',
  });

  assert.equal(userMeta[0].requestId, 'qa-20260821-004316-932a:CASE-A:t01');
  assert.equal(userMeta[1].requestId, 'qa-20260821-004316-932a:CASE-B:t01');
  assert.notEqual(userMeta[0].requestId, userMeta[1].requestId);
});

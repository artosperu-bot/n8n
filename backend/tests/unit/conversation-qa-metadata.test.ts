import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

test('QA messages persist trace ids and use qa_live channel', async () => {
  const calls: any[] = [];
  const fetcher: typeof fetch = async (url, init: any = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), method: init.method ?? 'GET', body });
    if (String(url).includes('/ia_conversaciones') && init.method === 'POST') {
      return Response.json([{ id: 'turn-1' }], { status: 201 });
    }
    return new Response(null, { status: 204 });
  };
  const repo = new SupabaseConversationRepository({
    url: 'https://example.supabase.co',
    key: 'service',
    fetcher,
  });

  await repo.appendMessage('qa-20260820-run-REF-001', 'user', 'precio?', {
    messageId: 'qa-run:REF-001:t01',
    requestId: 'qa-run',
    conversationType: 'QA_LIVE',
  });
  await repo.saveState('qa-20260820-run-REF-001', {
    sessionId: 'qa-20260820-run-REF-001',
    turnCount: 1,
    lastIntent: 'PRICE',
    queryTarget: 'Armor X13',
    comparisonProducts: [],
    spinFacts: [],
  });
  await repo.appendMessage('qa-20260820-run-REF-001', 'assistant', 'S/ 899', { model: 'gpt-live' });

  const session = calls.find(c => c.url.includes('/ia_sesiones'));
  assert.equal(session.body[0].canal, 'qa_live');
  const insert = calls.find(c => c.url.endsWith('/ia_conversaciones') && c.method === 'POST');
  assert.equal(insert.body[0].message_id, 'qa-run:REF-001:t01');
  assert.equal(insert.body[0].request_id, 'qa-run');
  assert.equal(insert.body[0].tipo_conversacion, 'QA_LIVE');
  const patch = calls.find(c => c.url.includes('/ia_conversaciones?id=eq.turn-1') && c.method === 'PATCH');
  assert.equal(patch.body.modelo, 'gpt-live');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseTelemetryRepository } from '../../src/adapters/supabase/SupabaseTelemetryRepository.ts';

test('persists non-secret LLM metrics in ia_metricas_tokens', async () => {
  let target = '';
  let body: any;
  const fetcher: typeof fetch = async (url, init) => {
    target = String(url);
    body = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  };
  const repo = new SupabaseTelemetryRepository({
    url: 'https://example.supabase.co',
    key: 'service-key',
    fetcher,
  });
  await repo.recordLlmUsage({
    sessionId: 'qa-run-case',
    turn: 2,
    route: 'PRICE',
    model: 'gpt-test',
    inputTokens: 120,
    outputTokens: 30,
    cachedTokens: 20,
    durationMs: 812,
    messageId: 'qa-run:CASE:t02',
  });
  assert.equal(target, 'https://example.supabase.co/rest/v1/ia_metricas_tokens');
  assert.deepEqual(body, [{
    session_id: 'qa-run-case',
    turno: 2,
    nodo: 'OpenAIProvider',
    ruta: 'PRICE',
    modelo: 'gpt-test',
    tokens_entrada: 120,
    tokens_salida: 30,
    tokens_cacheados: 20,
    duracion_ms: 812,
    message_id: 'qa-run:CASE:t02',
  }]);
});

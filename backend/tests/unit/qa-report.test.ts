import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSecrets, renderMarkdown } from '../../qa/report/render.ts';

test('sanitizer redacts sensitive keys recursively without hiding token metrics', () => {
  const value: any = sanitizeSecrets({
    safe: 'ok',
    message: 'DNI 12345678, correo persona@example.com, celular 987654321',
    reservationAddress: 'Av. privada 123',
    authorization: 'Bearer abc',
    nested: {
      password: 'p',
      token: 't',
      apiKey: 'k',
      SUPABASE_SERVICE_ROLE_KEY: 'sr',
      N8N_WEBHOOK_TOKEN: 'nt',
      inputTokens: 123,
    },
  });
  assert.equal(value.safe, 'ok');
  assert.equal(value.message, 'DNI [REDACTED_ID], correo [REDACTED_EMAIL], celular [REDACTED_PHONE]');
  assert.equal(value.reservationAddress, '[REDACTED]');
  assert.equal(value.authorization, '[REDACTED]');
  assert.equal(value.nested.password, '[REDACTED]');
  assert.equal(value.nested.token, '[REDACTED]');
  assert.equal(value.nested.apiKey, '[REDACTED]');
  assert.equal(value.nested.SUPABASE_SERVICE_ROLE_KEY, '[REDACTED]');
  assert.equal(value.nested.N8N_WEBHOOK_TOKEN, '[REDACTED]');
  assert.equal(value.nested.inputTokens, 123);
});

test('markdown report includes run counts usage and Supabase session ids', () => {
  const md = renderMarkdown({
    runId: 'qa-run',
    startedAt: 'a',
    finishedAt: 'b',
    modes: { llm: 'openai' },
    summary: { scenarios: 1, turns: 1, green: 0, yellow: 1, red: 0 },
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 10 },
    latency: { averageRoundTripMs: 300, averageLlmMs: 200 },
    scenarios: [{
      id: 'C1', family: 'COMMERCIAL', title: 'Caso', sessionId: 'qa-run-C1', status: 'YELLOW',
      turns: [{
        turn: 1, message: 'hola', status: 'YELLOW',
        observation: { httpStatus: 200, ok: true, request: { sessionId: 'qa-run-C1', messageId: 'qa-run:C1:t01', message: 'hola' }, response: { answer: 'hola' }, roundTripMs: 300 },
        findings: [{ level: 'YELLOW', code: 'NBA_MISSING', message: 'x' }],
      }],
    }],
  });
  assert.match(md, /qa-run/);
  assert.match(md, /Total tokens: 120/);
  assert.match(md, /qa-run-C1/);
  assert.match(md, /NBA_MISSING/);
});

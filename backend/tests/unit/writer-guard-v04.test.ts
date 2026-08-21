import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';

const input = { message: 'x', intent: 'OTHER', state: {} };

test('writer failure returns safe fallback instead of throwing', async () => {
  const llm: any = { async write() { throw new Error('OpenAI response incomplete: max_output_tokens'); } };
  const r = await safeWrite(llm, input, 'No quiero inventarte ese dato.');
  assert.equal(r.answer, 'No quiero inventarte ese dato.');
  assert.equal(r.model, 'deterministic-fallback-v0.4');
  assert.equal(r.fallback.delivered, false);
  assert.match(r.fallback.error ?? '', /max_output_tokens/);
  assert.equal(r.llmResult, null);
});

test('successful writer keeps usage and no fallback warning', async () => {
  const result = { text: 'Respuesta', model: 'gpt-test', usage: { totalTokens: 12 }, durationMs: 50 };
  const llm: any = { async write() { return result; } };
  const r = await safeWrite(llm, input, 'fallback');
  assert.equal(r.answer, 'Respuesta');
  assert.equal(r.model, 'gpt-test');
  assert.equal(r.fallback.delivered, true);
  assert.equal(r.llmResult, result);
});

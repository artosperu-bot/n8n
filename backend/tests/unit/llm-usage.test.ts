import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('OpenAIProvider returns text, actual model, token usage and duration', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    model: 'gpt-test-live',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Respuesta final' }] }],
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 20 },
    },
  });
  const llm = new OpenAIProvider({ apiKey: 'test', model: 'configured-model', fetcher });
  const result = await llm.write({
    message: 'precio?',
    intent: 'PRICE',
    state: { queryTarget: 'Armor X13' },
    deterministicAnswer: 'Armor X13: S/ 899.',
  });
  assert.equal(result.text, 'Respuesta final');
  assert.equal(result.model, 'gpt-test-live');
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    cachedInputTokens: 20,
  });
  assert.ok(result.durationMs >= 0);
});

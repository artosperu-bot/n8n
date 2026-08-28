import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('gpt-5 mini uses minimal reasoning and does not impose the 320-token cap', async () => {
  let body: any;
  const fetcher: typeof fetch = async (_u, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ model: 'gpt-5-mini-2025-08-07', output_text: 'Listo', usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } });
  };
  const llm = new OpenAIProvider({ apiKey: 'x', model: 'gpt-5-mini', fetcher });
  await llm.write({ message: 'hola', intent: 'OTHER', state: {} });
  assert.deepEqual(body.reasoning, { effort: 'minimal' });
  assert.equal('max_output_tokens' in body, false);
});

test('incomplete response exposes the real incomplete reason', async () => {
  const fetcher: typeof fetch = async () => Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { output_tokens: 320 } });
  const llm = new OpenAIProvider({ apiKey: 'x', model: 'gpt-5-mini', fetcher });
  await assert.rejects(() => llm.write({ message: 'x', intent: 'OTHER', state: {} }), /incomplete.*max_output_tokens/i);
});

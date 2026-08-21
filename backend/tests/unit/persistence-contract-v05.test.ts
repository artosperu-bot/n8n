import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import type { TurnDecision } from '../../src/ports/LlmProvider.ts';

const baseDecision: TurnDecision = {
  primaryIntent: 'OTHER', secondaryIntents: [], targetProduct: null, mentionedProducts: [],
  referenceType: null, explicitSwitch: false, selectedProduct: null, comparisonProducts: [],
  attributes: [], customerNeed: null, customerProblem: null, priorities: [], objection: null,
  commercialStage: null, spinContribution: null, nextBestAction: null,
  needsSql: false, needsProductRag: false, needsInstitutionalRag: false, confidence: 0.8,
};

test('invalid GPT control vocabulary falls back to canonical intent and N+1 codes', () => {
  const raw: TurnDecision = {
    ...baseDecision,
    primaryIntent: 'precio_query',
    nextBestAction: 'Preguntar versión, luego consultar precio y quizá disponibilidad.',
  };
  const fallback: TurnDecision = {
    ...baseDecision,
    primaryIntent: 'PRICE',
    nextBestAction: 'ADVANCE_IF_INTEREST',
    needsSql: true,
  };
  const validated = validateTurnDecision(raw, { activeProduct: 'Armor X13' }, ['Armor X13'], fallback);
  assert.equal(validated.primaryIntent, 'PRICE');
  assert.equal(validated.nextBestAction, 'ADVANCE_IF_INTEREST');
});

test('structured GPT fields reject objects instead of persisting [object Object]', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    status: 'completed', model: 'gpt-5-mini-2025-08-07',
    output_text: JSON.stringify({
      ...baseDecision,
      primaryIntent: 'EVALUATE_USE',
      spinContribution: { fase: 'S', aporte: 'trabajo en construcción' },
      priorities: [{ tipo: 'resistencia' }],
    }),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
  const provider = new OpenAIProvider({ apiKey: 'TEST_ONLY', model: 'gpt-5-mini-2025-08-07', fetcher });
  const result = await provider.decide!({ message: 'Trabajo en construcción', state: {} });
  assert.equal(result.decision.spinContribution, null);
  assert.deepEqual(result.decision.priorities, []);
  assert.equal(JSON.stringify(result.decision).includes('[object Object]'), false);
});

test('Supabase repository exposes atomic turn persistence instead of split context then PATCH', () => {
  const repo = new SupabaseConversationRepository({ url: 'https://example.supabase.co', key: 'TEST_ONLY', fetcher: (async () => Response.json({})) as typeof fetch });
  assert.equal(typeof (repo as any).beginTurn, 'function');
  assert.equal(typeof (repo as any).completeTurn, 'function');
});

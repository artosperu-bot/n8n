import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommercial } from '../../qa/evaluators/commercial.ts';

const observation = (answer: string, debug: any = {}) => ({
  httpStatus: 200,
  ok: true,
  request: { sessionId: 'qa-x', messageId: 'qa:x:t01', message: 'Está muy caro' },
  response: { answer, state: { lastNba: 'HANDLE_OBJECTION' }, debug },
  roundTripMs: 10,
});

test('commercial evaluator flags multiple questions and robotic meta language', () => {
  const findings = evaluateCommercial(observation('Como modelo de IA, ¿qué buscas? ¿Para cuándo?'));
  assert.ok(findings.some(x => x.code === 'TOO_MANY_QUESTIONS'));
  assert.ok(findings.some(x => x.code === 'ROBOTIC_META_LANGUAGE'));
});

test('price objection needs acknowledgement', () => {
  const findings = evaluateCommercial(observation('Compra el Armor X13 porque es mejor.', { intent: 'HANDLE_PRICE_OBJECTION', priceObjection: true }));
  assert.ok(findings.some(x => x.code === 'EMPATHY_WEAK_PRICE_OBJECTION'));
});

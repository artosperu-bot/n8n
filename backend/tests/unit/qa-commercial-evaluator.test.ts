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

test('telemetry and n8n delivery failures are advisory yellow findings', () => {
  const findings = evaluateCommercial(observation('Entiendo, busquemos una opción que encaje.', {
    intent: 'HANDLE_PRICE_OBJECTION',
    priceObjection: true,
    telemetry: { delivered: false, error: 'metrics down' },
    automation: { delivered: false, error: 'n8n 500' },
  }));
  assert.ok(findings.some(x => x.code === 'TELEMETRY_DELIVERY_FAILED'));
  assert.ok(findings.some(x => x.code === 'AUTOMATION_DELIVERY_FAILED'));
  assert.equal(findings.some(x => x.level === 'RED'), false);
});

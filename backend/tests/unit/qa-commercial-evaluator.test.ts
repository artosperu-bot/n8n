import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommercial } from '../../qa/evaluators/commercial.ts';

const observation = (answer: string, debug: any = {}, state: any = { lastNba: 'HANDLE_OBJECTION' }, message = 'Está muy caro') => ({
  httpStatus: 200,
  ok: true,
  request: { sessionId: 'qa-x', messageId: 'qa:x:t01', message },
  response: { answer, state, debug },
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

test('comparison length uses the wider chat guidance without relaxing normal replies', () => {
  const comparison = evaluateCommercial(observation('x'.repeat(700), { intent: 'COMPARE' }));
  const normal = evaluateCommercial(observation('x'.repeat(700), { intent: 'PRODUCT_INFO' }));
  assert.equal(comparison.some(x => x.code === 'CHAT_TOO_LONG'), false);
  assert.equal(normal.some(x => x.code === 'CHAT_TOO_LONG'), true);
});

test('ASK_MISSING_FACT fails delivery when the answer never asks for the missing fact', () => {
  const findings=evaluateCommercial(observation(
    'Te recomiendo revisar resistencia y batería.',
    {intent:'EVALUATE_USE'},
    {lastNba:'ASK_MISSING_FACT',commercialStage:'DESCUBRIMIENTO',useCase:'construccion',problem:'caidas'},
    'Trabajo en construcción y se me cae el celular.',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_NOT_DELIVERED'));
});

test('SOFT_CLOSE fails delivery when conditional stock interest gets only a factual answer', () => {
  const findings=evaluateCommercial(observation(
    'Sí, está disponible.',
    {intent:'STOCK'},
    {lastNba:'SOFT_CLOSE',interestSignal:true,purchaseSignal:false,activeProduct:'Armor X13',commercialStage:'CONSIDERACION'},
    'si está disponible me interesa',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_NOT_DELIVERED'));
});

test('ANSWER_ONLY is valid for a policy answer but not when purchase interest clearly calls for progression', () => {
  const policy=evaluateCommercial(observation('La garantía cubre defectos de fábrica.',{intent:'WARRANTY'},{lastNba:'ANSWER_ONLY',commercialStage:'DESCUBRIMIENTO'},'¿Qué garantía tiene?'));
  const interested=evaluateCommercial(observation('Armor 22 está a S/ 1399.',{intent:'PRICE'},{lastNba:'ANSWER_ONLY',interestSignal:true,activeProduct:'Armor 22',commercialStage:'CONSIDERACION'},'¿Cuánto cuesta?'));
  assert.equal(policy.some(x=>x.code==='NBA_PROGRESSION_MISSING'),false);
  assert.ok(interested.some(x=>x.code==='NBA_PROGRESSION_MISSING'));
});

test('ASK_MISSING_FACT must not ask again for context already known', () => {
  const findings=evaluateCommercial(observation(
    '¿Para qué uso necesitas el equipo?',
    {intent:'EVALUATE_USE'},
    {lastNba:'ASK_MISSING_FACT',useCase:'construccion',problem:'caidas',commercialStage:'DESCUBRIMIENTO'},
    'También necesito buena batería.',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_REPEATS_KNOWN'));
});

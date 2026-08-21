import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHard } from '../../qa/evaluators/hard.ts';

const observation = (response: any, override: any = {}) => ({
  httpStatus: 200,
  ok: true,
  request: { sessionId: 'qa-x', messageId: 'qa:x:t01', message: 'precio?' },
  response,
  roundTripMs: 10,
  ...override,
});

test('hard evaluator rejects intent mismatch', () => {
  const findings = evaluateHard({ message: 'x', expected: { intent: 'PRICE' } }, observation({ answer: 'x', state: {}, debug: { intent: 'STOCK' } }));
  assert.equal(findings[0].code, 'INTENT_MISMATCH');
});

test('hard evaluator compares price answer with ERP evidence', () => {
  const findings = evaluateHard({ message: 'x' }, observation({ answer: 'Cuesta S/ 999', state: {}, debug: { intent: 'PRICE', erp: { price: 899, stock: 4 } } }));
  assert.ok(findings.some(x => x.code === 'PRICE_EVIDENCE_MISMATCH'));
});

test('hard evaluator rejects unsupported numeric price when ERP evidence absent', () => {
  const findings = evaluateHard({ message: 'x' }, observation({ answer: 'Cuesta S/ 777', state: {}, debug: { intent: 'PRICE', erp: null } }));
  assert.ok(findings.some(x => x.code === 'UNSUPPORTED_NUMERIC_CLAIM'));
});

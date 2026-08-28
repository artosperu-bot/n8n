import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunId, createSessionId, createMessageId } from '../../qa/id.ts';

test('QA ids are deterministic when date and entropy are supplied', () => {
  const run = createRunId(new Date('2026-08-21T00:15:30Z'), 'a7f2');
  assert.equal(run, 'qa-20260821-001530-a7f2');
  assert.equal(createSessionId(run, 'REF-004'), 'qa-20260821-001530-a7f2-REF-004');
  assert.equal(createMessageId(run, 'REF-004', 1), 'qa-20260821-001530-a7f2:REF-004:t01');
});

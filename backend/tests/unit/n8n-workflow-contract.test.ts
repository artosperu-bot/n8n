import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowPath = new URL('../../n8n/STECH_Backend_Event_Gateway_v1.json', import.meta.url);

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowPath, 'utf8'));
}

test('n8n gateway exposes secured POST webhook', async () => {
  const wf = await loadWorkflow();
  const webhook = wf.nodes.find((n: any) => n.name === '01 Webhook Backend Events');
  assert.ok(webhook);
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.equal(webhook.parameters.path, 'stech-backend-events');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.equal(webhook.parameters.authentication, 'bearerAuth');
});

test('n8n gateway routes the four backend event families', async () => {
  const wf = await loadWorkflow();
  const sw = wf.nodes.find((n: any) => n.name === '03 Route Event');
  assert.ok(sw);
  assert.deepEqual(sw.parameters.rules.values.map((v: any) => v.outputKey), [
    'conversation.turn.completed',
    'purchase.intent',
    'handoff.requested',
    'notification.requested',
  ]);
  assert.equal(sw.parameters.options.fallbackOutput, 'extra');
});

test('n8n gateway normalizer validates event contract', async () => {
  const wf = await loadWorkflow();
  const node = wf.nodes.find((n: any) => n.name === '02 Validate and Normalize');
  const run = new Function('$input', node.parameters.jsCode);
  const input = { first: () => ({ json: { body: {
    type: 'purchase.intent',
    occurredAt: '2026-08-20T22:00:00.000Z',
    sessionId: 'qa-backend-001',
    payload: { intent: 'PURCHASE' },
  }}}) };
  const out = run(input)[0].json;
  assert.equal(out.statusCode, 202);
  assert.equal(out.accepted, true);
  assert.equal(out.route, 'purchase.intent');
});

test('n8n gateway invalid contract reaches fallback response', async () => {
  const wf = await loadWorkflow();
  const routes = wf.connections['03 Route Event'].main;
  assert.equal(routes.length, 5);
  assert.equal(routes[4][0].node, '08 Respond Gateway');
});

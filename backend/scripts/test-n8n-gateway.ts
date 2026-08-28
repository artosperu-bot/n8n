async function main() {
  const url = String(process.env.N8N_WEBHOOK_URL ?? '').trim();
  const token = String(process.env.N8N_WEBHOOK_TOKEN ?? '').trim();

  if (!url || url.includes('REEMPLAZAR')) {
    console.error('N8N_WEBHOOK_URL no está configurado en .env');
    process.exit(2);
  }
  if (!token || token.includes('REEMPLAZAR')) {
    console.error('N8N_WEBHOOK_TOKEN no está configurado en .env');
    process.exit(2);
  }

  const event = {
    type: 'conversation.turn.completed',
    occurredAt: new Date().toISOString(),
    sessionId: `n8n-gateway-smoke-${Date.now()}`,
    payload: {
      messageId: `smoke-${Date.now()}`,
      intent: 'GREETING',
      queryTarget: null,
      state: { source: 'backend-n8n-smoke' },
      answer: 'STECH backend -> n8n gateway connectivity test',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(event),
  });

  const raw = await response.text();
  let parsed = raw;
  try { parsed = JSON.parse(raw); } catch {}

  console.log(JSON.stringify({ httpStatus: response.status, response: parsed }, null, 2));

  if (response.status !== 202 || !parsed?.accepted) {
    console.error('FAIL: n8n gateway no aceptó el evento.');
    process.exit(1);
  }

  console.log('PASS: backend -> n8n gateway respondió 202 accepted=true');
}

main().catch((error) => { console.error(error); process.exit(1); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseTelemetryRepository } from '../../src/adapters/supabase/SupabaseTelemetryRepository.ts';

test('persists non-secret LLM metrics in ia_metricas_tokens', async () => {
  let target = '';
  let body: any;
  let headers: Headers;
  const fetcher: typeof fetch = async (url, init) => {
    target = String(url);
    body = JSON.parse(String(init?.body));
    headers = new Headers(init?.headers);
    return new Response(null, { status: 201 });
  };
  const repo = new SupabaseTelemetryRepository({
    url: 'https://example.supabase.co',
    key: 'service-key',
    fetcher,
  });
  await repo.recordLlmUsage({
    sessionId: 'qa-run-case',
    turn: 2,
    route: 'PRICE',
    model: 'gpt-test',
    inputTokens: 120,
    outputTokens: 30,
    cachedTokens: 20,
    durationMs: 812,
    messageId: 'qa-run:CASE:t02',
  });
  assert.equal(target, 'https://example.supabase.co/rest/v1/ia_metricas_tokens');
  assert.equal(headers!.get('prefer'), 'resolution=ignore-duplicates');
  assert.deepEqual(body, [{
    session_id: 'qa-run-case',
    turno: 2,
    nodo: 'OpenAIProvider',
    ruta: 'PRICE',
    modelo: 'gpt-test',
    tokens_entrada: 120,
    tokens_salida: 30,
    tokens_cacheados: 20,
    duracion_ms: 812,
    message_id: 'qa-run:CASE:t02',
  }]);
});

test('planner and writer metrics use distinct idempotency nodes for one message',async()=>{
  const bodies:any[]=[];
  const repo=new SupabaseTelemetryRepository({url:'https://example.supabase.co',key:'service-key',fetcher:async(_url,init)=>{
    bodies.push(JSON.parse(String(init?.body))[0]);
    return new Response(null,{status:201});
  }});
  const common={sessionId:'qa-run-case',turn:2,model:'gpt-test',inputTokens:10,outputTokens:5,cachedTokens:0,durationMs:100,messageId:'qa-run:CASE:t02'};
  await repo.recordLlmUsage({...common,route:'SEMANTIC_PLAN'});
  await repo.recordLlmUsage({...common,route:'COMMERCIAL_WRITE'});
  assert.deepEqual(bodies.map(x=>x.nodo),['SemanticPlanner','CommercialWriter']);
});

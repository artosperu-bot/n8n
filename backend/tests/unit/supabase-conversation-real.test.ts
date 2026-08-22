import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

test('persists user first, canonical context, then patches same turn with assistant data', async()=>{
  const calls:any[]=[];
  const fetcher:any=async (url:any, init:any={})=>{
    const call={url:String(url), method:init.method??'GET', body:init.body?JSON.parse(init.body):null, headers:init.headers};
    calls.push(call);
    if(call.method==='POST' && call.url.includes('/ia_conversaciones')) return {ok:true,json:async()=>[{id:'conv-1'}]};
    if(call.method==='GET') return {ok:true,json:async()=>[]};
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});

  await repo.appendMessage('qa-1','user','¿Cuánto cuesta el Armor X13?');
  const turnInsert=calls.find(c=>c.url.includes('/rest/v1/ia_conversaciones') && c.method==='POST');
  assert.ok(turnInsert,'user message must be persisted before LLM/state completion');
  assert.equal(turnInsert.body[0].mensaje_cliente,'¿Cuánto cuesta el Armor X13?');
  assert.equal(turnInsert.body[0].respuesta_bot,null);

  await repo.saveState('qa-1',{sessionId:'qa-1',turnCount:1,activeProduct:'Armor X13',queryTarget:'Armor X13',budget:null,lastIntent:'PRICE',comparisonProducts:[],spinFacts:[]});
  const urls=calls.map(c=>c.url);
  assert.ok(urls.some((u:string)=>u.includes('/rest/v1/ia_sesiones')),'must ensure ia_sesiones row first');
  const ctx=calls.find(c=>c.url.includes('/rest/v1/ia_contexto') && c.method==='POST');
  assert.equal(ctx.body[0].session_id,'qa-1');
  assert.equal(ctx.body[0].contexto.activeProduct,'Armor X13');
  assert.equal(ctx.body[0].ultima_intencion,'PRICE');

  await repo.appendMessage('qa-1','assistant','El Armor X13 cuesta S/ 899.');
  const turnPatch=calls.find(c=>c.url.includes('/rest/v1/ia_conversaciones?id=eq.conv-1') && c.method==='PATCH');
  assert.ok(turnPatch,'assistant must patch same conversation row');
  assert.equal(turnPatch.body.respuesta_bot,'El Armor X13 cuesta S/ 899.');
  assert.equal(turnPatch.body.intencion,'PRICE');
  assert.equal(turnPatch.body.producto_detectado,'Armor X13');
});

test('reads canonical context and expands stored turn into user and assistant messages', async()=>{
  const fetcher:any=async (url:any)=>{
    const s=String(url);
    if(s.includes('/rest/v1/ia_contexto')) return {ok:true,json:async()=>[{contexto:{sessionId:'qa-2',turnCount:2,activeProduct:'Armor X13',comparisonProducts:[],spinFacts:[]}}]};
    if(s.includes('/rest/v1/ia_conversaciones')) return {ok:true,json:async()=>[{mensaje_cliente:'Hola',respuesta_bot:'Hola, ¿qué producto buscas?',fecha:'2026-08-20T20:00:00Z'}]};
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  const state=await repo.getState('qa-2');
  assert.equal(state.activeProduct,'Armor X13');
  const messages=await repo.getMessages('qa-2');
  assert.deepEqual(messages.map(x=>[x.role,x.content]),[['user','Hola'],['assistant','Hola, ¿qué producto buscas?']]);
});

test('canonical context fields win over stale legacy mirrors and mirrors only backfill missing values', async()=>{
  const fetcher:any=async()=>({ok:true,json:async()=>[{
    context_version:9,
    contexto:{
      sessionId:'stale-session',contextVersion:3,activeProduct:'Armor X13',lastIntent:'PRICE',
      producto_activo:{nombre:'Armor 22'},
      producto_objetivo_turno:{nombre:'Armor 25T Pro'},
      conversacion:{ultima_intencion:'STOCK',accion_pendiente:'ANSWER_ONLY'},
      comparisonProducts:[],spinFacts:[],
    },
  }]});
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  const state=await repo.getState('qa-canonical');
  assert.equal(state.sessionId,'qa-canonical');
  assert.equal(state.contextVersion,9);
  assert.equal(state.activeProduct,'Armor X13');
  assert.equal(state.lastIntent,'PRICE');
  assert.equal(state.queryTarget,'Armor 25T Pro');
  assert.equal(state.lastNba,'ANSWER_ONLY');
});

test('keeps user message persisted even if assistant reply never arrives', async()=>{
  const calls:any[]=[];
  const fetcher:any=async (url:any, init:any={})=>{
    const call={url:String(url),method:init.method??'GET',body:init.body?JSON.parse(init.body):null};
    calls.push(call);
    if(call.method==='POST' && call.url.includes('/ia_conversaciones')) return {ok:true,json:async()=>[{id:'conv-fail'}]};
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  await repo.appendMessage('qa-fail','user','Mensaje antes de un fallo del LLM');
  const insert=calls.find(c=>c.url.includes('/ia_conversaciones')&&c.method==='POST');
  assert.equal(insert.body[0].mensaje_cliente,'Mensaje antes de un fallo del LLM');
  assert.equal(insert.body[0].respuesta_bot,null);
  assert.equal(calls.some(c=>c.method==='PATCH'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

test('persists STECH state in ia_contexto.contexto and paired turn in ia_conversaciones', async()=>{
  const calls:any[]=[];
  const fetcher:any=async (url:any, init:any={})=>{
    calls.push({url:String(url), method:init.method??'GET', body:init.body?JSON.parse(init.body):null, headers:init.headers});
    if ((init.method??'GET')==='GET') return {ok:true,json:async()=>[]};
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  await repo.appendMessage('qa-1','user','¿Cuánto cuesta el Armor X13?');
  await repo.saveState('qa-1',{sessionId:'qa-1',turnCount:1,activeProduct:'Armor X13',queryTarget:'Armor X13',budget:null,lastIntent:'PRICE',comparisonProducts:[],spinFacts:[]});
  await repo.appendMessage('qa-1','assistant','El Armor X13 cuesta S/ 899.');

  const urls=calls.map(c=>c.url);
  assert.ok(urls.some((u:string)=>u.includes('/rest/v1/ia_sesiones')),'must ensure ia_sesiones row first');
  const ctx=calls.find(c=>c.url.includes('/rest/v1/ia_contexto') && c.method==='POST');
  assert.equal(ctx.body[0].session_id,'qa-1');
  assert.equal(ctx.body[0].contexto.activeProduct,'Armor X13');
  assert.equal(ctx.body[0].ultima_intencion,'PRICE');

  const turn=calls.find(c=>c.url.includes('/rest/v1/ia_conversaciones') && c.method==='POST');
  assert.equal(turn.body[0].mensaje_cliente,'¿Cuánto cuesta el Armor X13?');
  assert.equal(turn.body[0].respuesta_bot,'El Armor X13 cuesta S/ 899.');
  assert.equal(turn.body[0].intencion,'PRICE');
  assert.equal(turn.body[0].producto_detectado,'Armor X13');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCrmRepository } from '../../src/adapters/supabase/SupabaseCrmRepository.ts';

function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

test('recordInbound stores authoritative Meta source_sent_at metadata',async()=>{
  let payload:any=null;
  const fetcher=async(url:any,init:any={})=>{
    const value=String(url);
    if(value.includes('/rest/v1/ia_sesiones')&&init.method==='POST')return json([]);
    if(value.includes('/rest/v1/ia_contexto')&&init.method==='PATCH')return new Response(null,{status:204});
    if(value.includes('/rest/v1/crm_mensajes')&&init.method==='POST'){payload=JSON.parse(init.body);return json([]);}
    if(value.includes('/rest/v1/ia_sesiones')&&!init.method)return json([{modo_atencion:'BOT',version:1}]);
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher:fetcher as any});
  await repo.recordInbound({sessionId:'whatsapp:51911111111',messageId:'wamid.IN1',content:'Hola',waId:'51911111111',sourceSentAt:'2026-08-25T20:00:00.000Z'});
  assert.equal(payload?.[0]?.metadata?.source_sent_at,'2026-08-25T20:00:00.000Z');
});

test('getAutomationState uses latest real customer source timestamp and message id',async()=>{
  const fetcher=async(url:any)=>{
    const value=String(url);
    if(value.includes('/rest/v1/ia_sesiones'))return json([{modo_atencion:'BOT',version:4}]);
    if(value.includes('/rest/v1/crm_mensajes'))return json([{message_id:'wamid.LATEST',fecha:'2026-08-25T20:00:05Z',metadata:{source_sent_at:'2026-08-25T20:00:00.000Z'}}]);
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher:fetcher as any});
  const state=await repo.getAutomationState('whatsapp:51911111111');
  assert.deepEqual(state,{mode:'BOT',latestCustomerAt:'2026-08-25T20:00:00.000Z',latestCustomerMessageId:'wamid.LATEST'});
});

test('recordAutomationMessage audits outbound message in existing crm_mensajes table',async()=>{
  let payload:any=null;
  const fetcher=async(url:any,init:any={})=>{
    const value=String(url);
    if(value.includes('/rest/v1/ia_sesiones')&&init.method==='POST')return json([]);
    if(value.includes('/rest/v1/ia_contexto')&&init.method==='PATCH')return new Response(null,{status:204});
    if(value.includes('/rest/v1/crm_mensajes')&&init.method==='POST'){payload=JSON.parse(init.body);return json([]);}
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher:fetcher as any});
  await repo.recordAutomationMessage({sessionId:'whatsapp:51911111111',messageId:'wamid.AUTO.OUT',content:'¿Sigues interesado?',recipient:'51911111111',jobId:'job-1'});
  assert.equal(payload?.[0]?.emisor,'BOT');
  assert.equal(payload?.[0]?.metadata?.source,'crm_automation');
  assert.equal(payload?.[0]?.metadata?.automation_job_id,'job-1');
});

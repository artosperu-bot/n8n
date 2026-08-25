import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAutomationRepository } from '../../src/adapters/supabase/SupabaseAutomationRepository.ts';

function response(body:any,status=200){return{ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)} as any;}

test('lists active BOT reply rules and maps Supabase snake_case fields',async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{calls.push({url:String(url),method:init.method??'GET'});return response([{id:'r1',name:'Follow',event_type:'BOT_MESSAGE_SENT',delay_seconds:3600,action_type:'SEND_TEXT',message_template:'Hola',active:true,priority:10}]);};
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher});
  const rules=await repo.listActiveRules('BOT_MESSAGE_SENT');
  assert.equal(rules[0].delaySeconds,3600);
  assert.equal(rules[0].messageTemplate,'Hola');
  assert.match(calls[0].url,/event_type=eq\.BOT_MESSAGE_SENT/);
  assert.match(calls[0].url,/active=eq\.true/);
});

test('schedules through once-per-rule-session RPC and returns null when rule was already used in that conversation',async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{calls.push({url:String(url),method:init.method??'GET',body:init.body?JSON.parse(init.body):null});return response([]);};
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher});
  const result=await repo.scheduleJob({ruleId:'r1',sessionId:'whatsapp:51999',eventType:'BOT_MESSAGE_SENT',basisMessageId:'wamid.customer.1',recipient:'51999',executeAt:'2026-08-25T20:00:00.000Z'});
  assert.equal(result,null);
  assert.match(calls[0].url,/rpc\/crm_schedule_automation_job_once$/);
  assert.deepEqual(calls[0].body,{
    p_rule_id:'r1',
    p_session_id:'whatsapp:51999',
    p_event_type:'BOT_MESSAGE_SENT',
    p_basis_message_id:'wamid.customer.1',
    p_recipient:'51999',
    p_execute_at:'2026-08-25T20:00:00.000Z',
  });
});

test('once-per-session scheduling RPC maps the single newly created job',async()=>{
  const fetcher:any=async()=>response([{id:'j1',rule_id:'r1',session_id:'whatsapp:51999',event_type:'BOT_MESSAGE_SENT',basis_message_id:'wamid.customer.1',recipient:'51999',execute_at:'2026-08-25T20:00:00Z',status:'PENDING',attempt_count:0}]);
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher});
  const result=await repo.scheduleJob({ruleId:'r1',sessionId:'whatsapp:51999',eventType:'BOT_MESSAGE_SENT',basisMessageId:'wamid.customer.1',recipient:'51999',executeAt:'2026-08-25T20:00:00.000Z'});
  assert.equal(result?.id,'j1');
  assert.equal(result?.eventType,'BOT_MESSAGE_SENT');
});

test('claims due jobs through transactional RPC and includes rule message template',async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{calls.push({url:String(url),body:init.body?JSON.parse(init.body):null});return response([{id:'j1',rule_id:'r1',session_id:'whatsapp:51999',event_type:'BOT_MESSAGE_SENT',basis_message_id:'wamid.customer.1',recipient:'51999',execute_at:'2026-08-25T20:00:00Z',status:'PROCESSING',attempt_count:1,lease_owner:'w1',lease_until:'2026-08-25T20:01:00Z',message_template:'¿Sigues interesado?'}]);};
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher});
  const jobs=await repo.claimDue('w1',20,60);
  assert.match(calls[0].url,/rpc\/crm_claim_due_automation_jobs$/);
  assert.deepEqual(calls[0].body,{p_worker_id:'w1',p_batch_size:20,p_lease_seconds:60});
  assert.equal(jobs[0].messageTemplate,'¿Sigues interesado?');
  assert.equal(jobs[0].attemptCount,1);
});

test('terminal update clears lease and stores reason',async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{calls.push({url:String(url),method:init.method??'GET',body:init.body?JSON.parse(init.body):null});return response([]);};
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service',fetcher});
  await repo.markTerminal('j1','CANCELLED','CUSTOMER_REPLIED');
  assert.equal(calls[0].method,'PATCH');
  assert.equal(calls[0].body.status,'CANCELLED');
  assert.equal(calls[0].body.cancel_reason,'CUSTOMER_REPLIED');
  assert.equal(calls[0].body.lease_owner,null);
});

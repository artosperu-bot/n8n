import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAutomationRepository } from '../../src/adapters/supabase/SupabaseAutomationRepository.ts';

function baseJob(overrides:Record<string,unknown>={}){
  return {
    id:'job-1',rule_id:'rule-1',session_id:'whatsapp:51999',event_type:'BOT_MESSAGE_SENT',basis_message_id:'wamid.customer',
    recipient:'51999',execute_at:'2026-08-27T15:00:00.000Z',status:'PENDING',attempt_count:0,
    action_type_snapshot:'SEND_IMAGE_PRODUCT_AUTO',media_url_snapshot:'https://cdn.test/1.webp',media_type_snapshot:'caracteristicas_generales',
    media_product_id_snapshot:'P-ARMOR-22',media_source_snapshot:'SQL_BRIDGE',...overrides,
  };
}

test('maps ordered multi-image snapshot and falls back to legacy primary URL',async()=>{
  const rows=[
    baseJob({media_urls_snapshot:['https://cdn.test/1.webp','https://cdn.test/2.webp','https://cdn.test/2.webp']}),
    baseJob({id:'job-legacy',media_urls_snapshot:undefined,media_url_snapshot:'https://cdn.test/legacy.webp'}),
  ];
  const fetcher:typeof fetch=async(url)=>{
    const target=String(url);
    if(target.includes('/crm_automation_jobs'))return Response.json(rows);
    return Response.json([]);
  };
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service-key',fetcher});
  const jobs=await repo.listJobs();
  assert.deepEqual((jobs[0] as any).mediaUrls,['https://cdn.test/1.webp','https://cdn.test/2.webp']);
  assert.deepEqual((jobs[1] as any).mediaUrls,['https://cdn.test/legacy.webp']);
});

test('rule reads exclude soft-deleted rows',async()=>{
  const calls:string[]=[];
  const fetcher:typeof fetch=async(url)=>{calls.push(String(url));return Response.json([]);};
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service-key',fetcher});
  await repo.listRules();
  await repo.listActiveRules('BOT_MESSAGE_SENT');
  assert.ok(calls[0].includes('deleted_at=is.null'));
  assert.ok(calls[1].includes('deleted_at=is.null'));
});

test('deleteRule invokes soft-delete RPC and returns the deleted rule snapshot',async()=>{
  const calls:Array<{url:string;init:RequestInit}>=[];
  const fetcher:typeof fetch=async(url,init)=>{
    const target=String(url);calls.push({url:target,init:init??{}});
    if(target.includes('/rpc/crm_soft_delete_automation_rule'))return Response.json([{
      id:'rule-1',name:'Seguimiento',event_type:'BOT_MESSAGE_SENT',delay_seconds:60,action_type:'SEND_TEXT',message_template:'Hola',media_url:null,active:false,priority:100,deleted_at:'2026-08-27T20:00:00Z',
    }]);
    return Response.json([]);
  };
  const repo=new SupabaseAutomationRepository({url:'https://example.supabase.co',serviceRoleKey:'service-key',fetcher});
  const rule=await (repo as any).deleteRule('rule-1','DELETED_FROM_CRM');
  assert.equal(rule.id,'rule-1');
  const call=calls.find(item=>item.url.includes('/rpc/crm_soft_delete_automation_rule'));
  assert.ok(call);
  assert.deepEqual(JSON.parse(String(call?.init.body)),{p_rule_id:'rule-1',p_reason:'DELETED_FROM_CRM'});
});

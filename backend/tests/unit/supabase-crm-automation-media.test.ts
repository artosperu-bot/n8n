import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCrmRepository } from '../../src/adapters/supabase/SupabaseCrmRepository.ts';

test('recordAutomationMessage persists media delivery metadata for CRM audit',async()=>{
  const calls:Array<{url:string;init:RequestInit}>=[];
  const fetcher:typeof fetch=async(url,init)=>{
    const target=String(url);calls.push({url:target,init:init??{}});
    if(target.includes('/ia_sesiones?on_conflict='))return new Response(null,{status:204});
    if(target.includes('/ia_contexto?session_id='))return new Response(null,{status:204});
    if(target.endsWith('/rest/v1/crm_mensajes'))return Response.json([{id:'m1'}]);
    return Response.json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-key',fetcher});
  await repo.recordAutomationMessage({
    sessionId:'whatsapp:51999',messageId:'wamid.media',content:'🔥 Sigue disponible',recipient:'51999',jobId:'job-1',
    actionType:'SEND_IMAGE_PRODUCT_AUTO',mediaUrl:'https://cdn.test/armor.webp',mediaProductId:'P-ARMOR-X13',mediaSource:'SQL_BRIDGE',fallbackToText:false,
  });
  const insert=calls.find(call=>call.url.endsWith('/rest/v1/crm_mensajes'));
  assert.ok(insert);
  const body=JSON.parse(String(insert?.init.body));
  assert.deepEqual(body[0].metadata,{
    source:'crm_automation',wa_id:'51999',automation_job_id:'job-1',
    automation_action_type:'SEND_IMAGE_PRODUCT_AUTO',automation_media_url:'https://cdn.test/armor.webp',
    automation_media_product_id:'P-ARMOR-X13',automation_media_source:'SQL_BRIDGE',automation_fallback_to_text:false,
  });
});

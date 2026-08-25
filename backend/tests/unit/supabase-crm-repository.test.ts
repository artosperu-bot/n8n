import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCrmRepository } from '../../src/adapters/supabase/SupabaseCrmRepository.ts';

function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

test('CRM repository lists WhatsApp by canonical session prefix even if generic engine overwrote canal',async()=>{
  let inboxUrl='';
  const fetcher=async(url:any)=>{
    const value=String(url);
    if(value.includes('/rest/v1/crm_v_inbox')){
      inboxUrl=value;
      return json([
        {session_id:'whatsapp:51911111111',canal:'backend',modo_atencion:'BOT',version:3,ultimo_mensaje:'Hola'},
      ]);
    }
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  const result=await repo.listWhatsAppConversations({limit:40});
  assert.match(inboxUrl,/session_id=ilike\.whatsapp/);
  assert.ok(!inboxUrl.includes('canal=eq.whatsapp'));
  assert.equal(result.sessions.length,1);
  assert.equal(result.sessions[0].session_id,'whatsapp:51911111111');
  assert.equal(result.sessions[0].canal,'whatsapp');
  assert.equal(result.stats.bot,1);
});

test('CRM repository returns detail with session, crm messages, context and latest ia_conversaciones insight',async()=>{
  const fetcher=async(url:any)=>{
    const value=String(url);
    if(value.includes('/rest/v1/crm_v_inbox'))return json([{session_id:'whatsapp:51911111111',canal:'whatsapp',modo_atencion:'HUMANO',version:7,cliente_telefono:null}]);
    if(value.includes('/rest/v1/crm_mensajes'))return json([{id:'m1',session_id:'whatsapp:51911111111',message_id:'wamid.1',emisor:'CLIENTE',contenido:'Hola',canal:'whatsapp'}]);
    if(value.includes('/rest/v1/ia_contexto'))return json([{session_id:'whatsapp:51911111111',actividad_activa:'construccion',problema_activo:'caidas',senal_compra:false,contexto:{activeProduct:'Armor 22'}}]);
    if(value.includes('/rest/v1/ia_conversaciones'))return json([{intencion:'EVALUATE_USE',ruta:'RAG_PRODUCT',siguiente_accion:'SOFT_CLOSE',producto_detectado:'Armor 22',fecha:'2026-08-24T20:00:00Z'}]);
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  const detail=await repo.getConversation('whatsapp:51911111111');
  assert.equal(detail.session.modo_atencion,'HUMANO');
  assert.equal(detail.messages.length,1);
  assert.equal(detail.context.contexto.activeProduct,'Armor 22');
  assert.equal(detail.insight.intencion,'EVALUATE_USE');
  assert.equal(detail.recipient,'51911111111');
});

test('CRM repository changeMode calls versioned crm_cambiar_modo_atencion authority',async()=>{
  let body:any=null;
  const fetcher=async(url:any,init:any={})=>{
    if(String(url).includes('/rpc/crm_cambiar_modo_atencion')){body=JSON.parse(init.body);return json([{session_id:'whatsapp:51911111111',modo_atencion:'HUMANO',version:8}]);}
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  await repo.changeMode({sessionId:'whatsapp:51911111111',mode:'HUMANO',version:7,actorId:'crm-user-1',reason:'Tomada desde CRM'});
  assert.deepEqual(body,{p_session_id:'whatsapp:51911111111',p_nuevo_modo_atencion:'HUMANO',p_actor_id:'crm-user-1',p_motivo:'Tomada desde CRM',p_version_esperada:7});
});

test('CRM repository records inbound wamid idempotently and returns current attention mode',async()=>{
  const calls:string[]=[];
  const fetcher=async(url:any,init:any={})=>{
    const value=String(url);calls.push(`${init.method??'GET'} ${value}`);
    if(value.includes('/rest/v1/ia_sesiones')&&init.method==='POST')return json([]);
    if(value.includes('/rest/v1/crm_mensajes')&&init.method==='POST')return json([]);
    if(value.includes('/rest/v1/ia_sesiones')&&!init.method)return json([{modo_atencion:'BOT',version:1}]);
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  const result=await repo.recordInbound({sessionId:'whatsapp:51911111111',messageId:'wamid.IN1',content:'Hola',contactName:'Cliente',waId:'51911111111'});
  assert.equal(result.mode,'BOT');
  assert.ok(calls.some(value=>value.includes('crm_mensajes')));
});

test('CRM repository links every physical wamid to its logical aggregation without erasing inbound metadata',async()=>{
  const patches:any[]=[];
  const fetcher=async(url:any,init:any={})=>{
    const value=String(url);
    if(value.includes('/rest/v1/crm_mensajes')&&!init.method)return json([{metadata:{source:'whatsapp_cloud_api',wa_id:'51911111111'}}]);
    if(value.includes('/rest/v1/crm_mensajes')&&init.method==='PATCH'){patches.push(JSON.parse(init.body));return new Response(null,{status:204});}
    return json([]);
  };
  const repo=new SupabaseCrmRepository({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  await repo.markInboundAggregation({sessionId:'whatsapp:51911111111',messageIds:['wamid.1','wamid.2'],logicalMessageId:'wamid.2',status:'REPROCESSED'});
  assert.equal(patches.length,2);
  for(const patch of patches){
    assert.equal(patch.metadata.source,'whatsapp_cloud_api');
    assert.equal(patch.metadata.wa_id,'51911111111');
    assert.equal(patch.metadata.logical_message_id,'wamid.2');
    assert.equal(patch.metadata.aggregation_status,'REPROCESSED');
    assert.deepEqual(patch.metadata.physical_message_ids,['wamid.1','wamid.2']);
  }
});

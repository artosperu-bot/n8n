import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

const FORBIDDEN_CONTEXT_KEYS=[
  'producto_activo','producto_objetivo_turno','producto_recomendado','cliente','venta','conversacion','debug_trace',
  'actividad_activa','problema_activo','senal_compra','context_version','customer','commercial','pendingQuestion','pendingAction','arbitrary_adapter_key',
] as const;

test('saveState projects commercial memory and trace ids into ia_contexto', async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{
    const call={url:String(url),method:init.method??'GET',body:init.body?JSON.parse(init.body):null};calls.push(call);
    if(call.method==='POST'&&call.url.includes('/ia_conversaciones'))return {ok:true,json:async()=>[{id:'turn-1'}]};
    if(call.method==='GET')return {ok:true,json:async()=>[]};
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  await repo.appendMessage('qa-commercial','user','Somos empresa, 12 equipos',{messageId:'m-1',requestId:'r-1'});
  await repo.saveState('qa-commercial',{
    sessionId:'qa-commercial',turnCount:1,lastIntent:'RECOMMEND',lastNba:'EXPLAIN_FIT',customerType:'BUSINESS',sector:'construccion',useCase:'trabajo',problem:'caidas_frecuentes',priorities:['resistencia','bateria'],quantity:12,invoiceRequired:true,objection:'precio',purchaseSignal:true,lastUserMessage:'Somos empresa, 12 equipos',lastAssistantMessage:'Armor 22 encaja por resistencia.',comparisonProducts:[],spinFacts:['cantidad:12'],lastDecisionTrace:{finalIntent:'RECOMMEND'},
    debug_trace:{legacy:true},producto_activo:{nombre:'legacy'},pendingAction:{type:'SOFT_CLOSE'},arbitrary_adapter_key:'must-not-persist',
  } as any);
  const ctx=calls.find(c=>c.url.includes('/rest/v1/ia_contexto')&&c.method==='POST').body[0];
  assert.equal(ctx.actividad_activa,'trabajo');
  assert.equal(ctx.problema_activo,'caidas_frecuentes');
  assert.equal(ctx.cantidad_activa,12);
  assert.equal(ctx.objecion_activa,'precio');
  assert.equal(ctx.senal_compra,true);
  assert.equal(ctx.accion_pendiente,'EXPLAIN_FIT');
  assert.equal(ctx.ultimo_message_id,'m-1');
  assert.equal(ctx.ultimo_request_id,'r-1');
  assert.equal(ctx.contexto.customerType,'BUSINESS');
  assert.deepEqual(ctx.contexto.lastDecisionTrace,{finalIntent:'RECOMMEND'});
  for(const forbidden of FORBIDDEN_CONTEXT_KEYS){
    assert.equal(Object.hasOwn(ctx.contexto,forbidden),false,`contexto.${forbidden}`);
  }
});

test('saveState never persists a query purpose as customer activity or use case',async()=>{
  const calls:any[]=[];
  const fetcher:any=async(url:any,init:any={})=>{
    calls.push({url:String(url),method:init.method??'GET',body:init.body?JSON.parse(init.body):null});
    return {ok:true,json:async()=>[]};
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'service',fetcher});
  await repo.saveState('qa-query-purpose',{
    useCase:'stock_availability',sector:null,spinFacts:['uso:stock_availability'],comparisonProducts:[],priorities:[],
  });
  const ctx=calls.find(call=>call.url.includes('/rest/v1/ia_contexto')&&call.method==='POST').body[0];
  assert.equal(ctx.actividad_activa,null);
  assert.equal(ctx.contexto.useCase,null);
  assert.deepEqual(ctx.contexto.spinFacts,[]);
});

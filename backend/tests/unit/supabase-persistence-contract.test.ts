import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

function jsonResponse(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
}

test('atomic persistence omits retired fields from active conversation and context payloads',async()=>{
  let persisted:any=null;
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/ia_sesiones?on_conflict=session_id')) return jsonResponse([]);
    if(url.includes('/rpc/ia_adquirir_turno')) return jsonResponse({acquired:true});
    if(url.includes('/ia_contexto?') && (!init?.method || init.method==='GET')) return jsonResponse([]);
    if(url.includes('/rpc/ia_persistir_turno_atomico')){
      persisted=JSON.parse(String(init?.body??'{}'));
      return jsonResponse({ok:true,status:'SAVED'});
    }
    if(url.includes('/rpc/ia_liberar_turno')) return jsonResponse({released:true});
    throw new Error(`unexpected fetch ${url}`);
  };

  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'test',fetcher});
  await repo.beginTurn('qa-contract','m1','r1');
  await repo.getState('qa-contract');
  await repo.completeTurn('qa-contract','precio armor 22','S/ 1399',{
    sessionId:'qa-contract',
    contextVersion:0,
    activeProduct:'Armor 22',
    activeProductId:'P-ARMOR-22-256G',
    activeProductCode:'P000049',
    queryTarget:'Armor 22',
    lastResolvedProductId:'P-ARMOR-22-256G',
    lastResolvedProductCode:'P000049',
    lastProductResolutionOrigin:'MENSAJE_ACTUAL',
    lastProductResolutionConfidence:0.95,
    lastIntent:'PRICE',
    lastRoute:'SQL_PRICE',
    lastNba:'ANSWER_ONLY',
    requiresSql:true,
    requiresRag:false,
    lastSqlTools:['dbo.sp_BuscarProductosVenta'],
    levelOfInterest:8,
    comparisonProducts:['Armor 22'],
    priorities:[],
    spinFacts:[],
  });

  assert.ok(persisted);
  const conversation=persisted.p_conversacion;
  const context=persisted.p_contexto;

  for(const retired of [
    'objetivo','cantidad_detectada','confianza','costo_prompt_estimado','costo_estimado_usd',
    'intent_score','estado_emocional','probabilidad_compra','perfil_cliente','urgencia',
    'limitacion_agente','alcance_consulta','tokens_cacheados'
  ]) assert.equal(Object.hasOwn(conversation,retired),false,retired);

  assert.equal(Object.hasOwn(context,'alcance_consulta'),false);
  assert.equal(conversation.producto_id_resuelto,'P-ARMOR-22-256G');
  assert.equal(conversation.producto_codigo_resuelto,'P000049');
  assert.equal(conversation.confianza_producto,0.95);
  assert.equal(conversation.nivel_interes,8);
  assert.equal(conversation.requiere_sql,true);
});

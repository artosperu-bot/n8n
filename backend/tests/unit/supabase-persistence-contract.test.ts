import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';

function jsonResponse(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
}

const FORBIDDEN_CONTEXT_KEYS=[
  'producto_activo','producto_objetivo_turno','producto_recomendado','cliente','venta','conversacion','debug_trace',
  'actividad_activa','problema_activo','senal_compra','context_version','customer','commercial','pendingQuestion','pendingAction',
] as const;

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
    customerType:'BUSINESS',
    sector:'construccion',
    useCase:'trabajo_campo',
    problem:'golpes y polvo',
    purchaseSignal:true,
    levelOfInterest:8,
    comparisonProducts:['Armor 22'],
    priorities:['resistencia'],
    spinFacts:['uso:trabajo_campo'],
    lastDecisionTrace:{finalIntent:'PRICE'} as any,
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

  const canonical=context.contexto as Record<string,unknown>;
  assert.equal(canonical.activeProduct,'Armor 22');
  assert.equal(canonical.queryTarget,'Armor 22');
  assert.equal(canonical.useCase,'trabajo_campo');
  assert.equal(canonical.problem,'golpes y polvo');
  assert.equal(canonical.purchaseSignal,true);
  assert.deepEqual(canonical.lastDecisionTrace,{finalIntent:'PRICE'});
  for(const forbidden of FORBIDDEN_CONTEXT_KEYS){
    assert.equal(Object.hasOwn(canonical,forbidden),false,`contexto.${forbidden}`);
  }

  // Derived SQL columns remain populated; they are projections, not JSON state authority.
  assert.equal(context.actividad_activa,'trabajo_campo');
  assert.equal(context.problema_activo,'golpes y polvo');
  assert.equal(context.senal_compra,true);
  assert.deepEqual(conversation.contexto_comercial_snapshot,canonical);
});

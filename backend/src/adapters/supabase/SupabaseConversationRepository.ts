import type { ConversationMessageMeta, ConversationRepository, TurnCompletionMeta } from '../../ports/ConversationRepository.ts';
import type { ConversationState } from '../../domain/types.ts';
import { deriveCommercialImplications } from '../../conversation/commercial/CommercialImplications.ts';

type Options = {
  url: string;
  key: string;
  sessionTable?: string;
  contextTable?: string;
  conversationTable?: string;
  fetcher?: typeof fetch;
};

type ActiveLease = { owner:string; messageId:string; requestId:string };

const PRODUCT_ORIGINS = new Set(['MENSAJE_ACTUAL','REFERENCIA_CONTEXTO','PRODUCTO_ACTIVO','SELECCION_USUARIO','SIN_RESOLVER']);
const SPIN_CONTRIBUTIONS = new Set(['SITUACION','PROBLEMA','IMPLICACION','NECESIDAD_SOLUCION']);

function spinPhase(state: ConversationState): string | null {
  if (state.purchaseSignal) return 'NECESIDAD_SOLUCION';
  if (state.problem) return 'PROBLEMA';
  if ((state.priorities?.length ?? 0) > 0) return 'NECESIDAD_SOLUCION';
  if (state.useCase || state.sector) return 'SITUACION';
  return null;
}
function productOrigin(state:ConversationState):string {
  const value=String(state.lastProductResolutionOrigin ?? '').toUpperCase();
  return PRODUCT_ORIGINS.has(value) ? value : 'SIN_RESOLVER';
}
function productStatus(state:ConversationState):string|null {
  if (state.lastResolvedProductId) return 'CONFIRMADO';
  if (state.lastRoute === 'CLARIFICATION') return 'AMBIGUO';
  return 'NO_CONFIRMADO';
}
function cleanStrings(values:string[]|undefined):string[] {
  return (values ?? []).filter(v=>typeof v==='string' && v.trim() && v !== '[object Object]').map(v=>v.trim());
}
function compactSpinContribution(state:ConversationState):string|null {
  const direct=String(state.lastSpinContribution ?? '').trim().toUpperCase();
  if(SPIN_CONTRIBUTIONS.has(direct)) return direct;

  const latest=String(cleanStrings(state.spinFacts).at(-1) ?? '').toLocaleLowerCase('es');
  if(/^(?:necesidad|prioridad):/.test(latest)) return 'NECESIDAD_SOLUCION';
  if(/^implicacion:/.test(latest)) return 'IMPLICACION';
  if(/^problema:/.test(latest)) return 'PROBLEMA';
  if(/^(?:situacion|uso|sector|cliente):/.test(latest)) return 'SITUACION';
  return null;
}
function recommendationCandidates(state:ConversationState):string[]{
  const traced=state.lastDecisionTrace?.recommendation?.eligibleCandidates?.map(x=>x.product)??[];
  return cleanStrings(traced.length?traced:state.comparisonProducts);
}
function storedCanonicalState(value:unknown):ConversationState {
  const raw=value&&typeof value==='object'?value as Record<string,any>:{};
  const {
    producto_activo:legacyActive,
    producto_objetivo_turno:legacyTarget,
    producto_recomendado:legacyRecommended,
    cliente:legacyCustomer,
    venta:legacySale,
    conversacion:legacyConversation,
    debug_trace:legacyTrace,
    ...canonical
  }=raw;
  const text=(primary:unknown,fallback:unknown)=>typeof primary==='string'&&primary.trim()?primary:typeof fallback==='string'&&fallback.trim()?fallback:undefined;
  const valueOr=<T>(primary:T|undefined,fallback:T|undefined)=>primary!==undefined?primary:fallback;
  return {
    ...canonical,
    activeProduct:text(canonical.activeProduct,legacyActive?.nombre??legacyActive?.nombre_corto),
    queryTarget:text(canonical.queryTarget,legacyTarget?.nombre),
    recommendedProduct:text(canonical.recommendedProduct,legacyRecommended?.nombre??legacyRecommended?.nombre_corto),
    customerType:text(canonical.customerType,legacyCustomer?.tipo),
    sector:text(canonical.sector,legacyCustomer?.sector),
    useCase:text(canonical.useCase,legacyCustomer?.actividad),
    problem:text(canonical.problem,legacyCustomer?.problema),
    priorities:valueOr(canonical.priorities,Array.isArray(legacyCustomer?.prioridades)?legacyCustomer.prioridades:undefined),
    budget:valueOr(canonical.budget,legacyCustomer?.presupuesto),
    quantity:valueOr(canonical.quantity,legacyCustomer?.cantidad),
    invoiceRequired:valueOr(canonical.invoiceRequired,legacyCustomer?.requiere_factura),
    purchaseSignal:valueOr(canonical.purchaseSignal,legacySale?.senal_compra),
    objection:text(canonical.objection,legacySale?.objecion),
    commercialStage:text(canonical.commercialStage,legacySale?.etapa),
    lastNba:text(canonical.lastNba,legacyConversation?.accion_pendiente),
    lastIntent:text(canonical.lastIntent,legacyConversation?.ultima_intencion),
    lastRoute:text(canonical.lastRoute,legacyConversation?.ultima_ruta),
    lastDecisionTrace:canonical.lastDecisionTrace??legacyTrace,
  } as ConversationState;
}
function canonicalContext(state:ConversationState) {
  const flat={
    ...state,
    spinFacts:cleanStrings(state.spinFacts),
    priorities:cleanStrings(state.priorities),
    comparisonProducts:cleanStrings(state.comparisonProducts),
  };
  return {
    ...flat,
    debug_trace:state.lastDecisionTrace ?? null,
    producto_activo: state.activeProduct ? {
      producto_id:state.activeProductId ?? null,
      producto_codigo:state.activeProductCode ?? null,
      nombre:state.activeProduct,
      nombre_corto:state.activeProduct,
    } : null,
    producto_objetivo_turno: state.queryTarget ? {
      producto_id:state.lastResolvedProductId ?? null,
      producto_codigo:state.lastResolvedProductCode ?? null,
      nombre:state.queryTarget,
    } : null,
    producto_recomendado: state.recommendedProduct ? { nombre:state.recommendedProduct, nombre_corto:state.recommendedProduct } : null,
    cliente:{
      tipo:state.customerType ?? null,
      sector:state.sector ?? null,
      actividad:state.useCase ?? state.sector ?? null,
      problema:state.problem ?? null,
      prioridades:cleanStrings(state.priorities),
      presupuesto:state.budget ?? null,
      cantidad:state.quantity ?? null,
      requiere_factura:state.invoiceRequired ?? null,
    },
    venta:{
      senal_compra:state.purchaseSignal ?? false,
      objecion:state.objection ?? null,
      etapa:state.commercialStage ?? null,
    },
    conversacion:{
      accion_pendiente:state.lastNba ?? null,
      ultima_intencion:state.lastIntent ?? null,
      ultima_ruta:state.lastRoute ?? null,
    },
  };
}

export class SupabaseConversationRepository implements ConversationRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #sessionTable: string;
  readonly #contextTable: string;
  readonly #conversationTable: string;
  readonly #fetcher: typeof fetch;
  readonly #runtimeOwner = `stech-backend-${crypto.randomUUID()}`;
  readonly #activeLease = new Map<string, ActiveLease>();

  readonly #pendingTurnId = new Map<string, string>();
  readonly #pendingMessageId = new Map<string, string | null>();
  readonly #pendingRequestId = new Map<string, string | null>();
  readonly #lastState = new Map<string, ConversationState>();

  constructor(options: Options) {
    this.#url = options.url.replace(/\/$/, '');
    this.#key = options.key;
    this.#sessionTable = options.sessionTable ?? 'ia_sesiones';
    this.#contextTable = options.contextTable ?? 'ia_contexto';
    this.#conversationTable = options.conversationTable ?? 'ia_conversaciones';
    this.#fetcher = options.fetcher ?? fetch;
  }

  #headers(extra: Record<string, string> = {}) {
    return { apikey: this.#key, authorization: `Bearer ${this.#key}`, 'content-type': 'application/json', ...extra };
  }

  async #rpc(name:string, body:Record<string,unknown>):Promise<any> {
    const r=await this.#fetcher(`${this.#url}/rest/v1/rpc/${name}`,{method:'POST',headers:this.#headers(),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Supabase RPC ${name} HTTP ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async #ensureSession(sessionId: string): Promise<void> {
    const body = [{ session_id: sessionId, canal: sessionId.startsWith('qa-') ? 'qa_live' : 'backend' }];
    const r = await this.#fetcher(`${this.#url}/rest/v1/${this.#sessionTable}?on_conflict=session_id`, {
      method: 'POST', headers: this.#headers({ Prefer: 'resolution=ignore-duplicates' }), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase session ensure HTTP ${r.status}`);
  }

  async beginTurn(sessionId:string,messageId:string,requestId:string):Promise<void> {
    await this.#ensureSession(sessionId);
    const result=await this.#rpc('ia_adquirir_turno',{
      p_session_id:sessionId,
      p_owner:this.#runtimeOwner,
      p_ttl_seconds:180,
      p_wait_seconds:1,
      p_message_id:messageId,
    });
    if(result?.acquired !== true) throw new Error(`Supabase turn acquire rejected: ${String(result?.reason ?? 'UNKNOWN')}`);
    this.#activeLease.set(sessionId,{owner:this.#runtimeOwner,messageId,requestId});
  }

  async failTurn(sessionId:string,messageId:string,error:string):Promise<void> {
    const lease=this.#activeLease.get(sessionId);
    if(!lease || lease.messageId!==messageId) return;
    const now=new Date().toISOString();
    const queueUrl=`${this.#url}/rest/v1/ia_turn_queue?session_id=eq.${encodeURIComponent(sessionId)}&message_id=eq.${encodeURIComponent(messageId)}&owner=eq.${encodeURIComponent(lease.owner)}&status=eq.PROCESSING`;
    const queue=await this.#fetcher(queueUrl,{
      method:'PATCH',
      headers:this.#headers(),
      body:JSON.stringify({status:'FAILED',finished_at:now,updated_at:now,last_error:String(error||'TURN_FAILED').slice(0,1000)}),
    });
    const lockUrl=`${this.#url}/rest/v1/ia_session_locks?session_id=eq.${encodeURIComponent(sessionId)}&owner=eq.${encodeURIComponent(lease.owner)}`;
    const lock=await this.#fetcher(lockUrl,{method:'DELETE',headers:this.#headers()});
    this.#activeLease.delete(sessionId);
    if(!queue.ok) throw new Error(`Supabase failed-turn queue cleanup HTTP ${queue.status}`);
    if(!lock.ok) throw new Error(`Supabase failed-turn lock cleanup HTTP ${lock.status}`);
  }

  async getState(sessionId: string): Promise<ConversationState> {
    const q = new URL(`${this.#url}/rest/v1/${this.#contextTable}`);
    q.searchParams.set('session_id', `eq.${sessionId}`);
    q.searchParams.set('select', 'contexto,context_version');
    q.searchParams.set('limit', '1');
    const r = await this.#fetcher(q, { headers: this.#headers() });
    if (!r.ok) throw new Error(`Supabase state read HTTP ${r.status}`);
    const rows: any[] = await r.json();
    const row=rows[0];
    const base=row?.contexto
      ?storedCanonicalState(row.contexto)
      :{sessionId,turnCount:0,comparisonProducts:[],spinFacts:[],priorities:[]};
    return { ...base, sessionId, contextVersion:Number(row?.context_version ?? base.contextVersion ?? 0) };
  }

  async completeTurn(sessionId:string,userContent:string,assistantContent:string,state:ConversationState,meta:TurnCompletionMeta={}):Promise<void> {
    const lease=this.#activeLease.get(sessionId);
    if(!lease) throw new Error(`Supabase atomic turn missing lease for ${sessionId}`);
    const currentVersion=Number(state.contextVersion ?? 0);
    const origin=productOrigin(state);
    const status=productStatus(state);
    const requiresClarification=state.lastRoute==='CLARIFICATION' || status==='AMBIGUO' || Boolean(state.explicitSwitch && !state.lastResolvedProductId);
    const context=canonicalContext(state);
    const candidateNames=recommendationCandidates(state);
    const metricsDetail=[{
      model:meta.model ?? null,
      input_tokens:meta.inputTokens ?? null,
      output_tokens:meta.outputTokens ?? null,
      total_tokens:meta.totalTokens ?? null,
      cached_input_tokens:meta.cachedInputTokens ?? null,
      total_prompts:meta.totalPrompts ?? 0,
    }];

    const conversationPayload={
      session_id:sessionId,
      message_id:lease.messageId,
      request_id:lease.requestId,
      mensaje_cliente:userContent,
      respuesta_bot:assistantContent,
      intencion:state.lastIntent ?? null,
      categoria:state.secondaryIntents?.[0] ?? null,
      ruta:state.lastRoute ?? null,
      objetivo:state.lastNba ?? null,
      producto_detectado:state.queryTarget ?? state.selectedProduct ?? state.recommendedProduct ?? state.activeProduct ?? null,
      cantidad_detectada:state.quantity ?? null,
      presupuesto_detectado:state.budget ?? null,
      requiere_sql:state.requiresSql ?? false,
      requiere_rag:state.requiresRag ?? false,
      sql_tool_sugerido:state.lastSqlTools?.[0] ?? null,
      sql_tool_disponible:Boolean(state.lastSqlTools?.length),
      etapa_comercial:state.commercialStage ?? null,
      objecion_principal:state.objection ?? null,
      estrategia_recomendada:state.commercialStrategy ?? null,
      siguiente_accion:state.lastNba ?? null,
      perfil_cliente:state.customerType ?? null,
      derivar_humano:state.handoffActive ?? false,
      cambio_producto_explicito:state.explicitSwitch ?? false,
      producto_id_resuelto:state.lastResolvedProductId ?? null,
      producto_codigo_resuelto:state.lastResolvedProductCode ?? null,
      estado_resolucion_producto:status,
      origen_resolucion_producto:origin,
      confianza_producto:state.lastProductResolutionConfidence ?? 0,
      productos_candidatos:candidateNames,
      alcance_consulta:state.lastRoute ?? null,
      requiere_aclaracion:requiresClarification,
      producto_objetivo_turno:{
        queryTarget:state.queryTarget ?? null,
        activeProduct:state.activeProduct ?? null,
        salientProduct:state.salientProduct ?? null,
        selectedProduct:state.selectedProduct ?? null,
        recommendedProduct:state.recommendedProduct ?? null,
      },
      spin_aporte:compactSpinContribution(state),
      spin_fase_actual:spinPhase(state),
      actividad_detectada:state.useCase ?? state.sector ?? null,
      problemas_detectados:state.problem ? [state.problem] : [],
      prioridades_detectadas:cleanStrings(state.priorities),
      atributo_detectado:cleanStrings(state.currentAttributes)?.[0]??null,
      implicaciones_detectadas:deriveCommercialImplications(state.problem,state.objection),
      pregunta_pendiente_turno:state.lastNba==='ASK_MISSING_FACT'&&state.pendingMissingFact?{missingFact:state.pendingMissingFact}:null,
      accion_pendiente_turno:(state.pendingCommercialAction??state.lastNba) ? {accion:state.pendingCommercialAction??state.lastNba} : null,
      contexto_comercial_snapshot:context,
      objecion_detectada:state.objection ? {tipo:state.objection} : null,
      nivel_interes:state.levelOfInterest ?? 0,
      tipo_conversacion:meta.conversationType ?? (sessionId.startsWith('qa-') ? 'QA_LIVE' : null),
      modelo:meta.model ?? null,
      tokens_entrada:meta.inputTokens ?? null,
      tokens_salida:meta.outputTokens ?? null,
      tokens_totales:meta.totalTokens ?? null,
      tokens_cacheados:meta.cachedInputTokens ?? null,
      total_prompts:meta.totalPrompts ?? 0,
      metricas_tokens_detalle:metricsDetail,
      fecha:new Date().toISOString(),
    };
    const contextPayload={
      session_id:sessionId,
      canal:sessionId.startsWith('qa-') ? 'qa_live' : 'backend',
      ultima_intencion:state.lastIntent ?? null,
      ultima_accion:state.lastNba ?? null,
      ultima_ruta:state.lastRoute ?? null,
      ultimo_mensaje_cliente:userContent,
      ultima_respuesta_bot:assistantContent,
      contexto:context,
      etapa_conversacion:state.commercialStage ?? 'INICIAL',
      producto_activo_id:state.activeProductId ?? null,
      producto_activo_confianza:state.activeProductId ? (state.lastProductResolutionConfidence ?? 1) : 0,
      producto_activo_origen:origin,
      productos_candidatos:candidateNames,
      alcance_consulta:state.lastRoute ?? null,
      atributo_activo:cleanStrings(state.currentAttributes)?.[0]??null,
      requiere_aclaracion:requiresClarification,
      actividad_activa:state.useCase ?? state.sector ?? null,
      problema_activo:state.problem ?? null,
      presupuesto_activo:state.budget ?? null,
      cantidad_activa:state.quantity ?? null,
      senal_compra:state.purchaseSignal ?? false,
      accion_pendiente:state.lastNba ?? null,
      derivacion_activa:state.handoffActive ?? false,
      motivo_derivacion:state.handoffReason ?? null,
      context_version:currentVersion+1,
      ultimo_turno_fecha:new Date().toISOString(),
    };

    const persisted=await this.#rpc('ia_persistir_turno_atomico',{
      p_owner:lease.owner,
      p_conversacion:conversationPayload,
      p_contexto:contextPayload,
    });
    if(persisted?.ok !== true) throw new Error(`Supabase atomic persist rejected: ${String(persisted?.status ?? 'UNKNOWN')}`);

    const released=await this.#rpc('ia_liberar_turno',{
      p_session_id:sessionId,
      p_owner:lease.owner,
      p_message_id:lease.messageId,
    });
    if(released?.released !== true && released?.reason !== 'LOCK_NOT_FOUND') throw new Error(`Supabase turn release rejected: ${String(released?.reason ?? 'UNKNOWN')}`);
    this.#activeLease.delete(sessionId);
  }

  async saveState(sessionId: string, state: ConversationState): Promise<void> {
    await this.#ensureSession(sessionId);
    const normalized = { ...state, sessionId };
    const legacyContext={...normalized,debug_trace:normalized.lastDecisionTrace??null};
    const body = [{ session_id:sessionId, canal:sessionId.startsWith('qa-')?'qa_live':'backend', contexto:legacyContext,
      ultima_intencion:normalized.lastIntent??null, ultima_accion:normalized.lastNba??null, ultima_ruta:normalized.lastRoute??null,
      ultimo_mensaje_cliente:normalized.lastUserMessage??null, ultima_respuesta_bot:normalized.lastAssistantMessage??null,
      actividad_activa:normalized.useCase??normalized.sector??null, problema_activo:normalized.problem??null,
      presupuesto_activo:normalized.budget??null, cantidad_activa:normalized.quantity??null, objecion_activa:normalized.objection??null,
      senal_compra:normalized.purchaseSignal??false, accion_pendiente:normalized.lastNba??null, etapa_conversacion:normalized.commercialStage??'INICIAL',
      producto_activo_id:normalized.activeProductId??null, producto_activo_confianza:normalized.activeProductId?(normalized.lastProductResolutionConfidence??1):0,
      producto_activo_origen:productOrigin(normalized), productos_candidatos:recommendationCandidates(normalized), alcance_consulta:normalized.lastRoute??null,
      requiere_aclaracion:normalized.lastRoute==='CLARIFICATION', derivacion_activa:normalized.handoffActive??false,
      bloquear_respuesta_automatica:normalized.blockAutomaticReply??false, motivo_derivacion:normalized.handoffReason??null,
      ultimo_message_id:this.#pendingMessageId.get(sessionId)??null, ultimo_request_id:this.#pendingRequestId.get(sessionId)??null,
      ultimo_turno_fecha:new Date().toISOString(), updated_by:'stech_backend_legacy', updated_at:new Date().toISOString() }];
    const r=await this.#fetcher(`${this.#url}/rest/v1/${this.#contextTable}?on_conflict=session_id`,{method:'POST',headers:this.#headers({Prefer:'resolution=merge-duplicates'}),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Supabase state write HTTP ${r.status}`);
    this.#lastState.set(sessionId,structuredClone(normalized));
  }

  async appendMessage(sessionId: string, role: 'user' | 'assistant', content: string, meta: ConversationMessageMeta = {}): Promise<void> {
    await this.#ensureSession(sessionId);
    const isQa=sessionId.startsWith('qa-');
    if(role==='user'){
      const body=[{session_id:sessionId,mensaje_cliente:content,respuesta_bot:null,message_id:meta.messageId??null,request_id:meta.requestId??null,tipo_conversacion:meta.conversationType??(isQa?'QA_LIVE':null),modelo:meta.model??'stech-backend',fecha:new Date().toISOString()}];
      const r=await this.#fetcher(`${this.#url}/rest/v1/${this.#conversationTable}`,{method:'POST',headers:this.#headers({Prefer:'return=representation'}),body:JSON.stringify(body)});
      if(!r.ok) throw new Error(`Supabase conversation user write HTTP ${r.status}`);
      const rows:any[]=await r.json(); const id=String(rows[0]?.id??''); if(!id) throw new Error('Supabase conversation insert returned no id');
      this.#pendingTurnId.set(sessionId,id); this.#pendingMessageId.set(sessionId,meta.messageId??null); this.#pendingRequestId.set(sessionId,meta.requestId??null); return;
    }
    const turnId=this.#pendingTurnId.get(sessionId); if(!turnId) throw new Error(`Supabase conversation turn missing pending user row for ${sessionId}`);
    const state=this.#lastState.get(sessionId);
    const body={respuesta_bot:content,intencion:state?.lastIntent??null,ruta:state?.lastRoute??null,producto_detectado:state?.queryTarget??state?.activeProduct??null,
      cambio_producto_explicito:state?.explicitSwitch??false,producto_id_resuelto:state?.lastResolvedProductId??null,producto_codigo_resuelto:state?.lastResolvedProductCode??null,
      estado_resolucion_producto:state?.lastResolvedProductId?'CONFIRMADO':'NO_CONFIRMADO',origen_resolucion_producto:state?productOrigin(state):'SIN_RESOLVER',
      requiere_aclaracion:state?.lastRoute==='CLARIFICATION'||Boolean(state?.explicitSwitch&&!state?.lastResolvedProductId),siguiente_accion:state?.lastNba??null,...(meta.model?{modelo:meta.model}:{})};
    const r=await this.#fetcher(`${this.#url}/rest/v1/${this.#conversationTable}?id=eq.${encodeURIComponent(turnId)}`,{method:'PATCH',headers:this.#headers(),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Supabase conversation assistant write HTTP ${r.status}`); this.#pendingTurnId.delete(sessionId);
  }

  async getMessages(sessionId: string) {
    const q=new URL(`${this.#url}/rest/v1/${this.#conversationTable}`); q.searchParams.set('session_id',`eq.${sessionId}`); q.searchParams.set('select','mensaje_cliente,respuesta_bot,fecha'); q.searchParams.set('order','fecha.asc');
    const r=await this.#fetcher(q,{headers:this.#headers()}); if(!r.ok) throw new Error(`Supabase message read HTTP ${r.status}`); const rows:any[]=await r.json();
    const out:Array<{role:'user'|'assistant';content:string;at:string}>=[]; for(const row of rows){if(row.mensaje_cliente!=null)out.push({role:'user',content:String(row.mensaje_cliente),at:String(row.fecha??'')});if(row.respuesta_bot!=null)out.push({role:'assistant',content:String(row.respuesta_bot),at:String(row.fecha??'')});} return out;
  }

  async reset(sessionId: string): Promise<void> {
    for(const table of [this.#conversationTable,this.#contextTable]){const r=await this.#fetcher(`${this.#url}/rest/v1/${table}?session_id=eq.${encodeURIComponent(sessionId)}`,{method:'DELETE',headers:this.#headers()});if(!r.ok)throw new Error(`Supabase reset HTTP ${r.status}`);}
    this.#pendingTurnId.delete(sessionId);this.#pendingMessageId.delete(sessionId);this.#pendingRequestId.delete(sessionId);this.#lastState.delete(sessionId);this.#activeLease.delete(sessionId);
  }
}

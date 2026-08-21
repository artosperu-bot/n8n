import type { ConversationMessageMeta, ConversationRepository } from '../../ports/ConversationRepository.ts';
import type { ConversationState } from '../../domain/types.ts';

type Options = {
  url: string;
  key: string;
  sessionTable?: string;
  contextTable?: string;
  conversationTable?: string;
  fetcher?: typeof fetch;
};

function spinPhase(state: ConversationState): string | null {
  if (state.purchaseSignal) return 'NECESIDAD_SOLUCION';
  if (state.problem) return 'PROBLEMA';
  if ((state.priorities?.length ?? 0) > 0) return 'NECESIDAD_SOLUCION';
  if (state.useCase || state.sector) return 'SITUACION';
  return null;
}

export class SupabaseConversationRepository implements ConversationRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #sessionTable: string;
  readonly #contextTable: string;
  readonly #conversationTable: string;
  readonly #fetcher: typeof fetch;
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

  async #ensureSession(sessionId: string): Promise<void> {
    const body = [{ session_id: sessionId, canal: sessionId.startsWith('qa-') ? 'qa_live' : 'backend' }];
    const r = await this.#fetcher(`${this.#url}/rest/v1/${this.#sessionTable}?on_conflict=session_id`, {
      method: 'POST', headers: this.#headers({ Prefer: 'resolution=ignore-duplicates' }), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase session ensure HTTP ${r.status}`);
  }

  async getState(sessionId: string): Promise<ConversationState> {
    const q = new URL(`${this.#url}/rest/v1/${this.#contextTable}`);
    q.searchParams.set('session_id', `eq.${sessionId}`);
    q.searchParams.set('select', 'contexto');
    q.searchParams.set('limit', '1');
    const r = await this.#fetcher(q, { headers: this.#headers() });
    if (!r.ok) throw new Error(`Supabase state read HTTP ${r.status}`);
    const rows: any[] = await r.json();
    return rows[0]?.contexto ?? { sessionId, turnCount: 0, comparisonProducts: [], spinFacts: [], priorities: [] };
  }

  async saveState(sessionId: string, state: ConversationState): Promise<void> {
    await this.#ensureSession(sessionId);
    const normalized = { ...state, sessionId };
    const body = [{
      session_id: sessionId,
      canal: sessionId.startsWith('qa-') ? 'qa_live' : 'backend',
      contexto: normalized,
      ultima_intencion: normalized.lastIntent ?? null,
      ultima_accion: normalized.lastNba ?? null,
      ultima_ruta: normalized.lastRoute ?? null,
      ultimo_mensaje_cliente: normalized.lastUserMessage ?? null,
      ultima_respuesta_bot: normalized.lastAssistantMessage ?? null,
      actividad_activa: normalized.useCase ?? normalized.sector ?? null,
      problema_activo: normalized.problem ?? null,
      presupuesto_activo: normalized.budget ?? null,
      cantidad_activa: normalized.quantity ?? null,
      objecion_activa: normalized.objection ?? null,
      senal_compra: normalized.purchaseSignal ?? false,
      accion_pendiente: normalized.lastNba ?? null,
      etapa_conversacion: normalized.commercialStage ?? 'INICIAL',
      producto_activo_id: normalized.activeProductId ?? null,
      producto_activo_confianza: normalized.activeProductId ? (normalized.lastProductResolutionConfidence ?? 1) : 0,
      producto_activo_origen: normalized.lastProductResolutionOrigin ?? 'STECH_BACKEND',
      productos_candidatos: normalized.comparisonProducts ?? [],
      alcance_consulta: normalized.lastRoute ?? null,
      requiere_aclaracion: normalized.lastRoute === 'CLARIFICATION',
      derivacion_activa: normalized.handoffActive ?? false,
      bloquear_respuesta_automatica: normalized.blockAutomaticReply ?? false,
      motivo_derivacion: normalized.handoffReason ?? null,
      contrato_version: 'STECH_TURN_V04',
      ultimo_message_id: this.#pendingMessageId.get(sessionId) ?? null,
      ultimo_request_id: this.#pendingRequestId.get(sessionId) ?? null,
      ultimo_turno_fecha: new Date().toISOString(),
      updated_by: 'stech_backend_v04',
      updated_at: new Date().toISOString(),
    }];
    const r = await this.#fetcher(`${this.#url}/rest/v1/${this.#contextTable}?on_conflict=session_id`, {
      method: 'POST', headers: this.#headers({ Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase state write HTTP ${r.status}`);
    this.#lastState.set(sessionId, structuredClone(normalized));
  }

  async appendMessage(sessionId: string, role: 'user' | 'assistant', content: string, meta: ConversationMessageMeta = {}): Promise<void> {
    await this.#ensureSession(sessionId);
    const isQa = sessionId.startsWith('qa-');

    if (role === 'user') {
      const body = [{
        session_id: sessionId,
        mensaje_cliente: content,
        respuesta_bot: null,
        message_id: meta.messageId ?? null,
        request_id: meta.requestId ?? null,
        tipo_conversacion: meta.conversationType ?? (isQa ? 'QA_LIVE' : null),
        modelo: meta.model ?? 'stech-backend',
        fecha: new Date().toISOString(),
      }];
      const r = await this.#fetcher(`${this.#url}/rest/v1/${this.#conversationTable}`, {
        method: 'POST', headers: this.#headers({ Prefer: 'return=representation' }), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Supabase conversation user write HTTP ${r.status}`);
      const rows: any[] = await r.json();
      const id = String(rows[0]?.id ?? '');
      if (!id) throw new Error('Supabase conversation insert returned no id');
      this.#pendingTurnId.set(sessionId, id);
      this.#pendingMessageId.set(sessionId, meta.messageId ?? null);
      this.#pendingRequestId.set(sessionId, meta.requestId ?? null);
      return;
    }

    const turnId = this.#pendingTurnId.get(sessionId);
    if (!turnId) throw new Error(`Supabase conversation turn missing pending user row for ${sessionId}`);
    const state = this.#lastState.get(sessionId);
    const objective = state?.lastNba ?? null;
    const body = {
      respuesta_bot: content,
      intencion: state?.lastIntent ?? null,
      categoria: state?.secondaryIntents?.[0] ?? null,
      ruta: state?.lastRoute ?? null,
      objetivo: objective,
      producto_detectado: state?.queryTarget ?? state?.selectedProduct ?? state?.recommendedProduct ?? state?.activeProduct ?? null,
      cantidad_detectada: state?.quantity ?? null,
      presupuesto_detectado: state?.budget ?? null,
      requiere_sql: state?.requiresSql ?? false,
      requiere_rag: state?.requiresRag ?? false,
      sql_tool_sugerido: state?.lastSqlTools?.[0] ?? null,
      sql_tool_disponible: Boolean(state?.lastSqlTools?.length),
      etapa_comercial: state?.commercialStage ?? null,
      objecion_principal: state?.objection ?? null,
      estrategia_recomendada: state?.commercialStrategy ?? null,
      siguiente_accion: state?.lastNba ?? null,
      perfil_cliente: state?.customerType ?? null,
      derivar_humano: state?.handoffActive ?? false,
      cambio_producto_explicito: state?.explicitSwitch ?? false,
      producto_id_resuelto: state?.lastResolvedProductId ?? null,
      producto_codigo_resuelto: state?.lastResolvedProductCode ?? null,
      estado_resolucion_producto: state?.lastResolvedProductId ? 'RESUELTO' : null,
      origen_resolucion_producto: state?.lastProductResolutionOrigin ?? null,
      confianza_producto: state?.lastProductResolutionConfidence ?? null,
      productos_candidatos: state?.comparisonProducts ?? [],
      alcance_consulta: state?.lastRoute ?? null,
      requiere_aclaracion: state?.lastRoute === 'CLARIFICATION',
      producto_objetivo_turno: {
        queryTarget: state?.queryTarget ?? null,
        activeProduct: state?.activeProduct ?? null,
        salientProduct: state?.salientProduct ?? null,
        selectedProduct: state?.selectedProduct ?? null,
        recommendedProduct: state?.recommendedProduct ?? null,
      },
      spin_aporte: state?.spinFacts?.slice(-3).join('|') || null,
      spin_fase_actual: state ? spinPhase(state) : null,
      actividad_detectada: state?.useCase ?? state?.sector ?? null,
      problemas_detectados: state?.problem ? [state.problem] : [],
      prioridades_detectadas: state?.priorities ?? [],
      accion_pendiente_turno: state?.lastNba ? { accion: state.lastNba } : null,
      contexto_comercial_snapshot: state ? {
        customerType: state.customerType ?? null,
        sector: state.sector ?? null,
        useCase: state.useCase ?? null,
        problem: state.problem ?? null,
        priorities: state.priorities ?? [],
        budget: state.budget ?? null,
        quantity: state.quantity ?? null,
        invoiceRequired: state.invoiceRequired ?? null,
        purchaseSignal: state.purchaseSignal ?? false,
        handoffActive: state.handoffActive ?? false,
      } : null,
      objecion_detectada: state?.objection ? { tipo: state.objection } : null,
      ...(meta.model ? { modelo: meta.model } : {}),
    };
    const r = await this.#fetcher(`${this.#url}/rest/v1/${this.#conversationTable}?id=eq.${encodeURIComponent(turnId)}`, {
      method: 'PATCH', headers: this.#headers(), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Supabase conversation assistant write HTTP ${r.status}`);
    this.#pendingTurnId.delete(sessionId);
  }

  async getMessages(sessionId: string) {
    const q = new URL(`${this.#url}/rest/v1/${this.#conversationTable}`);
    q.searchParams.set('session_id', `eq.${sessionId}`);
    q.searchParams.set('select', 'mensaje_cliente,respuesta_bot,fecha');
    q.searchParams.set('order', 'fecha.asc');
    const r = await this.#fetcher(q, { headers: this.#headers() });
    if (!r.ok) throw new Error(`Supabase message read HTTP ${r.status}`);
    const rows: any[] = await r.json();
    const out: Array<{ role: 'user' | 'assistant'; content: string; at: string }> = [];
    for (const row of rows) {
      if (row.mensaje_cliente != null) out.push({ role: 'user', content: String(row.mensaje_cliente), at: String(row.fecha ?? '') });
      if (row.respuesta_bot != null) out.push({ role: 'assistant', content: String(row.respuesta_bot), at: String(row.fecha ?? '') });
    }
    return out;
  }

  async reset(sessionId: string): Promise<void> {
    for (const table of [this.#conversationTable, this.#contextTable]) {
      const r = await this.#fetcher(`${this.#url}/rest/v1/${table}?session_id=eq.${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: this.#headers() });
      if (!r.ok) throw new Error(`Supabase reset HTTP ${r.status}`);
    }
    this.#pendingTurnId.delete(sessionId);
    this.#pendingMessageId.delete(sessionId);
    this.#pendingRequestId.delete(sessionId);
    this.#lastState.delete(sessionId);
  }
}

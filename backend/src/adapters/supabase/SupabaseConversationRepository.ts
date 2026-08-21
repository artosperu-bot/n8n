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

export class SupabaseConversationRepository implements ConversationRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #sessionTable: string;
  readonly #contextTable: string;
  readonly #conversationTable: string;
  readonly #fetcher: typeof fetch;
  readonly #pendingTurnId = new Map<string, string>();
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
    return {
      apikey: this.#key,
      authorization: `Bearer ${this.#key}`,
      'content-type': 'application/json',
      ...extra,
    };
  }

  async #ensureSession(sessionId: string): Promise<void> {
    const body = [{ session_id: sessionId, canal: sessionId.startsWith('qa-') ? 'qa_live' : 'backend' }];
    const r = await this.#fetcher(
      `${this.#url}/rest/v1/${this.#sessionTable}?on_conflict=session_id`,
      {
        method: 'POST',
        headers: this.#headers({ Prefer: 'resolution=ignore-duplicates' }),
        body: JSON.stringify(body),
      },
    );
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
    return rows[0]?.contexto ?? {
      sessionId,
      turnCount: 0,
      comparisonProducts: [],
      spinFacts: [],
    };
  }

  async saveState(sessionId: string, state: ConversationState): Promise<void> {
    await this.#ensureSession(sessionId);
    const normalized = { ...state, sessionId };
    const body = [{
      session_id: sessionId,
      contexto: normalized,
      ultima_intencion: normalized.lastIntent ?? null,
      presupuesto_activo: normalized.budget ?? null,
      producto_activo_origen: 'STECH_BACKEND',
      updated_by: 'stech_backend',
      updated_at: new Date().toISOString(),
    }];
    const r = await this.#fetcher(
      `${this.#url}/rest/v1/${this.#contextTable}?on_conflict=session_id`,
      {
        method: 'POST',
        headers: this.#headers({ Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) throw new Error(`Supabase state write HTTP ${r.status}`);
    this.#lastState.set(sessionId, structuredClone(normalized));
  }

  async appendMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    meta: ConversationMessageMeta = {},
  ): Promise<void> {
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
        method: 'POST',
        headers: this.#headers({ Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Supabase conversation user write HTTP ${r.status}`);
      const rows: any[] = await r.json();
      const id = String(rows[0]?.id ?? '');
      if (!id) throw new Error('Supabase conversation insert returned no id');
      this.#pendingTurnId.set(sessionId, id);
      return;
    }

    const turnId = this.#pendingTurnId.get(sessionId);
    if (!turnId) throw new Error(`Supabase conversation turn missing pending user row for ${sessionId}`);
    const state = this.#lastState.get(sessionId);
    const body = {
      respuesta_bot: content,
      intencion: state?.lastIntent ?? null,
      producto_detectado: state?.queryTarget ?? state?.activeProduct ?? null,
      presupuesto_detectado: state?.budget ?? null,
      cambio_producto_explicito: state?.explicitSwitch ?? false,
      ...(meta.model ? { modelo: meta.model } : {}),
    };
    const r = await this.#fetcher(
      `${this.#url}/rest/v1/${this.#conversationTable}?id=eq.${encodeURIComponent(turnId)}`,
      {
        method: 'PATCH',
        headers: this.#headers(),
        body: JSON.stringify(body),
      },
    );
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
      if (row.mensaje_cliente != null) {
        out.push({ role: 'user', content: String(row.mensaje_cliente), at: String(row.fecha ?? '') });
      }
      if (row.respuesta_bot != null) {
        out.push({ role: 'assistant', content: String(row.respuesta_bot), at: String(row.fecha ?? '') });
      }
    }
    return out;
  }

  async reset(sessionId: string): Promise<void> {
    for (const table of [this.#conversationTable, this.#contextTable]) {
      const r = await this.#fetcher(
        `${this.#url}/rest/v1/${table}?session_id=eq.${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: this.#headers() },
      );
      if (!r.ok) throw new Error(`Supabase reset HTTP ${r.status}`);
    }
    this.#pendingTurnId.delete(sessionId);
    this.#lastState.delete(sessionId);
  }
}

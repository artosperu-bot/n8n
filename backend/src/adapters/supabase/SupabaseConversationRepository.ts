import type { ConversationRepository } from '../../ports/ConversationRepository.ts';
import type { ConversationState } from '../../domain/types.ts';

type Options = {
  url: string; key: string; stateTable: string; sessionIdColumn: string; stateColumn: string;
  messageTable?: string; messageSessionColumn?: string; messageRoleColumn?: string; messageContentColumn?: string; fetcher?: typeof fetch;
};

export class SupabaseConversationRepository implements ConversationRepository {
  readonly #o: Required<Omit<Options, 'fetcher'>>; readonly #fetcher: typeof fetch;
  constructor(options: Options) {
    this.#o = {
      url: options.url.replace(/\/$/, ''), key: options.key, stateTable: options.stateTable, sessionIdColumn: options.sessionIdColumn, stateColumn: options.stateColumn,
      messageTable: options.messageTable ?? 'ia_conversaciones', messageSessionColumn: options.messageSessionColumn ?? 'session_id', messageRoleColumn: options.messageRoleColumn ?? 'role', messageContentColumn: options.messageContentColumn ?? 'content'
    };
    this.#fetcher = options.fetcher ?? fetch;
  }
  #headers(extra: Record<string,string> = {}) { return { apikey: this.#o.key, authorization: `Bearer ${this.#o.key}`, 'content-type': 'application/json', ...extra }; }
  async getState(sessionId: string): Promise<ConversationState> {
    const q = new URL(`${this.#o.url}/rest/v1/${this.#o.stateTable}`); q.searchParams.set(this.#o.sessionIdColumn, `eq.${sessionId}`); q.searchParams.set('select', this.#o.stateColumn); q.searchParams.set('limit', '1');
    const r = await this.#fetcher(q, { headers: this.#headers() }); if (!r.ok) throw new Error(`Supabase state read HTTP ${r.status}`); const rows: any[] = await r.json();
    return rows[0]?.[this.#o.stateColumn] ?? { sessionId, turnCount: 0, comparisonProducts: [], spinFacts: [] };
  }
  async saveState(sessionId: string, state: ConversationState): Promise<void> {
    const body = [{ [this.#o.sessionIdColumn]: sessionId, [this.#o.stateColumn]: state }];
    const r = await this.#fetcher(`${this.#o.url}/rest/v1/${this.#o.stateTable}?on_conflict=${encodeURIComponent(this.#o.sessionIdColumn)}`, { method: 'POST', headers: this.#headers({ Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Supabase state write HTTP ${r.status}`);
  }
  async appendMessage(sessionId: string, role: 'user'|'assistant', content: string): Promise<void> {
    const body = [{ [this.#o.messageSessionColumn]: sessionId, [this.#o.messageRoleColumn]: role, [this.#o.messageContentColumn]: content }];
    const r = await this.#fetcher(`${this.#o.url}/rest/v1/${this.#o.messageTable}`, { method: 'POST', headers: this.#headers(), body: JSON.stringify(body) }); if (!r.ok) throw new Error(`Supabase message write HTTP ${r.status}`);
  }
  async getMessages(sessionId: string) {
    const q = new URL(`${this.#o.url}/rest/v1/${this.#o.messageTable}`); q.searchParams.set(this.#o.messageSessionColumn, `eq.${sessionId}`); q.searchParams.set('select', `${this.#o.messageRoleColumn},${this.#o.messageContentColumn}`); q.searchParams.set('order', 'created_at.asc');
    const r = await this.#fetcher(q, { headers: this.#headers() }); if (!r.ok) throw new Error(`Supabase message read HTTP ${r.status}`); const rows: any[] = await r.json();
    return rows.map(x => ({ role: x[this.#o.messageRoleColumn] as 'user'|'assistant', content: String(x[this.#o.messageContentColumn] ?? ''), at: String(x.created_at ?? '') }));
  }
  async reset(sessionId: string): Promise<void> {
    for (const [table, col] of [[this.#o.messageTable, this.#o.messageSessionColumn], [this.#o.stateTable, this.#o.sessionIdColumn]] as const) {
      const r = await this.#fetcher(`${this.#o.url}/rest/v1/${table}?${encodeURIComponent(col)}=eq.${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: this.#headers() }); if (!r.ok) throw new Error(`Supabase reset HTTP ${r.status}`);
    }
  }
}

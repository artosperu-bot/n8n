import type { RagRepository } from '../../ports/RagRepository.ts';
import type { RagEvidence } from '../../domain/types.ts';
type Options = { url: string; key: string; rpc: string; fetcher?: typeof fetch };
export class SupabaseRagRepository implements RagRepository {
  readonly #o: Options; readonly #fetcher: typeof fetch;
  constructor(options: Options) { this.#o = options; this.#fetcher = options.fetcher ?? fetch; }
  async search(query: string, product?: string | null): Promise<RagEvidence[]> {
    const r = await this.#fetcher(`${this.#o.url.replace(/\/$/,'')}/rest/v1/rpc/${this.#o.rpc}`, { method: 'POST', headers: { apikey: this.#o.key, authorization: `Bearer ${this.#o.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ query_text: query, product_filter: product ?? null }) });
    if (!r.ok) throw new Error(`Supabase RAG HTTP ${r.status}`); const rows: any[] = await r.json();
    return rows.map(x => ({ text: String(x.content ?? x.text ?? ''), source: String(x.source ?? x.metadata?.source ?? 'SUPABASE_RAG'), score: x.similarity == null ? undefined : Number(x.similarity) }));
  }
}

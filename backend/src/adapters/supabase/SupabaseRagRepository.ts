import type { RagRepository } from '../../ports/RagRepository.ts';
import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';
import { resolveInstitutionalTopic } from '../../conversation/institutional/InstitutionalTopicResolver.ts';
export { resolveInstitutionalTopic } from '../../conversation/institutional/InstitutionalTopicResolver.ts';

type Options = { url: string; key: string; rpc?: string; fetcher?: typeof fetch; ttlMs?: number };
type Product = { producto_id: string; nombre?: string; nombre_corto?: string; modelo?: string; producto_codigo?: string };
type ProductDoc = { producto_id?: string; content?: string; metadata?: Record<string, unknown> };
type Institutional = Record<string, any>;
type Cache = { loadedAt: number; products: Product[]; docs: ProductDoc[]; institutional: Institutional[] };

const STOP = new Set(['que','cual','como','tiene','para','del','de','el','la','los','las','una','uno','con','por']);
function tokens(value: string): string[] { return [...new Set(fold(value).split(/[^a-z0-9]+/).filter(x => x.length >= 3 && !STOP.has(x)))]; }
function validText(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function searchable(value: unknown): string { return fold(typeof value === 'string' ? value : JSON.stringify(value ?? '')); }

export class SupabaseRagRepository implements RagRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #fetcher: typeof fetch;
  readonly #ttlMs: number;
  #cache: Cache | null = null;

  constructor(options: Options) {
    this.#url = options.url.replace(/\/$/, '');
    this.#key = options.key;
    this.#fetcher = options.fetcher ?? fetch;
    this.#ttlMs = options.ttlMs ?? 300_000;
  }

  #headers() { return { apikey: this.#key, authorization: `Bearer ${this.#key}` }; }

  async #get(path: string): Promise<any[]> {
    const response = await this.#fetcher(`${this.#url}/rest/v1/${path}`, { headers: this.#headers() });
    if (!response.ok) throw new Error(`Supabase knowledge HTTP ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  async #load(): Promise<Cache> {
    if (this.#cache && Date.now() - this.#cache.loadedAt < this.#ttlMs) return this.#cache;
    const [products, docs, institutional] = await Promise.all([
      this.#get('catalogo_productos?activo=eq.true&select=producto_id,nombre,nombre_corto,modelo,producto_codigo'),
      this.#get('documents?select=producto_id,content,metadata'),
      this.#get('rag_institucional?activo=eq.true&select=categoria,subcategoria,titulo,pregunta_canonica,preguntas_ejemplo,sinonimos,keywords,respuesta_base,accion_siguiente,requiere_dato,dato_requerido,requiere_asesor,afirmable,prioridad,content'),
    ]);
    this.#cache = { loadedAt: Date.now(), products, docs, institutional };
    return this.#cache;
  }

  #resolveProduct(products: Product[], product?: string | null): string | null {
    if (!product) return null;
    const p = fold(product);
    return products.find(x => [x.producto_id,x.nombre_corto,x.modelo,x.nombre,x.producto_codigo].some(v => v && (p === fold(v) || p.includes(fold(v)) || fold(v).includes(p))))?.producto_id ?? null;
  }

  async searchProduct(query: string, productId: string, sections: string[] = [], limit = 8): Promise<RagEvidence[]> {
    const pid = productId.trim();
    if (!pid) throw new Error('productId is required for product RAG');
    const cache = await this.#load();
    const wanted = new Set(sections.map(section => fold(section)));
    const qTokens = tokens(query);
    const scored: Array<{ score: number; evidence: RagEvidence }> = [];

    for (const row of cache.docs) {
      if (row.producto_id !== pid) continue;
      const section = String(row.metadata?.seccion ?? 'GENERAL');
      if (wanted.size && !wanted.has(fold(section))) continue;
      const content = validText(row.content);
      if (!content) continue;
      const hay = searchable([content, row.metadata]);
      let score = qTokens.reduce((n, token) => n + (hay.includes(token) ? 2 : 0), 0);
      if (wanted.has(fold(section))) score += 20;
      score += 10;
      scored.push({ score, evidence: { text: content, source: `SUPABASE_DOCUMENTS:${section}`, score, productId: pid, section, domain: 'PRODUCT' } });
    }

    return scored.sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(12, limit))).map(x => x.evidence);
  }

  async searchInstitutional(query: string, limit = 4): Promise<RagEvidence[]> {
    const cache = await this.#load();
    const qTokens = tokens(query);
    const topic = resolveInstitutionalTopic(query);
    let pool = cache.institutional.filter(row => row.afirmable !== false);
    if (topic) {
      const exact = pool.filter(row => fold(row.categoria) === fold(topic.category) && (!topic.subcategory || fold(row.subcategoria) === fold(topic.subcategory)));
      if (exact.length) pool = exact;
      else {
        const byCategory = pool.filter(row => fold(row.categoria) === fold(topic.category));
        if (byCategory.length) pool = byCategory;
      }
    }

    const scored: Array<{ score: number; evidence: RagEvidence }> = [];
    for (const row of pool) {
      const base = validText(row.respuesta_base) || validText(row.content);
      if (!base) continue;
      const hay = searchable([row.categoria,row.subcategoria,row.titulo,row.pregunta_canonica,row.preguntas_ejemplo,row.sinonimos,row.keywords,base]);
      let score = qTokens.reduce((n, token) => n + (hay.includes(token) ? 3 : 0), 0);
      score += Math.min(5, Number(row.prioridad ?? 0) / 20);
      if (topic && fold(row.categoria) === fold(topic.category)) score += 50;
      if (topic?.subcategory && fold(row.subcategoria) === fold(topic.subcategory)) score += 100;
      if (score <= 0) continue;
      scored.push({ score, evidence: { text: base, source: `SUPABASE_INSTITUCIONAL:${String(row.categoria ?? 'general')}:${String(row.subcategoria ?? 'general')}`, score, domain: 'INSTITUTIONAL' } });
    }

    return scored.sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(8, limit))).map(x => x.evidence);
  }

  async search(query: string, product?: string | null): Promise<RagEvidence[]> {
    const cache = await this.#load();
    if (product) {
      const productId = this.#resolveProduct(cache.products, product);
      return productId ? this.searchProduct(query, productId) : [];
    }
    return this.searchInstitutional(query);
  }
}

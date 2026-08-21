import type { RagRepository } from '../../ports/RagRepository.ts';
import type { EmbeddingProvider } from '../../ports/EmbeddingProvider.ts';
import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';
import { resolveInstitutionalTopic } from '../../conversation/institutional/InstitutionalTopicResolver.ts';
export { resolveInstitutionalTopic } from '../../conversation/institutional/InstitutionalTopicResolver.ts';

type Options = {
  url: string;
  key: string;
  rpc?: string;
  productRpc?: string;
  institutionalRpc?: string;
  embeddingProvider?: EmbeddingProvider;
  fetcher?: typeof fetch;
  ttlMs?: number;
};
type Product = { producto_id: string; nombre?: string; nombre_corto?: string; modelo?: string; producto_codigo?: string };
type ProductDoc = { producto_id?: string; content?: string; metadata?: Record<string, unknown> };
type Institutional = Record<string, any>;
type Cache = { loadedAt: number; products: Product[]; docs: ProductDoc[]; institutional: Institutional[] };

const STOP = new Set(['que','cual','como','tiene','para','del','de','el','la','los','las','una','uno','con','por']);
function tokens(value: string): string[] { return [...new Set(fold(value).split(/[^a-z0-9]+/).filter(x => x.length >= 3 && !STOP.has(x)))]; }
function validText(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function searchable(value: unknown): string { return fold(typeof value === 'string' ? value : JSON.stringify(value ?? '')); }
function boundedLimit(limit:number,max=12){return Math.max(1,Math.min(max,Number(limit)||1));}

export class SupabaseRagRepository implements RagRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #fetcher: typeof fetch;
  readonly #ttlMs: number;
  readonly #embeddingProvider: EmbeddingProvider | null;
  readonly #productRpc: string;
  readonly #institutionalRpc: string;
  #cache: Cache | null = null;

  constructor(options: Options) {
    this.#url = options.url.replace(/\/$/, '');
    this.#key = options.key;
    this.#fetcher = options.fetcher ?? fetch;
    this.#ttlMs = options.ttlMs ?? 300_000;
    this.#embeddingProvider=options.embeddingProvider??null;
    this.#productRpc=options.productRpc??(options.rpc&&options.rpc!=='match_documents'?options.rpc:'buscar_rag_producto_documents_v37');
    this.#institutionalRpc=options.institutionalRpc??'buscar_rag_institucional_v37';
  }

  #headers() { return { apikey: this.#key, authorization: `Bearer ${this.#key}` }; }
  #jsonHeaders(){return {...this.#headers(),'content-type':'application/json'};}

  async #get(path: string): Promise<any[]> {
    const response = await this.#fetcher(`${this.#url}/rest/v1/${path}`, { headers: this.#headers() });
    if (!response.ok) throw new Error(`Supabase knowledge HTTP ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  async #rpc(name:string,args:Record<string,unknown>):Promise<any[]> {
    const response=await this.#fetcher(`${this.#url}/rest/v1/rpc/${encodeURIComponent(name)}`,{
      method:'POST',headers:this.#jsonHeaders(),body:JSON.stringify(args),
    });
    if(!response.ok)throw new Error(`Supabase RAG RPC ${name} HTTP ${response.status}`);
    const rows=await response.json();
    return Array.isArray(rows)?rows:[];
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

  async #vectorProduct(query:string,pid:string,sections:string[],limit:number):Promise<RagEvidence[]> {
    if(!this.#embeddingProvider)return[];
    const vector=await this.#embeddingProvider.embed(query);
    const wanted=new Set(sections.map(fold));
    const rows=await this.#rpc(this.#productRpc,{
      p_query_embedding:vector,
      p_producto_id:pid,
      p_match_count:wanted.size?20:boundedLimit(limit,20),
      p_match_threshold:0.40,
    });
    return rows
      .filter(row=>String(row.producto_id??pid)===pid)
      .map(row=>{
        const section=String(row.metadata?.seccion??row.seccion??'GENERAL');
        const text=validText(row.content??row.contenido);
        return {row,section,text};
      })
      .filter(x=>x.text&&(!wanted.size||wanted.has(fold(x.section))))
      .sort((a,b)=>Number(b.row.similarity??0)-Number(a.row.similarity??0))
      .slice(0,boundedLimit(limit))
      .map(x=>({text:x.text,source:`SUPABASE_VECTOR_DOCUMENTS:${x.section}`,score:Number(x.row.similarity??0),productId:pid,section:x.section,domain:'PRODUCT'}));
  }

  async #lexicalProduct(query:string,pid:string,sections:string[],limit:number):Promise<RagEvidence[]> {
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
    return scored.sort((a,b) => b.score - a.score).slice(0,boundedLimit(limit)).map(x => x.evidence);
  }

  async searchProduct(query: string, productId: string, sections: string[] = [], limit = 8): Promise<RagEvidence[]> {
    const pid = productId.trim();
    if (!pid) throw new Error('productId is required for product RAG');
    if(this.#embeddingProvider){
      try{
        const vectorRows=await this.#vectorProduct(query,pid,sections,limit);
        if(vectorRows.length)return vectorRows;
      }catch{}
    }
    return this.#lexicalProduct(query,pid,sections,limit);
  }

  async #vectorInstitutional(query:string,limit:number):Promise<RagEvidence[]> {
    if(!this.#embeddingProvider)return[];
    const topic=resolveInstitutionalTopic(query);
    const vector=await this.#embeddingProvider.embed(query);
    let rows=await this.#rpc(this.#institutionalRpc,{
      p_query_embedding:vector,
      p_match_count:boundedLimit(limit,20),
      p_match_threshold:0.45,
      p_dominio:null,
      p_categoria:topic?.category??null,
      p_solo_afirmable:true,
    });
    if(topic?.subcategory){
      const exact=rows.filter(row=>fold(row.subcategoria)===fold(topic.subcategory!));
      if(exact.length)rows=exact;
    }
    return rows.slice(0,boundedLimit(limit,8)).map(row=>{
      const base=validText(row.respuesta_base)||validText(row.contenido)||validText(row.content);
      return {text:base,source:`SUPABASE_VECTOR_INSTITUCIONAL:${String(row.categoria??'general')}:${String(row.subcategoria??'general')}`,score:Number(row.similarity??0),domain:'INSTITUTIONAL'} as RagEvidence;
    }).filter(row=>Boolean(row.text));
  }

  async #lexicalInstitutional(query:string,limit:number):Promise<RagEvidence[]> {
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
    return scored.sort((a,b) => b.score - a.score).slice(0,boundedLimit(limit,8)).map(x => x.evidence);
  }

  async searchInstitutional(query: string, limit = 4): Promise<RagEvidence[]> {
    if(this.#embeddingProvider){
      try{
        const vectorRows=await this.#vectorInstitutional(query,limit);
        if(vectorRows.length)return vectorRows;
      }catch{}
    }
    return this.#lexicalInstitutional(query,limit);
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

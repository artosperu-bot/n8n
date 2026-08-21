import type { RagRepository } from '../../ports/RagRepository.ts';
import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Options = { url: string; key: string; rpc?: string; fetcher?: typeof fetch; ttlMs?: number };
type Product = { producto_id: string; nombre?: string; nombre_corto?: string; modelo?: string; producto_codigo?: string };
type ProductDoc = { producto_id?: string; content?: string; metadata?: Record<string, unknown> };
type Institutional = Record<string, any>;
type Cache = { loadedAt: number; products: Product[]; docs: ProductDoc[]; institutional: Institutional[] };

const STOP = new Set(['que','cual','cuales','como','tiene','tienen','para','del','de','el','la','los','las','un','una','y','o','me','mi','es','son','en','con','por','se']);
const SECTION_HINTS: Array<[RegExp, string]> = [
  [/\b(bateria|autonomia|carga)\b/, 'BATERIA'],
  [/\b(camara|foto|video|vision nocturna)\b/, 'CAMARA'],
  [/\b(resistente|resistencia|ip68|ip69k|caida|golpe)\b/, 'RESISTENCIA'],
  [/\b(nfc|wifi|bluetooth|usb|infrarrojo)\b/, 'CONECTIVIDAD'],
  [/\b(5g|4g|red|bandas|volte)\b/, 'REDES'],
  [/\b(ram|memoria|almacenamiento|microsd)\b/, 'MEMORIA'],
  [/\b(procesador|rendimiento|cpu|gpu)\b/, 'RENDIMIENTO'],
  [/\b(pantalla|hz|resolucion)\b/, 'PANTALLA'],
  [/\b(peso|grosor|dimensiones|color)\b/, 'FISICO'],
];
const POLICY_HINT = /\b(envio|envios|provincia|lima|recojo|recoger|tienda|direccion|horario|contraentrega|pago|pagos|yape|plin|transferencia|tarjeta|factura|boleta|garantia|cambio|devolucion|reembolso|reserva|separar|privacidad|reclamo)\b/;

function tokens(value: string): string[] {
  return [...new Set(fold(value).split(/[^a-z0-9]+/).filter(x => x.length >= 3 && !STOP.has(x)))];
}
function searchable(value: unknown): string { return fold(typeof value === 'string' ? value : JSON.stringify(value ?? '')); }
function validText(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

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
    const r = await this.#fetcher(`${this.#url}/rest/v1/${path}`, { headers: this.#headers() });
    if (!r.ok) throw new Error(`Supabase knowledge HTTP ${r.status}`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  }

  async #load(): Promise<Cache> {
    if (this.#cache && Date.now() - this.#cache.loadedAt < this.#ttlMs) return this.#cache;
    const [products, docs, institutional] = await Promise.all([
      this.#get('catalogo_productos?activo=eq.true&select=producto_id,nombre,nombre_corto,modelo,producto_codigo'),
      this.#get('documents?select=producto_id,content,metadata'),
      this.#get('rag_institucional?activo=eq.true&select=categoria,subcategoria,titulo,pregunta_canonica,preguntas_ejemplo,sinonimos,keywords,respuesta_base,accion_siguiente,requiere_asesor,afirmable,prioridad,content'),
    ]);
    this.#cache = { loadedAt: Date.now(), products, docs, institutional };
    return this.#cache;
  }

  #resolveProduct(products: Product[], product?: string | null): string | null {
    if (!product) return null;
    const p = fold(product);
    const hit = products.find(x => [x.nombre_corto,x.modelo,x.nombre,x.producto_codigo].some(v => v && (p.includes(fold(v)) || fold(v).includes(p))));
    return hit?.producto_id ?? null;
  }

  async search(query: string, product?: string | null): Promise<RagEvidence[]> {
    const cache = await this.#load();
    const q = fold(query);
    const qTokens = tokens(query);
    const productId = this.#resolveProduct(cache.products, product);
    const sectionHint = SECTION_HINTS.find(([rx]) => rx.test(q))?.[1] ?? null;
    const policy = POLICY_HINT.test(q);
    const scored: Array<{ score: number; evidence: RagEvidence }> = [];

    for (const row of cache.docs) {
      if (productId && row.producto_id !== productId) continue;
      const meta = row.metadata ?? {};
      const hay = searchable([row.content, meta]);
      let score = qTokens.reduce((n, token) => n + (hay.includes(token) ? 2 : 0), 0);
      if (sectionHint && fold(String(meta.seccion ?? '')) === fold(sectionHint)) score += 18;
      if (productId && row.producto_id === productId) score += 8;
      const text = validText(row.content);
      if (text && score > 0) scored.push({ score, evidence: { text, source: `SUPABASE_DOCUMENTS:${String(meta.seccion ?? 'GENERAL')}`, score } });
    }

    for (const row of cache.institutional) {
      const hay = searchable([row.categoria,row.subcategoria,row.titulo,row.pregunta_canonica,row.preguntas_ejemplo,row.sinonimos,row.keywords,row.respuesta_base,row.content]);
      let score = qTokens.reduce((n, token) => n + (hay.includes(token) ? 3 : 0), 0);
      if (policy) score += 12;
      if (Number(row.prioridad ?? 0) > 0) score += Math.min(5, Number(row.prioridad) / 20);
      const text = validText(row.respuesta_base) || validText(row.content);
      if (text && score > 0 && row.afirmable !== false) scored.push({ score, evidence: { text, source: `SUPABASE_INSTITUCIONAL:${String(row.categoria ?? 'general')}`, score } });
    }

    return scored.sort((a,b) => b.score - a.score).slice(0, 4).map(x => x.evidence);
  }
}

type Options={url:string;serviceRoleKey:string;fetcher?:typeof fetch};

export class SupabaseAutomationMediaContext{
  readonly #url:string;readonly #key:string;readonly #fetcher:typeof fetch;
  constructor(options:Options){this.#url=options.url.replace(/\/$/,'');this.#key=options.serviceRoleKey;this.#fetcher=options.fetcher??fetch;}
  #headers(){return{apikey:this.#key,authorization:`Bearer ${this.#key}`};}
  async #rows(table:string,params:Record<string,string>):Promise<any[]>{
    const url=new URL(`${this.#url}/rest/v1/${table}`);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);
    const response=await this.#fetcher(url,{headers:this.#headers()});
    if(!response.ok)throw new Error(`AUTOMATION_MEDIA_CONTEXT_HTTP_${response.status}`);
    const value=await response.json().catch(()=>[]);return Array.isArray(value)?value:[];
  }
  async getAutomationProductReference(sessionId:string):Promise<{productId:string|null;productQuery:string|null}>{
    const [contexts,conversations]=await Promise.all([
      this.#rows('ia_contexto',{session_id:`eq.${sessionId}`,select:'producto_activo_id',limit:'1'}),
      this.#rows('ia_conversaciones',{session_id:`eq.${sessionId}`,select:'producto_id_resuelto,producto_detectado',order:'fecha.desc,id.desc',limit:'1'}),
    ]);
    const clean=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
    const productId=clean(contexts[0]?.producto_activo_id)??clean(conversations[0]?.producto_id_resuelto);
    const productQuery=clean(conversations[0]?.producto_detectado)??productId;
    return{productId,productQuery};
  }
}

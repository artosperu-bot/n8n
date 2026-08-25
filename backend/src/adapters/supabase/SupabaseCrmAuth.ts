import type { CrmActor, CrmAuthProvider } from '../../ports/Crm.ts';

type Options={url:string;serviceRoleKey:string;fetcher?:typeof fetch};

function bearer(value:string|undefined):string{
  const match=String(value??'').match(/^Bearer\s+(.+)$/i);
  if(!match?.[1])throw new Error('CRM_AUTH_REQUIRED');
  return match[1].trim();
}

export class SupabaseCrmAuth implements CrmAuthProvider{
  readonly #url:string;
  readonly #key:string;
  readonly #fetcher:typeof fetch;
  constructor(options:Options){this.#url=options.url.replace(/\/$/,'');this.#key=options.serviceRoleKey;this.#fetcher=options.fetcher??fetch;}
  #serviceHeaders(extra:Record<string,string>={}){return{apikey:this.#key,authorization:`Bearer ${this.#key}`,'content-type':'application/json',...extra};}
  async authenticate(authorization:string|undefined):Promise<CrmActor>{
    const token=bearer(authorization);
    const userResponse=await this.#fetcher(`${this.#url}/auth/v1/user`,{headers:{apikey:this.#key,authorization:`Bearer ${token}`}});
    if(!userResponse.ok)throw new Error('CRM_AUTH_INVALID');
    const user=await userResponse.json() as any;
    const userId=String(user?.id??'').trim();
    const email=String(user?.email??'').trim().toLowerCase();
    if(!userId||!email)throw new Error('CRM_AUTH_INVALID');

    const query=new URL(`${this.#url}/rest/v1/crm_usuarios`);
    query.searchParams.set('activo','eq.true');
    query.searchParams.set('select','id,user_id,email,nombre,rol,activo');
    query.searchParams.set('or',`(user_id.eq.${userId},email.eq.${email})`);
    query.searchParams.set('limit','1');
    const memberResponse=await this.#fetcher(query,{headers:this.#serviceHeaders()});
    if(!memberResponse.ok)throw new Error('CRM_ACCESS_DENIED');
    const rows=await memberResponse.json() as any[];
    const member=rows[0];
    if(!member?.id||member?.activo!==true)throw new Error('CRM_ACCESS_DENIED');
    return{id:String(member.id),userId,email,name:member.nombre?String(member.nombre):null,role:String(member.rol??'').toUpperCase()};
  }
}

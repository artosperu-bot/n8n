import type { CrmActor, CrmAuthProvider } from '../../ports/Crm.ts';
import { writeTrace } from '../../shared/trace.ts';

type Options={url:string;serviceRoleKey:string;authApiKey?:string;fetcher?:typeof fetch};

function bearer(value:string|undefined):string{
  const match=String(value??'').match(/^Bearer\s+(.+)$/i);
  if(!match?.[1])throw new Error('CRM_AUTH_REQUIRED');
  return match[1].trim();
}

function isJwt(value:string):boolean{return value.split('.').length===3;}

export class SupabaseCrmAuth implements CrmAuthProvider{
  readonly #url:string;
  readonly #serviceKey:string;
  readonly #authApiKey:string;
  readonly #fetcher:typeof fetch;
  constructor(options:Options){
    this.#url=options.url.replace(/\/$/,'');
    this.#serviceKey=options.serviceRoleKey;
    this.#authApiKey=options.authApiKey||options.serviceRoleKey;
    this.#fetcher=options.fetcher??fetch;
  }
  #serviceHeaders(extra:Record<string,string>={}){
    const headers:Record<string,string>={apikey:this.#serviceKey,'content-type':'application/json',...extra};
    if(isJwt(this.#serviceKey))headers.authorization=`Bearer ${this.#serviceKey}`;
    return headers;
  }
  async authenticate(authorization:string|undefined):Promise<CrmActor>{
    const raw=String(authorization??'');
    writeTrace({event:'CRM_AUTH',stage:'HEADER',authorizationPresent:Boolean(raw),bearerPrefix:/^Bearer\s+/i.test(raw)});

    let token:string;
    try{token=bearer(authorization);}catch(error){
      writeTrace({event:'CRM_AUTH',stage:'REJECTED',reason:'MISSING_OR_INVALID_BEARER'},'error');
      throw error;
    }
    writeTrace({event:'CRM_AUTH',stage:'BEARER_EXTRACTED',bearerExtracted:true,tokenLength:token.length,tokenLooksJwt:isJwt(token)});

    const userResponse=await this.#fetcher(`${this.#url}/auth/v1/user`,{headers:{apikey:this.#authApiKey,authorization:`Bearer ${token}`}});
    if(!userResponse.ok){
      writeTrace({event:'CRM_AUTH',stage:'AUTH_USER',authUserOk:false,httpStatus:userResponse.status,reason:'SUPABASE_AUTH_GET_USER_REJECTED'},'error');
      throw new Error('CRM_AUTH_INVALID');
    }
    const user=await userResponse.json() as any;
    const userId=String(user?.id??'').trim();
    const authEmail=String(user?.email??'').trim().toLowerCase();
    if(!userId){
      writeTrace({event:'CRM_AUTH',stage:'AUTH_USER',authUserOk:false,httpStatus:userResponse.status,reason:'AUTH_USER_ID_MISSING'},'error');
      throw new Error('CRM_AUTH_INVALID');
    }
    writeTrace({event:'CRM_AUTH',stage:'AUTH_USER',authUserOk:true,userId,hasEmail:Boolean(authEmail)});

    const query=new URL(`${this.#url}/rest/v1/crm_usuarios`);
    query.searchParams.set('activo','eq.true');
    query.searchParams.set('select','id,user_id,email,nombre,rol,activo');
    query.searchParams.set('user_id',`eq.${userId}`);
    query.searchParams.set('limit','1');
    const memberResponse=await this.#fetcher(query,{headers:this.#serviceHeaders()});
    if(!memberResponse.ok){
      writeTrace({event:'CRM_AUTH',stage:'CRM_MEMBER',memberFound:false,userId,httpStatus:memberResponse.status,reason:'CRM_MEMBER_QUERY_FAILED'},'error');
      throw new Error('CRM_ACCESS_DENIED');
    }
    const rows=await memberResponse.json() as any[];
    const member=rows[0];
    if(!member?.id||member?.activo!==true){
      writeTrace({event:'CRM_AUTH',stage:'CRM_MEMBER',memberFound:Boolean(member?.id),userId,activo:member?.activo===true,rol:member?.rol??null,reason:'CRM_MEMBER_NOT_ACTIVE'},'error');
      throw new Error('CRM_ACCESS_DENIED');
    }
    const email=authEmail||String(member.email??'').trim().toLowerCase();
    const role=String(member.rol??'').toUpperCase();
    writeTrace({event:'CRM_AUTH',stage:'AUTHORIZED',memberFound:true,userId,activo:true,rol:role});
    return{id:String(member.id),userId,email,name:member.nombre?String(member.nombre):null,role};
  }
}

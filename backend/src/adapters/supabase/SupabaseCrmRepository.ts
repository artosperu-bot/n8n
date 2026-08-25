import type { CrmActor, CrmAttentionMode, CrmListFilters, CrmRepository } from '../../ports/Crm.ts';

type Options={url:string;serviceRoleKey:string;fetcher?:typeof fetch};

function digits(value:unknown):string|null{const clean=String(value??'').replace(/\D/g,'');return clean||null;}
function row(value:any):any{return Array.isArray(value)?value[0]??null:value??null;}
function enrichWhatsappSession(session:any):any{
  const sessionId=String(session?.session_id??'');
  const isWhatsapp=sessionId.startsWith('whatsapp:');
  const derived=isWhatsapp?digits(sessionId.slice('whatsapp:'.length)):null;
  return{...session,...(isWhatsapp?{canal:'whatsapp'}:{}),cliente_telefono:digits(session?.cliente_telefono)??derived};
}

export class SupabaseCrmRepository implements CrmRepository{
  readonly #url:string;
  readonly #key:string;
  readonly #fetcher:typeof fetch;
  constructor(options:Options){this.#url=options.url.replace(/\/$/,'');this.#key=options.serviceRoleKey;this.#fetcher=options.fetcher??fetch;}
  #headers(extra:Record<string,string>={}){return{apikey:this.#key,authorization:`Bearer ${this.#key}`,'content-type':'application/json',...extra};}
  async #json(response:Response,label:string):Promise<any>{if(!response.ok)throw new Error(`${label} HTTP ${response.status}: ${(await response.text()).slice(0,240)}`);return response.status===204?null:response.json();}
  async #get(table:string,params:Record<string,string>,label:string):Promise<any[]>{
    const url=new URL(`${this.#url}/rest/v1/${table}`);for(const[k,v]of Object.entries(params))url.searchParams.set(k,v);
    const response=await this.#fetcher(url,{headers:this.#headers()});return await this.#json(response,label) as any[];
  }
  async #insert(table:string,payload:any,label:string):Promise<any>{
    const response=await this.#fetcher(`${this.#url}/rest/v1/${table}`,{method:'POST',headers:this.#headers({Prefer:'return=representation'}),body:JSON.stringify(payload)});
    if(response.status===409)return{duplicate:true};
    return this.#json(response,label);
  }
  async #ensureWhatsAppSession(sessionId:string):Promise<void>{
    const url=`${this.#url}/rest/v1/ia_sesiones?on_conflict=session_id`;
    const response=await this.#fetcher(url,{method:'POST',headers:this.#headers({Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify([{session_id:sessionId,canal:'whatsapp'}])});
    if(!response.ok)throw new Error(`CRM ensure WhatsApp session HTTP ${response.status}`);
  }
  async #markWhatsAppContext(sessionId:string):Promise<void>{
    const url=`${this.#url}/rest/v1/ia_contexto?session_id=eq.${encodeURIComponent(sessionId)}`;
    const response=await this.#fetcher(url,{method:'PATCH',headers:this.#headers({Prefer:'return=minimal'}),body:JSON.stringify({canal:'whatsapp'})});
    if(!response.ok)throw new Error(`CRM WhatsApp context channel HTTP ${response.status}`);
  }
  async #mode(sessionId:string):Promise<{mode:CrmAttentionMode;version:number|null}>{
    const rows=await this.#get('ia_sesiones',{session_id:`eq.${sessionId}`,select:'modo_atencion,version',limit:'1'},'CRM session mode');
    const current=rows[0];
    return{mode:String(current?.modo_atencion??'BOT').toUpperCase() as CrmAttentionMode,version:current?.version==null?null:Number(current.version)};
  }

  async listWhatsAppConversations(filters:CrmListFilters={}){
    const limit=Math.max(1,Math.min(Number(filters.limit??40)||40,100));
    const params:Record<string,string>={session_id:'ilike.whatsapp:*',select:'*',order:'ultimo_mensaje_at.desc.nullslast',limit:String(limit)};
    if(filters.mode)params.modo_atencion=`eq.${filters.mode}`;
    if(filters.search?.trim()){
      const term=filters.search.trim().replace(/[(),]/g,' ');
      params.or=`(session_id.ilike.*${term}*,cliente_nombre.ilike.*${term}*,cliente_telefono.ilike.*${term}*,ultimo_mensaje.ilike.*${term}*,producto_nombre.ilike.*${term}*)`;
    }
    const rows=await this.#get('crm_v_inbox',params,'CRM inbox');
    const sessions=rows.filter(session=>String(session?.session_id??'').startsWith('whatsapp:')).map(enrichWhatsappSession);
    const stats={bot:0,human:0,waiting:0,closed:0};
    for(const session of sessions){const mode=String(session.modo_atencion??'').toUpperCase();if(mode==='BOT')stats.bot+=1;else if(mode==='HUMANO')stats.human+=1;else if(mode==='ESPERANDO_ASESOR')stats.waiting+=1;else if(mode==='CERRADO')stats.closed+=1;}
    return{sessions,stats};
  }

  async getConversation(sessionId:string){
    const [sessions,messages,contexts,insights]=await Promise.all([
      this.#get('crm_v_inbox',{session_id:`eq.${sessionId}`,select:'*',limit:'1'},'CRM conversation'),
      this.#get('crm_mensajes',{session_id:`eq.${sessionId}`,select:'*',order:'fecha.asc,id.asc',limit:'400'},'CRM messages'),
      this.#get('ia_contexto',{session_id:`eq.${sessionId}`,select:'session_id,canal,ultima_intencion,ultima_accion,ultima_ruta,contexto,etapa_conversacion,producto_activo_id,actividad_activa,problema_activo,presupuesto_activo,cantidad_activa,objecion_activa,senal_compra,accion_pendiente,memoria_resumen',limit:'1'},'CRM context'),
      this.#get('ia_conversaciones',{session_id:`eq.${sessionId}`,select:'intencion,categoria,ruta,objetivo,producto_detectado,marca_detectada,presupuesto_detectado,etapa_comercial,nivel_interes,objecion_principal,estrategia_recomendada,siguiente_accion,producto_id_resuelto,atributo_detectado,actividad_detectada,problemas_detectados,implicaciones_detectadas,prioridades_detectadas,fecha',order:'fecha.desc,id.desc',limit:'1'},'CRM insight'),
    ]);
    const rawSession=sessions[0];if(!rawSession)throw new Error('CRM_SESSION_NOT_FOUND');
    const session=enrichWhatsappSession(rawSession);
    const recipient=digits(session.cliente_telefono)??(sessionId.startsWith('whatsapp:')?digits(sessionId.slice('whatsapp:'.length)):null);
    return{session,messages,context:contexts[0]??{},insight:insights[0]??{},recipient};
  }

  async getAttentionState(sessionId:string){return this.#mode(sessionId);}

  async changeMode(input:{sessionId:string;mode:CrmAttentionMode;version:number;actorId:string;reason?:string|null}){
    const response=await this.#fetcher(`${this.#url}/rest/v1/rpc/crm_cambiar_modo_atencion`,{method:'POST',headers:this.#headers(),body:JSON.stringify({p_session_id:input.sessionId,p_nuevo_modo:input.mode,p_actor_id:input.actorId,p_motivo:input.reason??null,p_version_esperada:input.version})});
    return row(await this.#json(response,'CRM change mode'));
  }

  async recordInbound(input:{sessionId:string;messageId:string;content:string;contactName?:string|null;waId:string}){
    await this.#ensureWhatsAppSession(input.sessionId);
    await this.#markWhatsAppContext(input.sessionId);
    const inserted=await this.#insert('crm_mensajes',[{session_id:input.sessionId,message_id:input.messageId,emisor:'CLIENTE',contenido:input.content,canal:'whatsapp',metadata:{source:'whatsapp_cloud_api',wa_id:input.waId,contact_name:input.contactName??null}}],'CRM inbound message');
    const current=await this.#mode(input.sessionId);
    return{...current,duplicate:Boolean(inserted?.duplicate)};
  }

  async markInboundAggregation(input:{sessionId:string;messageIds:string[];logicalMessageId:string;status:'AGGREGATED'|'REPROCESSED'|'SUPERSEDED'}):Promise<void>{
    const physicalMessageIds=[...new Set(input.messageIds.filter(Boolean))];
    for(const messageId of physicalMessageIds){
      const rows=await this.#get('crm_mensajes',{session_id:`eq.${input.sessionId}`,message_id:`eq.${messageId}`,select:'metadata',limit:'1'},'CRM inbound aggregation metadata');
      const metadata=rows[0]?.metadata&&typeof rows[0].metadata==='object'?rows[0].metadata:{};
      const url=new URL(`${this.#url}/rest/v1/crm_mensajes`);
      url.searchParams.set('session_id',`eq.${input.sessionId}`);url.searchParams.set('message_id',`eq.${messageId}`);
      const response=await this.#fetcher(url,{method:'PATCH',headers:this.#headers({Prefer:'return=minimal'}),body:JSON.stringify({metadata:{...metadata,logical_message_id:input.logicalMessageId,aggregation_status:input.status,physical_message_ids:physicalMessageIds,aggregation_updated_at:new Date().toISOString()}})});
      if(!response.ok)throw new Error(`CRM inbound aggregation metadata HTTP ${response.status}`);
    }
  }

  async recordBotMessage(input:{sessionId:string;messageId:string;content:string;waId:string}):Promise<void>{
    await this.#ensureWhatsAppSession(input.sessionId);
    await this.#markWhatsAppContext(input.sessionId);
    await this.#insert('crm_mensajes',[{session_id:input.sessionId,message_id:input.messageId,emisor:'BOT',contenido:input.content,canal:'whatsapp',metadata:{source:'stech_backend',wa_id:input.waId}}],'CRM bot message');
  }

  async recordAdvisorMessage(input:{sessionId:string;messageId:string;content:string;actor:CrmActor}):Promise<void>{
    await this.#ensureWhatsAppSession(input.sessionId);
    await this.#markWhatsAppContext(input.sessionId);
    await this.#insert('crm_mensajes',[{session_id:input.sessionId,message_id:input.messageId,emisor:'ASESOR',contenido:input.content,canal:'whatsapp',asesor_id:input.actor.id,metadata:{source:'stech_crm',actor_email:input.actor.email,actor_name:input.actor.name,actor_role:input.actor.role}}],'CRM advisor message');
  }
}

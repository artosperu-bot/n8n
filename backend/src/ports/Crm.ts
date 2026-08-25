export type CrmAttentionMode='BOT'|'ESPERANDO_ASESOR'|'HUMANO'|'CERRADO';

export type CrmActor={
  id:string;
  userId:string;
  email:string;
  name:string|null;
  role:string;
};

export interface CrmAuthProvider{
  authenticate(authorization:string|undefined):Promise<CrmActor>;
}

export type CrmListFilters={mode?:CrmAttentionMode|null;search?:string|null;limit?:number|null};
export type CrmConversationDetail={
  session:any;
  messages:any[];
  context:any;
  insight:any;
  recipient:string|null;
};

export interface CrmRepository{
  listWhatsAppConversations(filters:CrmListFilters):Promise<{sessions:any[];stats:{bot:number;human:number;waiting:number;closed:number}}>;
  getConversation(sessionId:string):Promise<CrmConversationDetail>;
  getAttentionState?(sessionId:string):Promise<{mode:CrmAttentionMode;version:number|null}>;
  changeMode(input:{sessionId:string;mode:CrmAttentionMode;version:number;actorId:string;reason?:string|null}):Promise<any>;
  recordInbound(input:{sessionId:string;messageId:string;content:string;contactName?:string|null;waId:string}):Promise<{mode:CrmAttentionMode;version:number|null;duplicate?:boolean}>;
  recordBotMessage(input:{sessionId:string;messageId:string;content:string;waId:string}):Promise<void>;
  recordAdvisorMessage(input:{sessionId:string;messageId:string;content:string;actor:CrmActor}):Promise<void>;
}

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import { buildRuntime } from './bootstrap.ts';
import { parseWhatsAppWebhook, verifyWhatsAppWebhook } from './adapters/whatsapp/WhatsAppWebhookAdapter.ts';
import type { WhatsAppCloudApiClient } from './adapters/whatsapp/WhatsAppCloudApiClient.ts';
import type { WhatsAppInboundProcessor } from './adapters/whatsapp/WhatsAppInboundProcessor.ts';
import type { CrmActor, CrmAttentionMode, CrmAuthProvider, CrmRepository } from './ports/Crm.ts';
import type { AutomationRepository } from './automation/types.ts';
import { writeTrace } from './shared/trace.ts';
import { sanitizeHttpErrorMessage } from './shared/httpErrorSanitizer.ts';

type EnvLike = Record<string,string|undefined>;
type WorkerLifecycle={start():void;stop():void};
type AppOptions={env?:EnvLike;crmAuth?:CrmAuthProvider|null;crm?:CrmRepository|null;whatsapp?:WhatsAppCloudApiClient|null;whatsappInbound?:WhatsAppInboundProcessor|null;automationRepository?:AutomationRepository|null;automationWorker?:WorkerLifecycle|null};

async function readJson(req: IncomingMessage): Promise<any> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function send(res: ServerResponse, status: number, body: unknown) { const data = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) }); res.end(data); }
function sendText(res: ServerResponse,status:number,body:string){const data=String(body);res.writeHead(status,{'content-type':'text/plain; charset=utf-8','content-length':Buffer.byteLength(data)});res.end(data);}
function sendEmpty(res:ServerResponse,status:number){res.statusCode=status;res.end();}
function runtimeBuildId():string { try { return execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()||'unknown'; } catch { return process.env.STECH_BUILD_ID??'unknown'; } }
function number(value:unknown):number|null{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=0?parsed:null;}
function publicError(error:unknown):{status:number;code:string}{
  const raw=sanitizeHttpErrorMessage(error instanceof Error?error.message:String(error));
  if(error instanceof SyntaxError)return{status:400,code:'INVALID_JSON'};
  if(/CRM_AUTH_REQUIRED|CRM_AUTH_INVALID/.test(raw))return{status:401,code:'CRM_UNAUTHORIZED'};
  if(/CRM_ACCESS_DENIED/.test(raw))return{status:403,code:'CRM_FORBIDDEN'};
  if(/CRM_SESSION_NOT_FOUND|SESSION_NOT_FOUND/.test(raw))return{status:404,code:'SESSION_NOT_FOUND'};
  if(/AUTOMATION_RULE_NOT_FOUND/.test(raw))return{status:404,code:'AUTOMATION_RULE_NOT_FOUND'};
  if(/SESSION_CLOSED/.test(raw))return{status:409,code:'SESSION_CLOSED'};
  if(/40001|modificada por otro proceso|version/i.test(raw))return{status:409,code:'VERSION_CONFLICT'};
  if(/CRM_NOT_CONFIGURED|WHATSAPP_NOT_CONFIGURED|AUTOMATION_NOT_CONFIGURED/.test(raw))return{status:503,code:raw.includes('WHATSAPP')?'WHATSAPP_NOT_CONFIGURED':raw.includes('AUTOMATION')?'AUTOMATION_NOT_CONFIGURED':'CRM_NOT_CONFIGURED'};
  if(/required|obligatorio|INVALID_|is required/i.test(raw))return{status:400,code:'INVALID_REQUEST'};
  return{status:500,code:'INTERNAL_ERROR'};
}
function applyCors(req:IncomingMessage,res:ServerResponse,allowedOrigins:string[]):boolean{
  const origin=String(req.headers.origin??'');
  const allowed=Boolean(origin&&allowedOrigins.includes(origin));
  if(allowed){
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers','Content-Type, Authorization');
    res.setHeader('access-control-max-age','600');
  }
  return allowed;
}
function validMode(value:string|null):CrmAttentionMode|null{const mode=String(value??'').toUpperCase();return['BOT','ESPERANDO_ASESOR','HUMANO','CERRADO'].includes(mode)?mode as CrmAttentionMode:null;}
function whatsappPayloadSummary(body:any,parsed:{messages:any[];statuses:any[];changeCount:number}){
  const entries=Array.isArray(body?.entry)?body.entry:[];
  const changes=entries.flatMap((entry:any)=>Array.isArray(entry?.changes)?entry.changes:[]);
  const fields=[...new Set(changes.map((change:any)=>typeof change?.field==='string'?change.field:null).filter(Boolean))];
  const hasMessages=changes.some((change:any)=>Array.isArray(change?.value?.messages)&&change.value.messages.length>0);
  const hasStatuses=changes.some((change:any)=>Array.isArray(change?.value?.statuses)&&change.value.statuses.length>0);
  return{
    object:typeof body?.object==='string'?body.object:null,
    entryCount:entries.length,
    changeCount:parsed.changeCount,
    fields,
    hasMessages,
    hasStatuses,
    parsedMessages:parsed.messages.length,
    parsedStatuses:parsed.statuses.length,
  };
}

export function createStechApp(options:AppOptions = {}) {
  const runtime = buildRuntime(options.env ?? process.env);
  const buildId=runtimeBuildId();
  const crmAuth=options.crmAuth===undefined?runtime.crmAuth:options.crmAuth;
  const crm=options.crm===undefined?runtime.crm:options.crm;
  const whatsapp=options.whatsapp===undefined?runtime.whatsapp:options.whatsapp;
  const whatsappInbound=options.whatsappInbound===undefined?runtime.whatsappInbound:options.whatsappInbound;
  const automationRepository=options.automationRepository===undefined?runtime.crmAutomationRepository:options.automationRepository;
  const automationWorker=options.automationWorker===undefined?runtime.crmAutomationWorker:options.automationWorker;

  async function actor(req:IncomingMessage):Promise<CrmActor>{if(!crmAuth)throw new Error('CRM_NOT_CONFIGURED');return crmAuth.authenticate(req.headers.authorization);}
  function requireCrm():CrmRepository{if(!crm)throw new Error('CRM_NOT_CONFIGURED');return crm;}
  function requireAutomation():AutomationRepository{if(!automationRepository)throw new Error('AUTOMATION_NOT_CONFIGURED');return automationRepository;}
  function requireAdmin(who:CrmActor):void{if(String(who.role??'').toUpperCase()!=='ADMIN')throw new Error('CRM_ACCESS_DENIED');}
  async function requireAutomationSessionAccess(who:CrmActor,sessionId:string):Promise<void>{
    if(String(who.role??'').toUpperCase()==='ADMIN')return;
    const detail=await requireCrm().getConversation(sessionId);
    if(String(detail.session?.asesor_id??'')!==who.userId)throw new Error('CRM_ACCESS_DENIED');
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if(req.method==='POST'&&url.pathname.toLowerCase().includes('whatsapp')){
        writeTrace({
          event:'[WHATSAPP][HTTP_IN]',
          method:req.method,
          url:url.pathname,
          routeMatched:url.pathname==='/webhooks/whatsapp',
          contentType:req.headers['content-type']??null,
          userAgent:req.headers['user-agent']??null,
          contentLength:req.headers['content-length']??null,
          timestamp:new Date().toISOString(),
        });
      }
      applyCors(req,res,runtime.config.crmAllowedOrigins);
      if(req.method==='OPTIONS'&&url.pathname.startsWith('/api/'))return sendEmpty(res,204);

      if (url.pathname === '/webhooks/whatsapp' && req.method === 'GET') {
        const verification=verifyWhatsAppWebhook(url.searchParams,runtime.config.whatsappVerifyToken);
        if(!verification.ok){writeTrace({event:'WHATSAPP_VERIFY',status:'REJECTED'});return sendText(res,403,'Forbidden');}
        writeTrace({event:'WHATSAPP_VERIFY',status:'VERIFIED'});
        return sendText(res,200,verification.challenge??'');
      }
      if (url.pathname === '/webhooks/whatsapp' && req.method === 'POST') {
        let body:any;
        try{body=await readJson(req);}catch(error){
          writeTrace({event:'[WHATSAPP][BODY_ERROR]',stage:'READ_JSON',status:400,error:error instanceof SyntaxError?'INVALID_JSON':'BODY_READ_ERROR',timestamp:new Date().toISOString()},'error');
          return send(res,400,{error:'INVALID_JSON'});
        }
        let parsed;
        try{parsed=parseWhatsAppWebhook(body);}catch(error){
          writeTrace({event:'[WHATSAPP][BODY_ERROR]',stage:'WEBHOOK_PARSER',status:400,error:'PARSER_ERROR',timestamp:new Date().toISOString()},'error');
          return send(res,400,{error:'INVALID_WEBHOOK_PAYLOAD'});
        }
        writeTrace({event:'[WHATSAPP][PAYLOAD_ACCEPTED]',...whatsappPayloadSummary(body,parsed),timestamp:new Date().toISOString()});
        send(res,200,{received:true});
        queueMicrotask(()=>{
          if(parsed.messages.length)writeTrace({event:'WHATSAPP_INBOUND',count:parsed.messages.length,types:[...new Set(parsed.messages.map(message=>message.type))]});
          if(parsed.statuses.length)writeTrace({event:'WHATSAPP_STATUS',count:parsed.statuses.length,statuses:[...new Set(parsed.statuses.map(status=>status.status))]});
          if(whatsappInbound)void whatsappInbound.process(parsed).catch(error=>writeTrace({event:'WHATSAPP_ERROR',stage:'POST_ACK_DISPATCH',error:error instanceof Error?error.message:String(error)},'error'));
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', service: 'stech-backend', buildId, modes: { llm: runtime.config.llmMode, erp: runtime.config.erpMode, persistence: runtime.config.persistenceMode, n8n: runtime.config.automationMode, crmAutomation:Boolean(automationWorker), build:buildId } });
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await readJson(req); const result = await runtime.engine.processTurn({ sessionId: String(body.sessionId ?? ''), message: String(body.message ?? ''), messageId: body.messageId ? String(body.messageId) : undefined }); return send(res, 200, result);
      }

      if(req.method==='GET'&&url.pathname==='/api/automations/rules'){
        await actor(req);return send(res,200,{rules:await requireAutomation().listRules()});
      }
      if(req.method==='POST'&&url.pathname==='/api/automations/rules'){
        const who=await actor(req);requireAdmin(who);const body=await readJson(req);
        const name=String(body.name??'').trim();const messageTemplate=String(body.messageTemplate??'').trim();const delaySeconds=number(body.delaySeconds);const priority=body.priority==null?100:number(body.priority);
        if(!name||!messageTemplate||delaySeconds===null||priority===null)throw new Error('INVALID_AUTOMATION_RULE');
        const rule=await requireAutomation().createRule({name,eventType:'BOT_MESSAGE_SENT',delaySeconds,actionType:'SEND_TEXT',messageTemplate,active:body.active!==false,priority});
        return send(res,201,{rule});
      }
      const automationRuleEdit=url.pathname.match(/^\/api\/automations\/rules\/([^/]+)$/);
      if(automationRuleEdit&&req.method==='PATCH'){
        const who=await actor(req);requireAdmin(who);const body=await readJson(req);const id=decodeURIComponent(automationRuleEdit[1]);
        const name=String(body.name??'').trim();const messageTemplate=String(body.messageTemplate??'').trim();const delaySeconds=number(body.delaySeconds);const priority=body.priority==null?100:number(body.priority);
        if(!name||!messageTemplate||delaySeconds===null||priority===null)throw new Error('INVALID_AUTOMATION_RULE');
        return send(res,200,{rule:await requireAutomation().updateRule(id,{name,delaySeconds,messageTemplate,priority})});
      }
      const automationRuleToggle=url.pathname.match(/^\/api\/automations\/rules\/([^/]+)\/(enable|disable)$/);
      if(automationRuleToggle&&req.method==='POST'){
        const who=await actor(req);requireAdmin(who);const id=decodeURIComponent(automationRuleToggle[1]);const active=automationRuleToggle[2]==='enable';
        return send(res,200,{rule:await requireAutomation().setRuleActive(id,active)});
      }
      if(req.method==='GET'&&url.pathname==='/api/automations/jobs'){
        const who=await actor(req);const sessionId=url.searchParams.get('sessionId');
        if(sessionId)await requireAutomationSessionAccess(who,sessionId);
        else requireAdmin(who);
        return send(res,200,{jobs:await requireAutomation().listJobs({sessionId,limit:number(url.searchParams.get('limit'))})});
      }
      if(req.method==='POST'&&url.pathname==='/api/automations/cancel'){
        const who=await actor(req);const body=await readJson(req);const sessionId=String(body.sessionId??'').trim();if(!sessionId)throw new Error('SESSION_ID_REQUIRED');
        await requireAutomationSessionAccess(who,sessionId);
        const cancelled=await requireAutomation().cancelPending(sessionId,String(body.reason??'MANUAL_CANCEL'));
        return send(res,200,{cancelled,sessionId});
      }

      if(req.method==='GET'&&url.pathname==='/api/whatsapp/status'){
        await actor(req);
        if(!whatsapp)return send(res,200,{configured:false,reachable:false});
        try{return send(res,200,await whatsapp.getStatus());}catch{return send(res,200,{configured:true,reachable:false,error:'GRAPH_UNREACHABLE'});}
      }
      if(req.method==='GET'&&url.pathname==='/api/whatsapp/conversations'){
        await actor(req);const repository=requireCrm();
        const requestedMode=url.searchParams.get('mode');const mode=requestedMode?validMode(requestedMode):null;
        if(requestedMode&&!mode)throw new Error('INVALID_MODE');
        return send(res,200,await repository.listWhatsAppConversations({mode,search:url.searchParams.get('search'),limit:number(url.searchParams.get('limit'))}));
      }

      const crmMatch=url.pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)$/);
      if(crmMatch&&req.method==='GET'){
        await actor(req);const id=decodeURIComponent(crmMatch[1]);return send(res,200,await requireCrm().getConversation(id));
      }
      const crmMessagesMatch=url.pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/messages$/);
      if(crmMessagesMatch&&req.method==='GET'){
        await actor(req);const id=decodeURIComponent(crmMessagesMatch[1]);const detail=await requireCrm().getConversation(id);return send(res,200,{session:detail.session,messages:detail.messages});
      }
      const takeMatch=url.pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/take$/);
      if(takeMatch&&req.method==='POST'){
        const who=await actor(req);const body=await readJson(req);const version=number(body.version);if(version===null)throw new Error('VERSION_REQUIRED');
        const id=decodeURIComponent(takeMatch[1]);return send(res,200,await requireCrm().changeMode({sessionId:id,mode:'HUMANO',version,actorId:who.userId,reason:String(body.reason??'Tomada desde CRM')}));
      }
      const returnBotMatch=url.pathname.match(/^\/api\/whatsapp\/conversations\/([^/]+)\/return-bot$/);
      if(returnBotMatch&&req.method==='POST'){
        const who=await actor(req);const body=await readJson(req);const version=number(body.version);if(version===null)throw new Error('VERSION_REQUIRED');
        const id=decodeURIComponent(returnBotMatch[1]);return send(res,200,await requireCrm().changeMode({sessionId:id,mode:'BOT',version,actorId:who.userId,reason:String(body.reason??'Devuelta a BOT desde CRM')}));
      }
      if(crmMessagesMatch&&req.method==='POST'){
        const who=await actor(req);const repository=requireCrm();const body=await readJson(req);const version=number(body.version);const content=String(body.content??'').trim();
        if(version===null||!content)throw new Error('MESSAGE_AND_VERSION_REQUIRED');if(!whatsapp)throw new Error('WHATSAPP_NOT_CONFIGURED');
        const id=decodeURIComponent(crmMessagesMatch[1]);const detail=await repository.getConversation(id);if(!detail.recipient)throw new Error('WHATSAPP_RECIPIENT_REQUIRED');
        if(String(detail.session?.modo_atencion??'').toUpperCase()==='CERRADO')throw new Error('SESSION_CLOSED');
        const mode=await repository.changeMode({sessionId:id,mode:'HUMANO',version,actorId:who.userId,reason:'Mensaje enviado por asesor desde CRM'});
        const sent=await whatsapp.sendText(detail.recipient,content);if(!sent.messageId)throw new Error('WHATSAPP_MESSAGE_ID_REQUIRED');
        await repository.recordAdvisorMessage({sessionId:id,messageId:sent.messageId,content,actor:who});
        return send(res,200,{messageId:sent.messageId,modo_atencion:mode?.modo_atencion??'HUMANO',version:mode?.version??null});
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && req.method === 'GET') { const id = decodeURIComponent(sessionMatch[1]); return send(res, 200, { sessionId: id, state: await runtime.conversations.getState(id), messages: await runtime.conversations.getMessages(id) }); }
      if (sessionMatch && req.method === 'DELETE') { const id = decodeURIComponent(sessionMatch[1]); await runtime.conversations.reset(id); return send(res, 200, { ok: true, sessionId: id }); }
      return send(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const safe=publicError(error);writeTrace({event:'STECH_HTTP_ERROR',status:safe.status,code:safe.code},'error');return send(res,safe.status,{error:safe.code});
    }
  });
  return {
    listen(port: number, host: string) { return new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject);automationWorker?.start();resolve(); }); }); },
    close() { automationWorker?.stop();if(!server.listening)return Promise.resolve();return new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); },
    address: () => server.address(),
    runtime,
    server
  };
}
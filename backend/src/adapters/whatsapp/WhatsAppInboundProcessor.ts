import type { CrmRepository } from '../../ports/Crm.ts';
import type { AutomationScheduler } from '../../automation/AutomationScheduler.ts';
import type { WhatsAppInboundMessage, WhatsAppWebhookParseResult } from './WhatsAppWebhookAdapter.ts';
import { writeTrace } from '../../shared/trace.ts';
import { WhatsAppTurnAggregator, type WhatsAppLogicalBatch } from './WhatsAppTurnAggregator.ts';

type EngineLike={processTurn(input:{sessionId:string;message:string;messageId?:string}):Promise<{answer:string;state?:{blockAutomaticReply?:boolean;handoffActive?:boolean}}>};
type WhatsAppSender={sendText(to:string,text:string):Promise<{messageId:string|null}>};

type ProcessResult={processed:boolean;duplicate?:boolean;suppressed?:boolean};
type AutomationSchedulerLike=Pick<AutomationScheduler,'onCustomerMessage'|'onBotMessage'>;
type Options={crm:CrmRepository;engine:EngineLike;whatsapp:WhatsAppSender|null;automationScheduler?:AutomationSchedulerLike|null;burstWindowMs?:number;persistenceRetryAttempts?:number;retryBaseDelayMs?:number;sleeper?:(ms:number)=>Promise<void>};

function duplicateError(error:unknown):boolean{
  const value=error instanceof Error?error.message:String(error);
  return /ALREADY_DONE|ALREADY_PROCESSING|turn acquire rejected/i.test(value);
}
function providerTimestampIso(value:string|null):string|null{
  const raw=String(value??'').trim();if(!raw)return null;
  const numeric=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
  const date=Number.isFinite(numeric)?new Date(numeric*1000):new Date(raw);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

export class WhatsAppInboundProcessor{
  readonly #crm:CrmRepository;
  readonly #engine:EngineLike;
  readonly #whatsapp:WhatsAppSender|null;
  readonly #automationScheduler:AutomationSchedulerLike|null;
  readonly #aggregator:WhatsAppTurnAggregator<WhatsAppInboundMessage,ProcessResult>;
  readonly #persistenceRetryAttempts:number;
  readonly #retryBaseDelayMs:number;
  readonly #sleeper:(ms:number)=>Promise<void>;
  readonly #duplicateInboundIds=new Set<string>();
  constructor(options:Options){
    this.#crm=options.crm;this.#engine=options.engine;this.#whatsapp=options.whatsapp;this.#automationScheduler=options.automationScheduler??null;
    this.#persistenceRetryAttempts=Math.max(1,Math.min(5,Math.floor(options.persistenceRetryAttempts??3)));
    this.#retryBaseDelayMs=Math.max(0,Math.min(5000,Math.floor(options.retryBaseDelayMs??100)));
    this.#sleeper=options.sleeper??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    this.#aggregator=new WhatsAppTurnAggregator({
      windowMs:options.burstWindowMs,
      idOf:message=>message.waMessageId,
      execute:batch=>this.#processLogicalBatch(batch),
    });
  }

  async #recordBotWithRetry(input:{sessionId:string;messageId:string;content:string;waId:string}):Promise<void>{
    let lastError:unknown=null;
    for(let attempt=1;attempt<=this.#persistenceRetryAttempts;attempt+=1){
      try{await this.#crm.recordBotMessage(input);return;}catch(error){lastError=error;if(attempt<this.#persistenceRetryAttempts)await this.#sleeper(this.#retryBaseDelayMs*(2**(attempt-1)));}
    }
    throw lastError instanceof Error?lastError:new Error('WHATSAPP_BOT_PERSISTENCE_FAILED');
  }

  async #auditAggregation(input:{sessionId:string;messageIds:string[];logicalMessageId:string;status:'AGGREGATED'|'REPROCESSED'|'SUPERSEDED'}):Promise<void>{
    if(!this.#crm.markInboundAggregation)return;
    for(let attempt=1;attempt<=this.#persistenceRetryAttempts;attempt+=1){
      try{await this.#crm.markInboundAggregation(input);return;}catch(error){
        if(attempt<this.#persistenceRetryAttempts){await this.#sleeper(this.#retryBaseDelayMs*(2**(attempt-1)));continue;}
        writeTrace({event:'WHATSAPP_ERROR',stage:'AGGREGATION_AUDIT',status:input.status,error:error instanceof Error?error.message:String(error)},'error');
      }
    }
  }

  async processMessage(message:WhatsAppInboundMessage):Promise<ProcessResult>{
    if(message.type!=='text'||!message.text)return{processed:false};
    const sessionId=`whatsapp:${message.waId}`;
    const sourceSentAt=providerTimestampIso(message.timestamp);
    const inbound=await this.#crm.recordInbound({sessionId,messageId:message.waMessageId,content:message.text,contactName:message.contactName,waId:message.waId,sourceSentAt});
    if(inbound.duplicate){this.#duplicateInboundIds.add(message.waMessageId);writeTrace({event:'WHATSAPP_DUPLICATE',stage:'CRM_INBOUND_CONTINUE_TO_ENGINE'});}
    if(this.#automationScheduler){
      try{
        await this.#automationScheduler.onCustomerMessage({sessionId,messageId:message.waMessageId,recipient:message.waId,sourceSentAt,duplicate:Boolean(inbound.duplicate),attentionMode:inbound.mode});
      }catch(error){
        writeTrace({event:'WHATSAPP_AUTOMATION_ERROR',stage:'CANCEL_AFTER_CUSTOMER_INBOUND',error:error instanceof Error?error.message:String(error)},'error');
      }
    }
    if(inbound.mode!=='BOT'){
      this.#duplicateInboundIds.delete(message.waMessageId);
      writeTrace({event:'WHATSAPP_INBOUND',status:'STORED_NO_BOT',attentionMode:inbound.mode});
      return{processed:false,suppressed:true};
    }
    return this.#aggregator.enqueue(sessionId,message);
  }

  async #processLogicalBatch(batch:WhatsAppLogicalBatch<WhatsAppInboundMessage>):Promise<ProcessResult|{superseded:true}>{
    const messages=batch.values;const latest=messages.at(-1)!;const content=messages.map(message=>message.text?.trim()).filter(Boolean).join('\n');
    const suppressAutomation=messages.some(message=>this.#duplicateInboundIds.has(message.waMessageId));
    for(const message of messages)this.#duplicateInboundIds.delete(message.waMessageId);
    await this.#auditAggregation({sessionId:batch.sessionId,messageIds:batch.physicalMessageIds,logicalMessageId:batch.logicalMessageId,status:batch.status});
    writeTrace({event:'WHATSAPP_AGGREGATION',status:batch.status,physicalCount:messages.length,logicalMessageId:batch.logicalMessageId});
    let result:any;
    try{result=await this.#engine.processTurn({sessionId:batch.sessionId,message:content,messageId:batch.logicalMessageId});}
    catch(error){if(duplicateError(error)){writeTrace({event:'WHATSAPP_DUPLICATE',stage:'ENGINE'});return{processed:false,duplicate:true};}throw error;}
    if(batch.hasNewer()){
      await this.#auditAggregation({sessionId:batch.sessionId,messageIds:batch.physicalMessageIds,logicalMessageId:batch.logicalMessageId,status:'SUPERSEDED'});
      writeTrace({event:'WHATSAPP_AGGREGATION',status:'SUPERSEDED',physicalCount:messages.length,logicalMessageId:batch.logicalMessageId});
      return{superseded:true};
    }
    if(result?.state?.blockAutomaticReply||result?.state?.handoffActive)return{processed:true,suppressed:true};
    if(this.#crm.getAttentionState){
      const attention=await this.#crm.getAttentionState(batch.sessionId);
      if(attention.mode!=='BOT'){
        writeTrace({event:'WHATSAPP_INBOUND',status:'BOT_REPLY_CANCELLED_AFTER_TAKEOVER',attentionMode:attention.mode});
        return{processed:true,suppressed:true};
      }
    }
    if(batch.hasNewer())return{superseded:true};
    const answer=String(result?.answer??'').trim();
    if(!answer||!this.#whatsapp){writeTrace({event:'WHATSAPP_ERROR',stage:'OUTBOUND_NOT_CONFIGURED'});return{processed:true,suppressed:true};}
    const sent=await this.#whatsapp.sendText(latest.waId,answer);
    if(!sent.messageId)throw new Error('WHATSAPP_MESSAGE_ID_REQUIRED');
    await this.#recordBotWithRetry({sessionId:batch.sessionId,messageId:sent.messageId,content:answer,waId:latest.waId});
    if(this.#automationScheduler&&!suppressAutomation){
      try{
        await this.#automationScheduler.onBotMessage({sessionId:batch.sessionId,customerMessageId:latest.waMessageId,recipient:latest.waId,botSentAt:new Date().toISOString(),attentionMode:'BOT'});
      }catch(error){
        writeTrace({event:'WHATSAPP_AUTOMATION_ERROR',stage:'SCHEDULE_AFTER_BOT_REPLY',error:error instanceof Error?error.message:String(error)},'error');
      }
    }
    return{processed:true};
  }

  async process(parsed:WhatsAppWebhookParseResult):Promise<void>{
    await Promise.all(parsed.messages.map(async message=>{try{await this.processMessage(message);}catch(error){writeTrace({event:'WHATSAPP_ERROR',stage:'INBOUND_PROCESS',error:error instanceof Error?error.message:String(error)},'error');}}));
  }
}

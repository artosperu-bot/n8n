import type { CrmRepository } from '../../ports/Crm.ts';
import type { WhatsAppInboundMessage, WhatsAppWebhookParseResult } from './WhatsAppWebhookAdapter.ts';
import { writeTrace } from '../../shared/trace.ts';

type EngineLike={processTurn(input:{sessionId:string;message:string;messageId?:string}):Promise<{answer:string;state?:{blockAutomaticReply?:boolean;handoffActive?:boolean}}>};
type WhatsAppSender={sendText(to:string,text:string):Promise<{messageId:string|null}>};

type Options={crm:CrmRepository;engine:EngineLike;whatsapp:WhatsAppSender|null};

function duplicateError(error:unknown):boolean{
  const value=error instanceof Error?error.message:String(error);
  return /ALREADY_DONE|ALREADY_PROCESSING|turn acquire rejected/i.test(value);
}

export class WhatsAppInboundProcessor{
  readonly #crm:CrmRepository;
  readonly #engine:EngineLike;
  readonly #whatsapp:WhatsAppSender|null;
  constructor(options:Options){this.#crm=options.crm;this.#engine=options.engine;this.#whatsapp=options.whatsapp;}

  async processMessage(message:WhatsAppInboundMessage):Promise<{processed:boolean;duplicate?:boolean;suppressed?:boolean}>{
    if(message.type!=='text'||!message.text)return{processed:false};
    const sessionId=`whatsapp:${message.waId}`;
    const inbound=await this.#crm.recordInbound({sessionId,messageId:message.waMessageId,content:message.text,contactName:message.contactName,waId:message.waId});
    if(inbound.duplicate)writeTrace({event:'WHATSAPP_DUPLICATE',stage:'CRM_INBOUND_CONTINUE_TO_ENGINE'});
    if(inbound.mode!=='BOT'){
      writeTrace({event:'WHATSAPP_INBOUND',status:'STORED_NO_BOT',attentionMode:inbound.mode});
      return{processed:false,suppressed:true};
    }
    let result:any;
    try{result=await this.#engine.processTurn({sessionId,message:message.text,messageId:message.waMessageId});}
    catch(error){if(duplicateError(error)){writeTrace({event:'WHATSAPP_DUPLICATE',stage:'ENGINE'});return{processed:false,duplicate:true};}throw error;}
    if(result?.state?.blockAutomaticReply||result?.state?.handoffActive)return{processed:true,suppressed:true};
    const answer=String(result?.answer??'').trim();
    if(!answer||!this.#whatsapp){writeTrace({event:'WHATSAPP_ERROR',stage:'OUTBOUND_NOT_CONFIGURED'});return{processed:true,suppressed:true};}
    const sent=await this.#whatsapp.sendText(message.waId,answer);
    if(sent.messageId)await this.#crm.recordBotMessage({sessionId,messageId:sent.messageId,content:answer,waId:message.waId});
    return{processed:true};
  }

  async process(parsed:WhatsAppWebhookParseResult):Promise<void>{
    for(const message of parsed.messages){
      try{await this.processMessage(message);}catch(error){writeTrace({event:'WHATSAPP_ERROR',stage:'INBOUND_PROCESS',error:error instanceof Error?error.message:String(error)},'error');}
    }
  }
}

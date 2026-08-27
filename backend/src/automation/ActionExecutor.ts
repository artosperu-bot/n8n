import type { AutomationActionType, AutomationSender } from './types.ts';

export type AutomationActionResult =
  | {outcome: 'SENT'; providerMessageId: string; reason: null; fallbackToText?:boolean; imageError?:string|null}
  | {outcome: 'FAILED' | 'AMBIGUOUS'; providerMessageId: null; reason: string; fallbackToText?:boolean; imageError?:string|null};

function compactReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'AUTOMATION_SEND_FAILED';
}

function ambiguous(reason:string):boolean{return /WHATSAPP_AMBIGUOUS_SEND/i.test(reason);}

export class ActionExecutor {
  readonly #sender: AutomationSender;

  constructor(sender: AutomationSender) {
    this.#sender = sender;
  }

  async sendText(recipient: string, content: string): Promise<AutomationActionResult> {
    try {
      const sent = await this.#sender.sendTextOnce(recipient, content);
      if (!sent.messageId) return {outcome: 'FAILED', providerMessageId: null, reason: 'WHATSAPP_MESSAGE_ID_REQUIRED'};
      return {outcome: 'SENT', providerMessageId: sent.messageId, reason: null};
    } catch (error) {
      const reason = compactReason(error);
      if (ambiguous(reason)) return {outcome: 'AMBIGUOUS', providerMessageId: null, reason: 'WHATSAPP_AMBIGUOUS_SEND'};
      return {outcome: 'FAILED', providerMessageId: null, reason};
    }
  }

  async execute(input:{recipient:string;content:string;actionType:AutomationActionType;mediaUrl:string|null}):Promise<AutomationActionResult>{
    const wantsImage=input.actionType!=='SEND_TEXT';
    if(!wantsImage||!input.mediaUrl||!this.#sender.sendImageWithCaptionOnce){
      const text=await this.sendText(input.recipient,input.content);
      return wantsImage&&text.outcome==='SENT'?{...text,fallbackToText:true,imageError:input.mediaUrl?'IMAGE_SENDER_UNAVAILABLE':'IMAGE_NOT_RESOLVED'}:text;
    }
    try{
      const sent=await this.#sender.sendImageWithCaptionOnce(input.recipient,input.mediaUrl,input.content);
      if(!sent.messageId)return{outcome:'FAILED',providerMessageId:null,reason:'WHATSAPP_MESSAGE_ID_REQUIRED'};
      return{outcome:'SENT',providerMessageId:sent.messageId,reason:null,fallbackToText:false,imageError:null};
    }catch(error){
      const imageError=compactReason(error);
      if(ambiguous(imageError))return{outcome:'AMBIGUOUS',providerMessageId:null,reason:'WHATSAPP_AMBIGUOUS_SEND',fallbackToText:false,imageError};
      const fallback=await this.sendText(input.recipient,input.content);
      if(fallback.outcome==='SENT')return{...fallback,fallbackToText:true,imageError};
      return{...fallback,fallbackToText:true,imageError};
    }
  }
}

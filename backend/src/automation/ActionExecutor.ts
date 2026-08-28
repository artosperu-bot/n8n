import type { AutomationActionType, AutomationSender } from './types.ts';

export type AutomationActionResult =
  | {outcome: 'SENT'; providerMessageId: string; reason: null; fallbackToText?:boolean; imageError?:string|null;providerMessageIds?:string[];mediaSentCount?:number;sentMediaUrls?:string[];warning?:string|null}
  | {outcome: 'FAILED' | 'AMBIGUOUS'; providerMessageId: null; reason: string; fallbackToText?:boolean; imageError?:string|null;providerMessageIds?:string[];mediaSentCount?:number;sentMediaUrls?:string[];warning?:string|null};

function compactReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'AUTOMATION_SEND_FAILED';
}

function ambiguous(reason:string):boolean{return /WHATSAPP_AMBIGUOUS_SEND/i.test(reason);}
function uniqueMedia(mediaUrls:string[]|undefined,mediaUrl:string|null):string[]{
  const seen=new Set<string>();const out:string[]=[];
  for(const value of [...(mediaUrls??[]),...(mediaUrl?[mediaUrl]:[])]){const url=String(value??'').trim();if(!url||seen.has(url))continue;seen.add(url);out.push(url);}
  return out.slice(0,20);
}

export class ActionExecutor {
  readonly #sender: AutomationSender;

  constructor(sender: AutomationSender) {
    this.#sender = sender;
  }

  async sendText(recipient: string, content: string): Promise<AutomationActionResult> {
    try {
      const sent = await this.#sender.sendTextOnce(recipient, content);
      if (!sent.messageId) return {outcome: 'FAILED', providerMessageId: null, reason: 'WHATSAPP_MESSAGE_ID_REQUIRED',sentMediaUrls:[]};
      return {outcome: 'SENT', providerMessageId: sent.messageId, providerMessageIds:[sent.messageId], mediaSentCount:0,sentMediaUrls:[], reason: null};
    } catch (error) {
      const reason = compactReason(error);
      if (ambiguous(reason)) return {outcome: 'AMBIGUOUS', providerMessageId: null, reason: 'WHATSAPP_AMBIGUOUS_SEND',sentMediaUrls:[]};
      return {outcome: 'FAILED', providerMessageId: null, reason,sentMediaUrls:[]};
    }
  }

  async execute(input:{recipient:string;content:string;actionType:AutomationActionType;mediaUrl:string|null;mediaUrls?:string[]}):Promise<AutomationActionResult>{
    const wantsImage=input.actionType!=='SEND_TEXT';
    const images=uniqueMedia(input.mediaUrls,input.mediaUrl);
    if(!wantsImage||!images.length||!this.#sender.sendImageWithCaptionOnce){
      const text=await this.sendText(input.recipient,input.content);
      return wantsImage&&text.outcome==='SENT'?{...text,fallbackToText:true,imageError:images.length?'IMAGE_SENDER_UNAVAILABLE':'IMAGE_NOT_RESOLVED'}:text;
    }

    const providerMessageIds:string[]=[];const sentMediaUrls:string[]=[];
    for(let index=0;index<images.length;index+=1){
      try{
        const sent=await this.#sender.sendImageWithCaptionOnce(input.recipient,images[index],index===0?input.content:'');
        if(!sent.messageId)throw new Error('WHATSAPP_MESSAGE_ID_REQUIRED');
        providerMessageIds.push(sent.messageId);sentMediaUrls.push(images[index]);
      }catch(error){
        const imageError=compactReason(error);
        if(providerMessageIds.length>0){
          return{outcome:'SENT',providerMessageId:providerMessageIds[0],providerMessageIds,mediaSentCount:providerMessageIds.length,sentMediaUrls,reason:null,fallbackToText:false,imageError,warning:'PARTIAL_MEDIA_SEND'};
        }
        if(ambiguous(imageError))return{outcome:'AMBIGUOUS',providerMessageId:null,reason:'WHATSAPP_AMBIGUOUS_SEND',providerMessageIds:[],mediaSentCount:0,sentMediaUrls:[],fallbackToText:false,imageError};
        const fallback=await this.sendText(input.recipient,input.content);
        return{...fallback,fallbackToText:true,imageError,sentMediaUrls:[]};
      }
    }

    return{outcome:'SENT',providerMessageId:providerMessageIds[0],providerMessageIds,mediaSentCount:providerMessageIds.length,sentMediaUrls,reason:null,fallbackToText:false,imageError:null,warning:null};
  }
}

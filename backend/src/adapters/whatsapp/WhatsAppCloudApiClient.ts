type Options={accessToken:string;phoneNumberId:string;version?:string;fetcher?:typeof fetch};

function safeDiagnostic(value:string):string{
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]')
    .replace(/\b\d{8,15}\b/g,'[REDACTED_ID]')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,300);
}

export class WhatsAppCloudApiClient{
  readonly #accessToken:string;
  readonly #phoneNumberId:string;
  readonly #version:string;
  readonly #fetcher:typeof fetch;
  constructor(options:Options){
    this.#accessToken=options.accessToken;
    this.#phoneNumberId=options.phoneNumberId;
    this.#version=options.version??'v25.0';
    this.#fetcher=options.fetcher??fetch;
  }
  async sendText(to:string,text:string):Promise<{messageId:string|null}>{
    const recipient=String(to??'').trim();const bodyText=String(text??'').trim();
    if(!recipient)throw new Error('WHATSAPP_RECIPIENT_REQUIRED');
    if(!bodyText)throw new Error('WHATSAPP_TEXT_REQUIRED');
    const url=`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}/messages`;
    const response=await this.#fetcher(url,{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${this.#accessToken}`},
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:bodyText}}),
    });
    if(!response.ok){
      const diagnostic=safeDiagnostic(await response.text().catch(()=>''));
      throw new Error(`WhatsApp Graph API HTTP ${response.status}${diagnostic?`: ${diagnostic}`:''}`);
    }
    const json=await response.json().catch(()=>({})) as any;
    return{messageId:typeof json?.messages?.[0]?.id==='string'?json.messages[0].id:null};
  }
  async getStatus():Promise<{configured:true;reachable:true;phoneNumberId:string;displayPhoneNumber:string|null;verifiedName:string|null;qualityRating:string|null;graphApiVersion:string}>{
    const url=new URL(`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}`);
    url.searchParams.set('fields','id,display_phone_number,verified_name,quality_rating');
    const response=await this.#fetcher(url,{headers:{authorization:`Bearer ${this.#accessToken}`}});
    if(!response.ok){
      const diagnostic=safeDiagnostic(await response.text().catch(()=>''));
      throw new Error(`WhatsApp Graph API HTTP ${response.status}${diagnostic?`: ${diagnostic}`:''}`);
    }
    const json=await response.json().catch(()=>({})) as any;
    return{configured:true,reachable:true,phoneNumberId:String(json?.id??this.#phoneNumberId),displayPhoneNumber:typeof json?.display_phone_number==='string'?json.display_phone_number:null,verifiedName:typeof json?.verified_name==='string'?json.verified_name:null,qualityRating:typeof json?.quality_rating==='string'?json.quality_rating:null,graphApiVersion:this.#version};
  }
}

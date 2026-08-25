type Options={accessToken:string;phoneNumberId:string;version?:string;fetcher?:typeof fetch;retryMaxAttempts?:number;retryBaseDelayMs?:number;sleeper?:(ms:number)=>Promise<void>};

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
  readonly #retryMaxAttempts:number;
  readonly #retryBaseDelayMs:number;
  readonly #sleeper:(ms:number)=>Promise<void>;
  constructor(options:Options){
    this.#accessToken=options.accessToken;
    this.#phoneNumberId=options.phoneNumberId;
    this.#version=options.version??'v25.0';
    this.#fetcher=options.fetcher??fetch;
    this.#retryMaxAttempts=Math.max(1,Math.min(5,Math.floor(options.retryMaxAttempts??3)));
    this.#retryBaseDelayMs=Math.max(0,Math.min(5000,Math.floor(options.retryBaseDelayMs??250)));
    this.#sleeper=options.sleeper??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  }
  async sendText(to:string,text:string):Promise<{messageId:string|null}>{
    const recipient=String(to??'').trim();const bodyText=String(text??'').trim();
    if(!recipient)throw new Error('WHATSAPP_RECIPIENT_REQUIRED');
    if(!bodyText)throw new Error('WHATSAPP_TEXT_REQUIRED');
    const url=`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}/messages`;
    let response:Response|null=null;let networkError:unknown=null;
    for(let attempt=1;attempt<=this.#retryMaxAttempts;attempt+=1){
      try{
        response=await this.#fetcher(url,{
          method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.#accessToken}`},
          body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:bodyText}}),
        });
        networkError=null;
      }catch(error){networkError=error;response=null;}
      const transient=networkError!==null||response?.status===429||Boolean(response&&response.status>=500);
      if(!transient||attempt===this.#retryMaxAttempts)break;
      await this.#sleeper(this.#retryBaseDelayMs*(2**(attempt-1)));
    }
    if(networkError!==null)throw new Error(`WhatsApp Graph API network failure: ${safeDiagnostic(networkError instanceof Error?networkError.message:String(networkError))}`);
    if(!response)throw new Error('WhatsApp Graph API network failure');
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

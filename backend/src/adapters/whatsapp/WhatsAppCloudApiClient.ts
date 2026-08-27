type ImageNormalizer=(bytes:Uint8Array)=>Promise<Uint8Array>;
type Options={accessToken:string;phoneNumberId:string;version?:string;fetcher?:typeof fetch;retryMaxAttempts?:number;retryBaseDelayMs?:number;sleeper?:(ms:number)=>Promise<void>;imageNormalizer?:ImageNormalizer};

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
  readonly #imageNormalizer:ImageNormalizer;
  constructor(options:Options){
    this.#accessToken=options.accessToken;
    this.#phoneNumberId=options.phoneNumberId;
    this.#version=options.version??'v25.0';
    this.#fetcher=options.fetcher??fetch;
    this.#retryMaxAttempts=Math.max(1,Math.min(5,Math.floor(options.retryMaxAttempts??3)));
    this.#retryBaseDelayMs=Math.max(0,Math.min(5000,Math.floor(options.retryBaseDelayMs??250)));
    this.#sleeper=options.sleeper??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    this.#imageNormalizer=options.imageNormalizer??(async bytes=>{
      const moduleName='sharp';
      const loaded:any=await import(moduleName);
      const sharp=loaded.default??loaded;
      const output=await sharp(Buffer.from(bytes)).jpeg({quality:90}).toBuffer();
      return new Uint8Array(output);
    });
  }
  #messageUrl():string{return`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}/messages`;}
  #mediaUrl():string{return`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}/media`;}
  #messagePayload(to:string,text:string){return{messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:text}};}
  #validateText(to:string,text:string):{recipient:string;bodyText:string}{
    const recipient=String(to??'').trim();const bodyText=String(text??'').trim();
    if(!recipient)throw new Error('WHATSAPP_RECIPIENT_REQUIRED');
    if(!bodyText)throw new Error('WHATSAPP_TEXT_REQUIRED');
    return{recipient,bodyText};
  }
  #validateImageUrl(value:string):string{
    try{const url=new URL(String(value??'').trim());if(url.protocol!=='https:')throw new Error();return url.toString();}catch{throw new Error('WHATSAPP_IMAGE_HTTPS_URL_REQUIRED');}
  }
  async #sendMessageOnce(payload:Record<string,unknown>):Promise<{messageId:string|null}>{
    let response:Response;
    try{
      response=await this.#fetcher(this.#messageUrl(),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.#accessToken}`},body:JSON.stringify(payload)});
    }catch(error){
      const diagnostic=safeDiagnostic(error instanceof Error?error.message:String(error));
      throw new Error(`WHATSAPP_AMBIGUOUS_SEND${diagnostic?`: ${diagnostic}`:''}`);
    }
    if(!response.ok){const diagnostic=safeDiagnostic(await response.text().catch(()=>''));throw new Error(`WhatsApp Graph API HTTP ${response.status}${diagnostic?`: ${diagnostic}`:''}`);}
    const json=await response.json().catch(()=>({})) as any;
    return{messageId:typeof json?.messages?.[0]?.id==='string'?json.messages[0].id:null};
  }
  async #uploadNormalizedWebp(imageUrl:string):Promise<string>{
    let source:Response;
    try{source=await this.#fetcher(imageUrl);}catch(error){throw new Error(`WHATSAPP_MEDIA_DOWNLOAD_FAILED: ${safeDiagnostic(error instanceof Error?error.message:String(error))}`);}
    if(!source.ok)throw new Error(`WHATSAPP_MEDIA_DOWNLOAD_HTTP_${source.status}`);
    const raw=new Uint8Array(await source.arrayBuffer());
    let jpeg:Uint8Array;
    try{jpeg=await this.#imageNormalizer(raw);}catch(error){throw new Error(`WHATSAPP_WEBP_CONVERSION_FAILED: ${safeDiagnostic(error instanceof Error?error.message:String(error))}`);}
    const form=new FormData();form.append('messaging_product','whatsapp');form.append('file',new Blob([jpeg as BlobPart],{type:'image/jpeg'}),'automation.jpg');
    let response:Response;
    try{response=await this.#fetcher(this.#mediaUrl(),{method:'POST',headers:{authorization:`Bearer ${this.#accessToken}`},body:form});}
    catch(error){throw new Error(`WHATSAPP_MEDIA_UPLOAD_FAILED: ${safeDiagnostic(error instanceof Error?error.message:String(error))}`);}
    if(!response.ok){const diagnostic=safeDiagnostic(await response.text().catch(()=>''));throw new Error(`WHATSAPP_MEDIA_UPLOAD_HTTP_${response.status}${diagnostic?`: ${diagnostic}`:''}`);}
    const json=await response.json().catch(()=>({})) as any;const id=typeof json?.id==='string'?json.id:null;
    if(!id)throw new Error('WHATSAPP_MEDIA_ID_REQUIRED');return id;
  }
  async sendTextOnce(to:string,text:string):Promise<{messageId:string|null}>{
    const {recipient,bodyText}=this.#validateText(to,text);
    return this.#sendMessageOnce(this.#messagePayload(recipient,bodyText));
  }
  async sendImageWithCaptionOnce(to:string,imageUrl:string,caption:string):Promise<{messageId:string|null}>{
    const {recipient,bodyText}=this.#validateText(to,caption);const normalizedUrl=this.#validateImageUrl(imageUrl);
    const isWebp=/\.webp(?:$|[?#])/i.test(normalizedUrl);
    const image=isWebp?{id:await this.#uploadNormalizedWebp(normalizedUrl),caption:bodyText}:{link:normalizedUrl,caption:bodyText};
    return this.#sendMessageOnce({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'image',image});
  }
  async sendText(to:string,text:string):Promise<{messageId:string|null}>{
    const {recipient,bodyText}=this.#validateText(to,text);
    const url=this.#messageUrl();
    let response:Response|null=null;let networkError:unknown=null;
    for(let attempt=1;attempt<=this.#retryMaxAttempts;attempt+=1){
      try{response=await this.#fetcher(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.#accessToken}`},body:JSON.stringify(this.#messagePayload(recipient,bodyText))});networkError=null;}
      catch(error){networkError=error;response=null;}
      const transient=networkError!==null||response?.status===429||Boolean(response&&response.status>=500);
      if(!transient||attempt===this.#retryMaxAttempts)break;
      await this.#sleeper(this.#retryBaseDelayMs*(2**(attempt-1)));
    }
    if(networkError!==null)throw new Error(`WhatsApp Graph API network failure: ${safeDiagnostic(networkError instanceof Error?networkError.message:String(networkError))}`);
    if(!response)throw new Error('WhatsApp Graph API network failure');
    if(!response.ok){const diagnostic=safeDiagnostic(await response.text().catch(()=>''));throw new Error(`WhatsApp Graph API HTTP ${response.status}${diagnostic?`: ${diagnostic}`:''}`);}
    const json=await response.json().catch(()=>({})) as any;
    return{messageId:typeof json?.messages?.[0]?.id==='string'?json.messages[0].id:null};
  }
  async getStatus():Promise<{configured:true;reachable:true;phoneNumberId:string;displayPhoneNumber:string|null;verifiedName:string|null;qualityRating:string|null;graphApiVersion:string}>{
    const url=new URL(`https://graph.facebook.com/${encodeURIComponent(this.#version)}/${encodeURIComponent(this.#phoneNumberId)}`);
    url.searchParams.set('fields','id,display_phone_number,verified_name,quality_rating');
    const response=await this.#fetcher(url,{headers:{authorization:`Bearer ${this.#accessToken}`}});
    if(!response.ok){const diagnostic=safeDiagnostic(await response.text().catch(()=>''));throw new Error(`WhatsApp Graph API HTTP ${response.status}${diagnostic?`: ${diagnostic}`:''}`);}
    const json=await response.json().catch(()=>({})) as any;
    return{configured:true,reachable:true,phoneNumberId:String(json?.id??this.#phoneNumberId),displayPhoneNumber:typeof json?.display_phone_number==='string'?json.display_phone_number:null,verifiedName:typeof json?.verified_name==='string'?json.verified_name:null,qualityRating:typeof json?.quality_rating==='string'?json.quality_rating:null,graphApiVersion:this.#version};
  }
}

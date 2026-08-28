import type { AutomationMediaSnapshot } from './types.ts';

type ProductReference={productId:string|null;productQuery:string|null};
type Image={url:string;type?:string|null;source?:string|null};

type CrmProductPort={getAutomationProductReference(sessionId:string):Promise<ProductReference>};
type ProductImagePort={getProductImages(product:string,maxImages?:number):Promise<Image[]>};

function validHttps(value:unknown):string|null{
  const raw=String(value??'').trim();
  if(!raw)return null;
  try{const url=new URL(raw);return url.protocol==='https:'?url.toString():null;}catch{return null;}
}

export function selectAutomationProductImages(images:Image[],limit=20):Array<Image&{url:string}>{
  const seen=new Set<string>();const out:Array<Image&{url:string}>=[];
  for(const image of images){
    const url=validHttps(image.url);if(!url||seen.has(url))continue;
    seen.add(url);out.push({...image,url});
    if(out.length>=Math.max(1,Math.min(20,limit)))break;
  }
  return out;
}

export function selectAutomationProductImage(images:Image[]):Image|null{
  const valid=selectAutomationProductImages(images,20);
  return valid.find(image=>String(image.type??'').toLowerCase().includes('caracteristicas_generales'))??valid[0]??null;
}

export class AutomationMediaResolver{
  readonly #crm:CrmProductPort;
  readonly #erp:ProductImagePort;
  constructor(crm:CrmProductPort,erp:ProductImagePort){this.#crm=crm;this.#erp=erp;}

  async resolveForSession(sessionId:string):Promise<AutomationMediaSnapshot>{
    const ref=await this.#crm.getAutomationProductReference(sessionId);
    const candidates=[ref.productId,ref.productQuery].map(value=>String(value??'').trim()).filter((value,index,all)=>value&&all.indexOf(value)===index);
    for(const candidate of candidates){
      const selected=selectAutomationProductImages(await this.#erp.getProductImages(candidate,20),20);
      if(selected.length){
        const first=selected[0];
        return{mediaUrl:first.url,mediaUrls:selected.map(image=>image.url),mediaType:first.type??null,mediaProductId:ref.productId??candidate,mediaSource:first.source??'SQL_BRIDGE'};
      }
    }
    return{mediaUrl:null,mediaUrls:[],mediaType:null,mediaProductId:ref.productId,mediaSource:null};
  }
}

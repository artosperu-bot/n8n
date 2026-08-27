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

export function selectAutomationProductImage(images:Image[]):Image|null{
  const valid=images.map(image=>({...image,url:validHttps(image.url)})).filter((image):image is Image&{url:string}=>Boolean(image.url));
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
      const selected=selectAutomationProductImage(await this.#erp.getProductImages(candidate,10));
      if(selected){
        return{mediaUrl:selected.url,mediaType:selected.type??null,mediaProductId:ref.productId??candidate,mediaSource:selected.source??'SQL_BRIDGE'};
      }
    }
    return{mediaUrl:null,mediaType:null,mediaProductId:ref.productId,mediaSource:null};
  }
}

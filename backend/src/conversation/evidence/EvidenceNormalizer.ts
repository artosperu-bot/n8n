import type { ProductQuote, RagEvidence, VerifiedFact } from '../../domain/types.ts';

function compact(value:string,max=320):string {
  const clean=value.replace(/\s+/g,' ').trim();
  return clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`;
}
function productName(q:ProductQuote):string {
  return String(q.shortName??q.product).trim();
}

export function normalizeEvidence(input:{
  intent:string;
  quote?:ProductQuote|null;
  rag?:RagEvidence[];
}):VerifiedFact[] {
  const intent=String(input.intent??'').toUpperCase();
  const facts:VerifiedFact[]=[];
  const q=input.quote??null;
  if(q){
    facts.push({domain:'SQL',key:'PRODUCTO',value:productName(q),productId:q.productRagId??null,source:q.source});
    if(['PRICE','PRICE_AVAILABILITY','QUOTE'].includes(intent)&&q.price!=null){
      facts.push({domain:'SQL',key:'PRECIO',value:`${q.currency||'PEN'} ${Number(q.price).toFixed(2)}`,productId:q.productRagId??null,source:q.source});
    }
    if(intent==='STOCK'&&q.stock!=null){
      facts.push({domain:'SQL',key:'DISPONIBILIDAD',value:q.stock>0?'DISPONIBLE':'NO_DISPONIBLE',productId:q.productRagId??null,source:q.source});
    }
  }

  for(const row of input.rag??[]){
    const value=compact(String(row.text??''));
    if(!value)continue;
    const domain=row.domain==='INSTITUTIONAL'||row.source.startsWith('SUPABASE_INSTITUCIONAL')?'INSTITUTIONAL_RAG':'PRODUCT_RAG';
    const key=String(row.section??row.source.split(':').at(-1)??'EVIDENCIA').toUpperCase();
    facts.push({domain,key,value,productId:row.productId??null,source:row.source});
  }

  const seen=new Set<string>();
  return facts.filter(f=>{
    const key=`${f.domain}|${f.key}|${f.value}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,12);
}

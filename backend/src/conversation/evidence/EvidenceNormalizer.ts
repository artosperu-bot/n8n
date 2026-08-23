import type { ProductQuote, RagEvidence, VerifiedFact } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

function compact(value:string,max=320):string {
  const clean=value.replace(/\s+/g,' ').trim();
  return clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`;
}
function productName(q:ProductQuote):string {
  return String(q.shortName??q.product).trim();
}

const RAG_ENVELOPE_KEYS=new Set([
  'producto','producto id','codigo','sku','seccion','grupo tecnico','titulo','contenido','palabras clave',
]);
function envelopeLabel(line:string):string|null {
  const match=line.match(/^([^:\n]{2,40})\s*:\s*/);
  if(!match)return null;
  return fold(match[1]).replace(/\s+/g,' ').trim();
}
function displayText(raw:string):string {
  const normalized=raw.replace(/\r\n?/g,'\n').trim();
  if(!normalized)return '';
  const lines=normalized.split('\n').map(line=>line.trim()).filter(Boolean);
  const envelopeCount=lines.reduce((count,line)=>count+(RAG_ENVELOPE_KEYS.has(envelopeLabel(line)??'')?1:0),0);
  if(envelopeCount<2)return compact(normalized);

  const contentIndex=lines.findIndex(line=>envelopeLabel(line)==='contenido');
  if(contentIndex>=0){
    const first=lines[contentIndex].replace(/^[^:\n]{2,40}\s*:\s*/,'').trim();
    const tail=lines.slice(contentIndex+1).filter(line=>!RAG_ENVELOPE_KEYS.has(envelopeLabel(line)??''));
    return compact([first,...tail].filter(Boolean).join(' '));
  }

  return compact(lines.filter(line=>!RAG_ENVELOPE_KEYS.has(envelopeLabel(line)??'')).join(' '));
}

function memoryFacts(text:string,row:RagEvidence):VerifiedFact[] {
  const facts:VerifiedFact[]=[];
  const combined=text.match(/\b(\d+(?:[.,]\d+)?)\s*GB\s*\+\s*(\d+(?:[.,]\d+)?)\s*GB\s*(?:de\s*)?(?:RAM\s*)?virtual\b/i);
  const physical=combined?.[1]??text.match(/\b(?:memoria\s+)?RAM\s*(?:f[ií]sica)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  const virtual=combined?.[2]??text.match(/\b(?:ampliaci[oó]n\s+de\s+)?RAM\s+virtual(?:\s+m[aá]xima)?\s*[:=]?\s*(?:de\s+)?(?:hasta\s+)?(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  const base={domain:'PRODUCT_RAG' as const,productId:row.productId??null,source:row.source};
  if(physical)facts.push({...base,key:'RAM_FISICA',value:`${physical.replace(',','.')} GB`});
  if(virtual)facts.push({...base,key:'RAM_VIRTUAL',value:`hasta ${virtual.replace(',','.')} GB`});
  return facts;
}

function resistanceFacts(text:string,row:RagEvidence):VerifiedFact[]{
  const facts:VerifiedFact[]=[];
  const base={domain:'PRODUCT_RAG' as const,productId:row.productId??null,source:row.source};
  const fall=text.match(/\bresistencia\s+a\s+ca[ií]das?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*m\b/i);
  const depth=text.match(/\bprofundidad\s+IP68\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*m\b/i);
  const time=text.match(/\btiempo\s+IP68\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*min(?:utos?)?\b/i);
  const ip68=text.match(/\bcertificaci[oó]n\s+IP68\s*[:=]?\s*(s[ií]|no)\b/i);
  const ip69=text.match(/\bcertificaci[oó]n\s+IP69K?\s*[:=]?\s*(s[ií]|no)\b/i);
  const mil=text.match(/\bMIL-STD-810H\s*[:=]?\s*(s[ií]|no)\b/i);
  if(fall)facts.push({...base,key:'RESISTENCIA_CAIDAS',value:`${fall[1].replace(',','.')} m`});
  if(ip68)facts.push({...base,key:'IP68',value:/^s/i.test(ip68[1])?'Sí':'No'});
  if(ip69)facts.push({...base,key:'IP69K',value:/^s/i.test(ip69[1])?'Sí':'No'});
  if(mil)facts.push({...base,key:'MIL_STD_810H',value:/^s/i.test(mil[1])?'Sí':'No'});
  if(depth)facts.push({...base,key:'PROFUNDIDAD_IP68',value:`${depth[1].replace(',','.')} m`});
  if(time)facts.push({...base,key:'TIEMPO_IP68',value:`${time[1].replace(',','.')} min`});
  return facts;
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
    if(['PRICE','PRICE_AVAILABILITY','QUOTE','STOCK'].includes(intent)&&q.price!=null){
      facts.push({domain:'SQL',key:'PRECIO',value:`${q.currency||'PEN'} ${Number(q.price).toFixed(2)}`,productId:q.productRagId??null,source:q.source});
    }
    if(['PRICE','PRICE_AVAILABILITY','STOCK','PRODUCT_INFO','ATTRIBUTE','CAPABILITY'].includes(intent)&&q.stock!=null){
      facts.push({domain:'SQL',key:'DISPONIBILIDAD',value:q.stock>0?'DISPONIBLE':'NO_DISPONIBLE',productId:q.productRagId??null,source:q.source});
    }
  }

  for(const row of input.rag??[]){
    const raw=String(row.text??'');
    if(String(row.section??'').toUpperCase()==='MEMORIA'||/\bRAM\b/i.test(raw))facts.push(...memoryFacts(raw,row));
    if(/\b(?:resistencia\s+a\s+ca[ií]das?|IP68|IP69K?|MIL-STD-810H)\b/i.test(raw))facts.push(...resistanceFacts(raw,row));
    const value=displayText(raw);
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

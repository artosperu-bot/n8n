import type { ProductQuote, RagEvidence, VerifiedFact } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type GroundedDirectAnswerInput={
  message:string;
  intent:string;
  attribute:string|null;
  resolvedProduct:string|null;
  quote?:ProductQuote|null;
  rag?:RagEvidence[];
  verifiedFacts?:VerifiedFact[];
};

function productName(input:GroundedDirectAnswerInput):string{
  return String(input.resolvedProduct??input.quote?.shortName??input.quote?.product??'El producto').trim();
}
function compact(value:string,max=420):string{
  const clean=value.replace(/\s+/g,' ').trim();if(!clean)return'';
  const clipped=clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`;
  return /[.!?…]$/.test(clipped)?clipped:`${clipped}.`;
}
function positive(value:string|null|undefined):boolean{return /^(?:s[ií]|si|true|yes|1)$/i.test(String(value??'').trim());}
function negative(value:string|null|undefined):boolean{return /^(?:no|false|0)$/i.test(String(value??'').trim());}
function fact(input:GroundedDirectAnswerInput,key:string):string|null{
  const value=(input.verifiedFacts??[]).find(f=>f.domain==='PRODUCT_RAG'&&String(f.key).toUpperCase()===key.toUpperCase())?.value;
  return String(value??'').trim()||null;
}
function raw(input:GroundedDirectAnswerInput):string{return (input.rag??[]).map(r=>String(r.text??'')).join('\n');}
function rawYesNo(input:GroundedDirectAnswerInput,label:RegExp):'Sí'|'No'|null{
  const text=raw(input);const m=text.match(new RegExp(`${label.source}\\s*[:=]?\\s*(s[ií]|no)\\b`,'i'));
  return m?/^s/i.test(m[1])?'Sí':'No':null;
}
function val(input:GroundedDirectAnswerInput,key:string,fallback?:RegExp):string|null{
  const known=fact(input,key);if(known)return known;
  const m=fallback?raw(input).match(fallback):null;return m?.[1]?.trim()??null;
}
function joinNatural(items:string[]):string{
  const clean=items.filter(Boolean);if(clean.length<=1)return clean[0]??'';if(clean.length===2)return `${clean[0]} y ${clean[1]}`;return `${clean.slice(0,-1).join(', ')} y ${clean.at(-1)}`;
}
function cleanHasta(value:string|null):string|null{return value?value.replace(/^hasta\s+/i,'').trim():null;}

function memoryAnswer(input:GroundedDirectAnswerInput):string|null{
  const physical=val(input,'RAM_FISICA',/RAM\s+f[ií]sica\s*[:=]?\s*([^.;\n]+)/i);
  const virtual=cleanHasta(val(input,'RAM_VIRTUAL',/RAM\s+virtual(?:\s+m[aá]xima)?\s*[:=]?\s*(?:hasta\s+)?([^.;\n]+)/i));
  const storage=val(input,'ALMACENAMIENTO',/almacenamiento(?:\s+interno)?\s*[:=]?\s*([^.;\n]+)/i);
  const pieces:string[]=[];
  if(physical)pieces.push(`${physical} de RAM física`);if(virtual)pieces.push(`hasta ${virtual} de RAM virtual`);if(storage)pieces.push(`${storage} de almacenamiento`);
  return pieces.length?`${productName(input)} tiene ${joinNatural(pieces)}.`:null;
}
function batteryAnswer(input:GroundedDirectAnswerInput):string|null{
  const capacity=val(input,'BATERIA_MAH',/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+\s*mAh)/i);
  const charge=val(input,'CARGA_W',/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+\s*W)/i);
  if(!capacity&&!charge)return null;
  return `${productName(input)} tiene ${capacity?`batería de ${capacity}`:'batería documentada'}${charge?` y carga de ${charge}`:''}.`;
}
function resistanceAnswer(input:GroundedDirectAnswerInput):string|null{
  const fall=val(input,'RESISTENCIA_CAIDAS',/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*([0-9.,]+\s*m)/i);
  const depth=val(input,'PROFUNDIDAD_IP68',/profundidad\s+IP68\s*[:=]?\s*([0-9.,]+\s*m)/i);
  const time=val(input,'TIEMPO_IP68',/tiempo\s+IP68\s*[:=]?\s*([0-9.,]+\s*min(?:utos?)?)/i);
  const certs:string[]=[];
  const ip68=fact(input,'IP68')??rawYesNo(input,/(?:certificaci[oó]n\s+)?IP68/);if(positive(ip68))certs.push('IP68');
  const ip69=fact(input,'IP69K')??rawYesNo(input,/(?:certificaci[oó]n\s+)?IP69K?/);if(positive(ip69))certs.push('IP69K');
  const mil=fact(input,'MIL_STD_810H')??rawYesNo(input,/MIL-STD-810H/);if(positive(mil))certs.push('MIL-STD-810H');
  if(!fall&&!certs.length&&!depth)return null;
  const parts:string[]=[];
  if(certs.length)parts.push(`certificaciones ${joinNatural(certs)}`);
  if(fall)parts.push(`resistencia a caídas de ${fall}`);
  if(depth&&time)parts.push(`protección IP68 documentada hasta ${depth} durante ${time}`);
  return `${productName(input)} cuenta con ${joinNatural(parts)}.`;
}
function cameraAnswer(input:GroundedDirectAnswerInput):string|null{
  const main=val(input,'CAMARA_PRINCIPAL_MP',/c[aá]mara\s+(?:principal|trasera)\s*[:=]?\s*([0-9.,]+\s*MP)/i);
  const front=val(input,'CAMARA_FRONTAL_MP',/c[aá]mara\s+frontal\s*[:=]?\s*([0-9.,]+\s*MP)/i);
  const night=val(input,'CAMARA_NOCTURNA_MP',/(?:visi[oó]n\s+nocturna|c[aá]mara\s+nocturna)\s*[:=]?\s*([0-9.,]+\s*MP)/i);
  const nightFlag=fact(input,'VISION_NOCTURNA')??rawYesNo(input,/(?:c[aá]mara\s+)?visi[oó]n\s+nocturna/);
  const pieces:string[]=[];
  if(main)pieces.push(`cámara principal de ${main}`);if(front)pieces.push(`cámara frontal de ${front}`);if(night)pieces.push(`cámara de visión nocturna de ${night}`);else if(positive(nightFlag))pieces.push('visión nocturna');
  return pieces.length?`${productName(input)} tiene ${joinNatural(pieces)}.`:null;
}
function nfcAnswer(input:GroundedDirectAnswerInput):string|null{
  const value=fact(input,'NFC')??rawYesNo(input,/\bNFC\b/);if(!value)return null;
  return positive(value)?`Sí, ${productName(input)} tiene NFC.`:negative(value)?`No, ${productName(input)} no tiene NFC.`:null;
}
function networkAnswer(input:GroundedDirectAnswerInput):string|null{
  const five=fact(input,'5G')??rawYesNo(input,/(?:conectividad\s+|red\s+|soporte\s+)?5G/);
  if(positive(five))return `Sí, ${productName(input)} tiene conectividad 5G.`;
  if(negative(five))return `No, ${productName(input)} no tiene 5G.`;
  const four=fact(input,'4G_LTE')??rawYesNo(input,/(?:red\s+)?4G(?:\s+LTE)?/);
  if(positive(four))return `No tengo 5G confirmado para ${productName(input)}; lo que sí está documentado es 4G LTE.`;
  return null;
}
function nightVisionAnswer(input:GroundedDirectAnswerInput):string|null{
  const night=val(input,'CAMARA_NOCTURNA_MP',/(?:visi[oó]n\s+nocturna|c[aá]mara\s+nocturna)\s*[:=]?\s*([0-9.,]+\s*MP)/i);
  const flag=fact(input,'VISION_NOCTURNA')??rawYesNo(input,/(?:c[aá]mara\s+)?visi[oó]n\s+nocturna/);
  if(night)return `Sí, ${productName(input)} tiene cámara de visión nocturna de ${night}.`;
  if(positive(flag))return `Sí, ${productName(input)} tiene visión nocturna.`;
  if(negative(flag))return `No, ${productName(input)} no tiene visión nocturna.`;
  return null;
}
function thermalAnswer(input:GroundedDirectAnswerInput):string|null{
  const flag=fact(input,'CAMARA_TERMICA')??rawYesNo(input,/c[aá]mara\s+t[eé]rmica/);
  const resolution=val(input,'RESOLUCION_TERMICA',/resoluci[oó]n\s+t[eé]rmica\s*[:=]?\s*([0-9]+\s*[x×]\s*[0-9]+)/i);
  if(positive(flag))return `Sí, ${productName(input)} tiene cámara térmica${resolution?` con resolución de ${resolution}`:''}.`;
  if(negative(flag))return `No, ${productName(input)} no tiene cámara térmica.`;
  return null;
}
function attributeAnswer(input:GroundedDirectAnswerInput):string|null{
  const asked=fold(`${input.attribute??''} ${input.message}`);
  if(/nfc/.test(asked))return nfcAnswer(input);
  if(/5g/.test(asked))return networkAnswer(input);
  if(/termic|temperatura/.test(asked))return thermalAnswer(input);
  if(/vision\s+nocturna|camara\s+nocturna|nocturn/.test(asked))return nightVisionAnswer(input);
  if(/resisten|caida|golpe|ip68|ip69|mil/.test(asked))return resistanceAnswer(input);
  if(/camara|camaras|foto|video/.test(asked))return cameraAnswer(input);
  if(/ram|memoria|almacen/.test(asked))return memoryAnswer(input);
  if(/bateria|autonomia|carga/.test(asked))return batteryAnswer(input);
  return null;
}

export function buildGroundedDirectAnswer(input:GroundedDirectAnswerInput):string|null{
  const intent=String(input.intent??'').toUpperCase();
  const factual=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','CAPABILITY','PRODUCT_INFO','ATTRIBUTE','WARRANTY','POLICY','ORDER_STATUS']);
  if(!factual.has(intent))return null;
  const quote=input.quote??null;
  if(['PRICE','PRICE_AVAILABILITY'].includes(intent)&&quote?.price!=null)return `${productName(input)} está a S/ ${quote.price}.`;
  if(intent==='STOCK'&&quote?.stock!=null)return quote.stock>0?'Sí, está disponible.':'Ahora no está disponible.';
  const institutional=(input.rag??[]).find(row=>row.domain==='INSTITUTIONAL'||/INSTITUCIONAL|POLICY/i.test(row.source));
  if(['POLICY','WARRANTY'].includes(intent)&&institutional?.text)return compact(institutional.text);
  if(['CAPABILITY','ATTRIBUTE'].includes(intent))return attributeAnswer(input);
  return null;
}

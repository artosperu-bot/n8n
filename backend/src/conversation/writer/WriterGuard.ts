import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { normalizeEvidence } from '../evidence/EvidenceNormalizer.ts';
import { fold } from '../../shared/text.ts';

export type WriterGuardResult = {
  answer: string;
  model: string;
  llmResult: LlmResult | null;
  fallback: { delivered: boolean; error?: string };
};

function familyModel(product:string):{prefix:string;model:string}|null {
  const parts=fold(product).split(/[^a-z0-9]+/).filter(Boolean);
  const modelIndex=parts.findIndex(x=>/\d/.test(x));
  if(modelIndex<=0)return null;
  return {prefix:parts.slice(0,modelIndex).join(' '),model:parts[modelIndex]};
}
function unique(values:Array<string|null|undefined>):string[]{return[...new Set(values.map(v=>String(v??'').trim()).filter(Boolean))];}
function escapes(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function mentionsProductOutsideAllowlist(answer:string,allowed:string[]):boolean {
  if(!allowed.length)return false;
  const signatures=allowed.map(familyModel).filter((x):x is {prefix:string;model:string}=>Boolean(x));
  if(!signatures.length)return false;
  const byPrefix=new Map<string,Set<string>>();
  for(const row of signatures){
    const models=byPrefix.get(row.prefix)??new Set<string>();models.add(row.model);byPrefix.set(row.prefix,models);
  }
  const text=fold(answer);
  for(const [prefix,models] of byPrefix){
    const pattern=new RegExp(`\\b${escapes(prefix).replace(/\\ /g,'\\s+')}\\s+([a-z0-9-]*\\d[a-z0-9-]*)\\b`,'g');
    for(const match of text.matchAll(pattern))if(!models.has(match[1]))return true;
  }
  return false;
}
function evidenceText(input:LlmWriteInput):string {
  return fold((input.rag??[]).map(x=>x.text).join('\n'));
}
type NumericClaim={value:number;unit:string};
function numericClaims(text:string):NumericClaim[]{
  const claims:NumericClaim[]=[];
  const pattern=/\b(\d+(?:[.,]\d+)?)\s*(mAh|GHz|MHz|MP|W|GB|TB|MB|Hz|fps|nm|µm|mm|cm|m\b|min(?:utos?)?|horas?|mes(?:es)?|años?|unidades?|%)/gi;
  for(const match of text.matchAll(pattern)){
    const index=match.index??0;
    const prefix=fold(text.slice(Math.max(0,index-40),index));
    if(/(?:\bno\s+(?:tiene|es|soporta|incluye|trae|cuenta con)|\bsin)\s+[^\d]{0,16}$/.test(prefix))continue;
    const value=Number(match[1].replace(',','.'));
    if(Number.isFinite(value))claims.push({value,unit:fold(match[2]).replace(/s$/,'')});
  }
  return claims;
}
function hasUnsupportedNumericFact(input:LlmWriteInput,answer:string):boolean{
  const asserted=numericClaims(answer);
  if(!asserted.length)return false;
  const evidence=[...(input.rag??[]).map(x=>x.text),...(input.verifiedFacts??[]).map(x=>String(x.value))].join('\n');
  const supported=numericClaims(evidence);
  return asserted.some(claim=>!supported.some(fact=>fact.unit===claim.unit&&fact.value===claim.value));
}
function monetaryValues(text:string):string[]{
  return [...text.matchAll(/\bS\/\s*(\d+(?:[.,]\d{1,2})?)/gi)].map(m=>String(Number(m[1].replace(',','.'))));
}
function moneySupported(input:LlmWriteInput,answer:string,domain?:'INSTITUTIONAL'):boolean {
  const values=monetaryValues(answer);
  if(!values.length)return true;
  const rag=(input.rag??[]).filter(x=>!domain||x.domain===domain).map(x=>x.text).join('\n');
  const facts=(input.verifiedFacts??[]).filter(x=>!domain||x.domain===domain).map(x=>`${x.key}=${x.value}`).join('\n');
  const quote=input.quote?.price==null?'':`S/ ${input.quote.price}`;
  const supported=new Set(monetaryValues(`${rag}\n${facts}\n${quote}`));
  return values.every(v=>supported.has(v));
}
function cleanPresentation(answer:string):string {
  return answer
    .split('\n')
    .map(line=>line.replace(/^\s*(?:[-*]\s*)?\*{0,2}(?:Conclusi[oó]n|Datos clave|Consecuencia pr[aá]ctica|Recomendaci[oó]n|Postura|Trade-?off)\*{0,2}\s*:\s*/i,''))
    .join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function unsupportedFabInference(input:LlmWriteInput,answer:string):string|null {
  const text=fold(answer);
  const ev=evidenceText(input);
  if(/\b(todo el dia|toda la jornada|jornada completa|cubre (?:una|la) jornada|suficiente para (?:un|una) jornada)\b/.test(text)
    && !/\b(autonomia|duracion)\b[^\n.]{0,40}\b\d+(?:[.,]\d+)?\s*(?:h|horas)\b|\btodo el dia\b|\bjornada\b/.test(ev))return 'UNSUPPORTED_AUTONOMY_INFERENCE';
  if(/\b(sin lags?|sin trabas|fluidez|fluido|fluida)\b/.test(text)
    && !/\b(benchmark|antutu|geekbench|fluidez|lag|prueba de rendimiento|rendimiento medido)\b/.test(ev))return 'UNSUPPORTED_PERFORMANCE_INFERENCE';
  if(/\b(gps|localizacion|ubicacion)\b[^\n.]{0,55}\b(mas estable|estable|precision|preciso|mantener fijad[oa])\b|\b(mas estable|precision|preciso)\b[^\n.]{0,55}\b(gps|localizacion|ubicacion)\b/.test(text)
    && !/\b(precision|accuracy|rms|estable|estabilidad|error de posicion)\b/.test(ev))return 'UNSUPPORTED_GPS_INFERENCE';
  if(/\b(graba|video)\b[^\n.]{0,55}\b(buen|mejor|alta calidad|detalle|detallado)\b|\b(buen|mejor)\s+video\b/.test(text)
    && !/\bvideo\b[^\n.]{0,80}\b(720p|1080p|2k|4k|fps|estabilizacion|eis|ois|bitrate|calidad)\b/.test(ev))return 'UNSUPPORTED_VIDEO_INFERENCE';
  if(/\b(miles de fotos|horas de video|miles de imagenes)\b/.test(text)
    && !/\b(miles de fotos|horas de video|cantidad de fotos|duracion de video)\b/.test(ev))return 'UNSUPPORTED_STORAGE_ESTIMATE';

  // Mentioning an app as customer context is not a compatibility claim. Only block
  // actual install/support/compatibility assertions when no app/platform evidence exists.
  const appClaim=/\b(?:compatible|compatibilidad|soporta|funciona|instalar|instala|puedes usar|corre)\b[^\n.]{0,55}\b(?:whatsapp|tiktok|instagram|facebook)\b|\b(?:whatsapp|tiktok|instagram|facebook)\b[^\n.]{0,55}\b(?:compatible|soporta|funciona|instalar|instala|puedes usar|corre)\b/.test(text);
  if(appClaim&&!/(\bwhatsapp\b|\btiktok\b|\binstagram\b|\bfacebook\b|\bandroid\b|\bgoogle play\b|\bplay store\b)/.test(ev))return 'UNSUPPORTED_APP_COMPATIBILITY';
  return null;
}

function guardGeneratedAnswer(input:LlmWriteInput,answer:string):string|null {
  const intent=String(input.intent??'').toUpperCase();
  const explicitPrice=['PRICE','QUOTE','PRICE_AVAILABILITY'].includes(intent);
  const evidenceBoundPrice=['RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)&&moneySupported(input,answer);
  const institutionalPrice=['POLICY','WARRANTY'].includes(intent)&&moneySupported(input,answer,'INSTITUTIONAL');
  if(!explicitPrice&&!evidenceBoundPrice&&!institutionalPrice&&/\bS\/\s*\d/i.test(answer))return 'UNSOLICITED_PRICE';

  const unverifiedAction=/(?:ya\s+reserv(?:e|é)|reserva\s+(?:quedo|quedó|confirmada)|pedido\s+(?:creado|registrado)|compra\s+(?:realizada|confirmada))/i;
  if(unverifiedAction.test(answer))return 'UNVERIFIED_ACTION';

  const stockLeak=/(?:stock|disponib)[^\n.]{0,35}\b\d+\s*(?:unidades?|uds?)\b|\b\d+\s*(?:unidades?|uds?)\b[^\n.]{0,35}(?:stock|disponib)/i;
  if(stockLeak.test(answer))return 'RAW_STOCK_QUANTITY';

  const roboticMeta=/\b(?:cat[aá]logo\s+verificado|evidencia\s+verificada|seg[uú]n\s+(?:mi|el)\s+sistema(?:\s+interno)?|seg[uú]n\s+el\s+rag|querytarget|\bintent\b)\b/i;
  const internalControl=/\b(?:SOFT_CLOSE|ANSWER_ONLY|ASK_MISSING_FACT|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION|ASSISTED_HANDOFF|RECOMMEND_WITHIN_BUDGET|N\+1)\b/;
  if(roboticMeta.test(answer)||internalControl.test(answer))return 'ROBOTIC_META_LANGUAGE';

  if(String(input.decision?.nextBestAction??'').toUpperCase()==='ANSWER_ONLY'&&/[¿?]/.test(answer))return 'NBA_ANSWER_ONLY_QUESTION';
  const state:any=input.state??{};
  const allowedProducts=unique([...(input.allowedProducts??[]),state.activeProduct,state.queryTarget,state.salientProduct,state.selectedProduct,state.recommendedProduct,...(state.comparisonProducts??[])]);
  if(mentionsProductOutsideAllowlist(answer,allowedProducts))return 'PRODUCT_OUTSIDE_ALLOWLIST';

  const speculative=/\b(?:probablemente|seguramente|posiblemente|quiz[aá]s|tal\s+vez)\b/i;
  if(speculative.test(answer))return 'UNSUPPORTED_SPECULATION';

  const fabViolation=unsupportedFabInference(input,answer);
  if(fabViolation)return fabViolation;
  if(hasUnsupportedNumericFact(input,answer))return 'UNSUPPORTED_NUMERIC_FACT';

  const lowLightClaim=/\b(?:mejor|superior|mucho\s+mejor|mayor)\b[^\n.]{0,55}\b(?:baja|poca)\s+luz\b|\b(?:baja|poca)\s+luz\b[^\n.]{0,55}\b(?:mejor|superior)\b/i;
  if(lowLightClaim.test(answer)){
    const ev=evidenceText(input);
    if(!/(baja|poca)\s+luz|low.?light|lux/.test(ev))return 'UNSUPPORTED_LOW_LIGHT_INFERENCE';
  }

  const superlative=/\b(?:el|la)\s+m[aá]s\s+(?:resistente|potente|r[aá]pido|econ[oó]mico)|\b(?:la|el)\s+mejor\s+(?:opci[oó]n|bater[ií]a|c[aá]mara|rendimiento|resistencia)\b/i;
  if(superlative.test(answer)){
    const productIds=new Set((input.rag??[]).map(x=>String(x.productId??'').trim()).filter(Boolean));
    if(productIds.size<2)return 'UNSUPPORTED_SUPERLATIVE';
  }

  // Repetition is a presentation defect, not a truth defect. The prompt is asked
  // to avoid it, but a correct grounded answer must not be replaced by a generic fallback.
  return null;
}

function stripTrailingQuestion(answer:string):string {
  const text=answer.trim();
  const inverted=text.indexOf('¿');
  if(inverted>0)return text.slice(0,inverted).trim();
  if(inverted===0)return '';
  const questionEnd=text.lastIndexOf('?');
  if(questionEnd<0)return text;
  const before=text.slice(0,questionEnd);
  const boundary=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),before.lastIndexOf('\n'));
  return boundary>=0?before.slice(0,boundary+1).trim():'';
}
function internalFallback(answer:string):boolean{
  return /\b(?:SOFT_CLOSE|ANSWER_ONLY|ASK_MISSING_FACT|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION|ASSISTED_HANDOFF|RECOMMEND_WITHIN_BUDGET|N\+1)\b|\bcompara\b[^.]{0,90}\bde forma sim[eé]trica\b/i.test(answer);
}
function safeFallback(input:LlmWriteInput,fallbackAnswer:string):string {
  let cleaned=cleanPresentation(fallbackAnswer);
  if(internalFallback(cleaned)){
    const intent=String(input.intent??'').toUpperCase();
    cleaned=intent==='COMPARE'
      ?'No pude completar esa comparación con información suficiente.'
      :['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)
        ?'No pude confirmar una recomendación concreta con suficiente información.'
        :'No tengo ese dato confirmado.';
  }
  if(String(input.decision?.nextBestAction??'').toUpperCase()!=='ANSWER_ONLY')return cleaned;
  return stripTrailingQuestion(cleaned)||'No tengo ese dato confirmado.';
}

export async function safeWrite(llm:LlmProvider,input:LlmWriteInput,fallbackAnswer:string):Promise<WriterGuardResult>{
  try{
    const writeInput:LlmWriteInput={...input,verifiedFacts:input.verifiedFacts??normalizeEvidence({intent:input.intent,quote:input.quote,rag:input.rag})};
    const result=await llm.write(writeInput);
    const cleaned=cleanPresentation(result.text);
    const violation=guardGeneratedAnswer(writeInput,cleaned);
    if(violation==='NBA_ANSWER_ONLY_QUESTION'){
      const salvaged=stripTrailingQuestion(cleaned);
      if(salvaged&&!guardGeneratedAnswer(writeInput,salvaged))return{answer:salvaged,model:result.model,llmResult:result,fallback:{delivered:true}};
    }
    if(violation)return{answer:safeFallback(writeInput,fallbackAnswer),model:result.model,llmResult:result,fallback:{delivered:false,error:violation}};
    return{answer:cleaned,model:result.model,llmResult:result,fallback:{delivered:true}};
  }catch(error){
    return{answer:safeFallback(input,fallbackAnswer),model:'deterministic-fallback-v0.4',llmResult:null,fallback:{delivered:false,error:error instanceof Error?error.message:String(error)}};
  }
}

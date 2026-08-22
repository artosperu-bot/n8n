import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { prepareCommercialWriteInput } from '../commercial/CommercialWriteContract.ts';

export type WriterGuardResult = {
  answer: string;
  nextBestAction: string | null;
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
function executesRecommendation(answer:string,product:string):boolean {
  return new RegExp(`\\b(?:te\\s+)?recomiendo\\b[^.!?]{0,45}\\b${escapes(product)}\\b`,'i').test(answer);
}
function executeNba(input:LlmWriteInput,answer:string):string {
  const action=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();
  if(action==='ANSWER_ONLY')return answer;
  if(action==='RECOMMEND'){
    const product=String(input.recommendedProduct??input.state?.recommendedProduct??'').trim();
    return product&&!executesRecommendation(answer,product)?`Te recomiendo ${product}. ${answer}`:answer;
  }
  if(action==='ASK_MISSING_FACT'&&!/[¿?]/.test(answer)){
    const missing=fold(input.missingFact??'');
    const question=missing.includes('uso')?'¿Para qué uso principal lo necesitas?'
      :missing.includes('presupuesto')?'¿Cuál es tu presupuesto máximo?'
      :missing.includes('prioridad')?'¿Qué priorizas más: resistencia, batería o cámara?'
      :'¿Qué criterio pesa más para ti: batería, cámara o resistencia?';
    return `${answer.trim()} ${question}`.trim();
  }
  if(action==='OFFER_ALTERNATIVE'){
    const alternatives=unique(input.alternatives??[]).slice(0,2);
    const namesOne=alternatives.some(product=>new RegExp(`\\b${escapes(product)}\\b`,'i').test(answer));
    return alternatives.length&&!namesOne?`${answer.trim()} Una opción real es ${alternatives.join(' o ')}.`.trim():answer;
  }
  if(action==='SOFT_CLOSE'&&!/[¿?]/.test(answer))return `${answer.trim()} ¿Quieres que revisemos disponibilidad para avanzar?`.trim();
  return answer;
}
function ramProfile(input:LlmWriteInput):{physical:number;virtual:number}|null {
  const evidence=[...(input.rag??[]).map(x=>x.text),...(input.verifiedFacts??[]).map(x=>`${x.key}: ${x.value}`)].join('\n');
  const physical=evidence.match(/\bRAM(?:_FISICA|\s+f[ií]sica)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  const virtual=evidence.match(/\bRAM(?:_VIRTUAL|\s+virtual)\s*[:=]?\s*(?:hasta\s+)?(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  if(!physical||!virtual)return null;
  return{physical:Number(physical.replace(',','.')),virtual:Number(virtual.replace(',','.'))};
}
function conflatesVirtualRam(input:LlmWriteInput,answer:string):boolean {
  const profile=ramProfile(input);if(!profile)return false;
  const total=profile.physical+profile.virtual;
  const claims=[...answer.matchAll(/\b(\d+(?:[.,]\d+)?)\s*GB\s+(?:de\s+)?RAM\b/gi)];
  return claims.some(m=>Number(m[1].replace(',','.'))===total&&!/\bvirtual\b/i.test(answer.slice(m.index??0,(m.index??0)+55)));
}
type NumericClaim={value:number;unit:string;index:number};
function numericClaims(text:string):NumericClaim[]{
  const claims:NumericClaim[]=[];
  const pattern=/\b(\d+(?:[.,]\d+)?)\s*(mAh|GHz|MHz|MP|W|GB|TB|MB|Hz|fps|nm|µm|mm|cm|m\b|min(?:utos?)?|horas?|mes(?:es)?|años?|unidades?|%)/gi;
  for(const match of text.matchAll(pattern)){
    const index=match.index??0;
    const prefix=fold(text.slice(Math.max(0,index-40),index));
    if(/(?:\bno\s+(?:tiene|es|soporta|incluye|trae|cuenta con)|\bsin)\s+[^\d]{0,16}$/.test(prefix))continue;
    const value=Number(match[1].replace(',','.'));
    if(Number.isFinite(value))claims.push({value,unit:fold(match[2]).replace(/s$/,''),index});
  }
  return claims;
}
function hasUnsupportedNumericFact(input:LlmWriteInput,answer:string):boolean{
  const asserted=numericClaims(answer);
  if(!asserted.length)return false;
  const evidence=[...(input.rag??[]).map(x=>x.text),...(input.verifiedFacts??[]).map(x=>String(x.value))].join('\n');
  const supported=numericClaims(evidence);
  const ram=ramProfile(input);
  return asserted.some(claim=>{
    if(supported.some(fact=>fact.unit===claim.unit&&fact.value===claim.value))return false;
    const context=fold(answer.slice(Math.max(0,claim.index-20),claim.index+55));
    const labelledRam=/ram\s+fisica/.test(fold(answer))&&/ram\s+virtual/.test(fold(answer));
    if(ram&&claim.unit==='gb'&&claim.value===ram.physical+ram.virtual&&labelledRam&&/combinad/.test(context))return false;
    return true;
  });
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
  let bulletCount=0;
  return answer
    .split('\n')
    .map(line=>{
      const cleaned=line.replace(/^\s*(?:[-*]\s*)?\*{0,2}(?:Conclusi[oó]n|Datos clave|Consecuencia pr[aá]ctica|Recomendaci[oó]n|Postura|Trade-?off)\*{0,2}\s*:\s*/i,'');
      const bullet=cleaned.match(/^\s*[-*•]\s+(.+)$/);
      if(!bullet)return cleaned.replace(/\*\*/g,'');
      bulletCount+=1;
      return bulletCount<=3?`- ${bullet[1].replace(/\*\*/g,'')}`:'';
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function unsupportedFabInference(input:LlmWriteInput,answer:string):string|null {
  const text=fold(answer);
  const ev=evidenceText(input);
  const displayFluidity=/\b(?:pantalla|desplazamiento|scroll|animacion|navegacion|visual)\b[^\n.]{0,65}\b(?:fluidez|fluido|fluida)\b|\b(?:fluidez|fluido|fluida)\b[^\n.]{0,65}\b(?:pantalla|desplazamiento|scroll|animacion|navegacion|visual)\b/.test(text)
    && /\b(?:frecuencia(?:\s+de\s+refresco)?|refresco|pantalla)\b[^\n.]{0,55}\b\d+(?:[.,]\d+)?\s*hz\b/.test(ev);
  if(/\b(todo el dia|toda la jornada|jornada completa|cubre (?:una|la) jornada|suficiente para (?:un|una) jornada)\b/.test(text)
    && !/\b(autonomia|duracion)\b[^\n.]{0,40}\b\d+(?:[.,]\d+)?\s*(?:h|horas)\b|\btodo el dia\b|\bjornada\b/.test(ev))return 'UNSUPPORTED_AUTONOMY_INFERENCE';
  if(/\b(sin lags?|sin trabas|fluidez|fluido|fluida)\b/.test(text)
    && !displayFluidity
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

  const roboticMeta=/\b(?:cat[aá]logo\s+verificado|evidencia\s+verificada|datos\s+(?:disponibles|suministrados)|seg[uú]n\s+(?:mi|el)\s+sistema(?:\s+interno)?|seg[uú]n\s+el\s+rag|querytarget|\bintent\b)\b/i;
  const internalControl=/\b(?:SOFT_CLOSE|ANSWER_ONLY|ASK_MISSING_FACT|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION|ASSISTED_HANDOFF|RECOMMEND_WITHIN_BUDGET|N\+1)\b/;
  const qaLanguage=/\b(?:no\s+hay\s+evidencia(?:\s+comparativa)?|las\s+fuentes\s+no\s+indican|trade-?off|criterio\s+diferenciador|confidence|score|RAG|oracle|datos\s+recuperados)\b/i;
  const internalSourcing=/\b(?:seg[uú]n\s+(?:la|su|una)\s+ficha\s+t[eé]cnica|ficha\s+t[eé]cnica|seg[uú]n\s+(?:la\s+)?fuente(?:\s+consultada)?|fuente\s+disponible|evidencia(?:\s+(?:disponible|consultada|recuperada|verificada))?)\b/i;
  if(roboticMeta.test(answer)||internalControl.test(answer)||qaLanguage.test(answer)||internalSourcing.test(answer))return 'ROBOTIC_META_LANGUAGE';
  const operational=fold(answer);
  const unsupportedPromise=/\bte\s+agendo\b[^.!?]{0,45}\b(?:prueba|cita)\b|\bte\s+(?:separo|aparto|reservo)\b|\bte\s+(?:envio|mando|preparo)\b[^.!?]{0,45}\b(?:cotizacion|ficha(?:\s+tecnica)?|accesorios?)\b/.test(operational);
  const advisorPromise=/\b(?:te\s+contactar[áa]|te\s+llamar[áa]|te\s+paso|te\s+derivo)\b[^.!?]{0,45}\b(?:un\s+)?asesor\b/.test(operational)
    && input.capabilityAction!=='REQUEST_HUMAN_HANDOFF';
  const stockPromise=/\b(?:reviso|revisamos|revisar|confirmo|confirmamos|confirmar)\b[^.!?]{0,45}\b(?:stock|disponibilidad)\b/.test(operational)
    && input.capabilityAction!=='SOFT_CLOSE_TO_STOCK';
  if(unsupportedPromise||advisorPromise||stockPromise)return 'UNSUPPORTED_OPERATIONAL_PROMISE';
  if((answer.match(/\?/g)??[]).length>1)return 'MULTIPLE_NEXT_STEPS';

  if(String(input.decision?.nextBestAction??'').toUpperCase()==='ANSWER_ONLY'&&/[¿?]/.test(answer))return 'NBA_ANSWER_ONLY_QUESTION';
  const state:any=input.state??{};
  const allowedProducts=unique([...(input.allowedProducts??[]),state.activeProduct,state.queryTarget,state.salientProduct,state.selectedProduct,state.recommendedProduct,...(state.comparisonProducts??[])]);
  if(mentionsProductOutsideAllowlist(answer,allowedProducts))return 'PRODUCT_OUTSIDE_ALLOWLIST';

  const speculative=/\b(?:probablemente|seguramente|posiblemente|quiz[aá]s|tal\s+vez)\b/i;
  if(speculative.test(answer))return 'UNSUPPORTED_SPECULATION';

  const fabViolation=unsupportedFabInference(input,answer);
  if(fabViolation)return fabViolation;
  if(conflatesVirtualRam(input,answer))return 'RAM_VIRTUAL_CONFLATION';
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
      ?'Aún no hay una diferencia clara entre esas opciones.'
      :['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)
        ?'Aún no hay una opción que destaque con claridad.'
        :'No tengo confirmado ese dato exacto.';
  }
  cleaned=executeNba(input,cleaned);
  if(String(input.decision?.nextBestAction??'').toUpperCase()!=='ANSWER_ONLY')return cleaned;
  return stripTrailingQuestion(cleaned)||'No tengo confirmado ese dato exacto.';
}

export async function safeWrite(llm:LlmProvider,input:LlmWriteInput,fallbackAnswer:string):Promise<WriterGuardResult>{
  try{
    const writeInput=input.commercialContractPrepared?input:prepareCommercialWriteInput(input);
    const result=await llm.write(writeInput);
    const cleaned=executeNba(writeInput,cleanPresentation(result.text));
    const violation=guardGeneratedAnswer(writeInput,cleaned);
    if(violation==='NBA_ANSWER_ONLY_QUESTION'){
      const salvaged=stripTrailingQuestion(cleaned);
      if(salvaged&&!guardGeneratedAnswer(writeInput,salvaged))return{answer:salvaged,nextBestAction:writeInput.nextBestAction??null,model:result.model,llmResult:result,fallback:{delivered:true}};
    }
    if(violation)return{answer:safeFallback(writeInput,fallbackAnswer),nextBestAction:writeInput.nextBestAction??null,model:result.model,llmResult:result,fallback:{delivered:false,error:violation}};
    return{answer:cleaned,nextBestAction:writeInput.nextBestAction??null,model:result.model,llmResult:result,fallback:{delivered:true}};
  }catch(error){
    const writeInput=input.commercialContractPrepared?input:prepareCommercialWriteInput(input);
    return{answer:safeFallback(writeInput,fallbackAnswer),nextBestAction:writeInput.nextBestAction??null,model:'deterministic-fallback-v0.4',llmResult:null,fallback:{delivered:false,error:error instanceof Error?error.message:String(error)}};
  }
}

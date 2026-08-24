import type { CommercialMove, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { prepareCommercialWriteInput } from '../commercial/CommercialWriteContract.ts';
import { requestedUnsupportedCapability } from '../commercial/CommercialCapabilities.ts';
import { renderCommercialMove, renderVerifiedFact } from '../commercial/ResponsePolicy.ts';

export type WriterGuardResult = {
  answer: string;
  nextBestAction: string | null;
  missingFact: string | null;
  model: string;
  llmResult: LlmResult | null;
  fallback: { delivered: boolean; error?: string };
  commercialMoveKind?:CommercialMove['kind']|null;
  recommendationContinuity?:{
    changed:boolean;
    from:string|null;
    to:string|null;
    reason:string|null;
    communicated:boolean;
    allowed:boolean;
    effectiveRecommendedProduct:string|null;
  };
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
  for(const row of signatures){const models=byPrefix.get(row.prefix)??new Set<string>();models.add(row.model);byPrefix.set(row.prefix,models);}
  const text=fold(answer);
  for(const [prefix,models] of byPrefix){
    const pattern=new RegExp(`\\b${escapes(prefix).replace(/\\ /g,'\\s+')}\\s+([a-z0-9-]*\\d[a-z0-9-]*)\\b`,'g');
    for(const match of text.matchAll(pattern))if(!models.has(match[1]))return true;
  }
  return false;
}
function evidenceText(input:LlmWriteInput):string {return fold((input.rag??[]).map(x=>x.text).join('\n'));}
function executesRecommendation(answer:string,product:string):boolean {return new RegExp(`\\b(?:te\\s+)?recomiendo\\b[^.!?]{0,45}\\b${escapes(product)}\\b`,'i').test(answer);}
function questionConsumesMissingFact(input:LlmWriteInput,answer:string):boolean{
  const question=fold(answer);const missing=fold(input.missingFact??'');
  return missing.includes('uso')?/\buso\b|para que/.test(question)
    :missing.includes('problema')?/\bproblema\b|que te pasa/.test(question)
    :/prioridad|criterio/.test(missing)?/prioridad|priorizas|importa|criterio|pesa mas/.test(question)
    :/presupuesto|tope/.test(missing)?/presupuesto|tope|hasta cuanto|cuanto (?:quieres|puedes|buscas) (?:llegar|gastar|pagar)/.test(question)
    :/modelo|producto/.test(missing)?/modelo|producto|equipo|celular/.test(question)
    :false;
}
function humanizeCommercialFact(value:string):string{return value.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function acknowledgeKnownContext(input:LlmWriteInput,answer:string):string{
  const state:any=input.state??{};const priorities=unique(input.priorities??state.priorities??[]);const problem=String(input.problem??state.problem??'').trim();const useCase=String(input.useCase??state.useCase??'').trim();
  if(!priorities.length&&!problem&&!useCase)return answer;
  const beforeQuestion=fold(answer.split('¿')[0]??'');
  const knownTokens=unique([...priorities,problem,useCase]).flatMap(value=>fold(humanizeCommercialFact(value)).split(/\s+/)).filter(token=>token.length>=5&&!['principal','frecuentes'].includes(token));
  if(knownTokens.some(token=>beforeQuestion.includes(token)))return answer;
  const acknowledgement=useCase?`Entiendo, lo buscas para ${humanizeCommercialFact(useCase)}.`:problem?`Entiendo, quieres resolver ${humanizeCommercialFact(problem)}.`:priorities[0]?`Entiendo, priorizas ${humanizeCommercialFact(priorities[0])}.`:'';
  return acknowledgement?`${acknowledgement} ${answer}`.trim():answer;
}
function executeNba(input:LlmWriteInput,answer:string):string {
  const action=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();
  if(action==='ANSWER_ONLY'||action==='RELATED_VALUE')return answer;
  if(action==='RECOMMEND'){
    const product=String(input.recommendedProduct??input.state?.recommendedProduct??'').trim();
    return product&&!executesRecommendation(answer,product)?`Te recomiendo ${product}. ${answer}`:answer;
  }
  if(action==='ASK_MISSING_FACT'){
    let response=answer.trim();
    if(String(input.intent??'').toUpperCase()==='HANDLE_PRICE_OBJECTION'&&!/entiendo|claro|se sale|ajust|c[oó]mod|alto|caro/i.test(response))response=`Entiendo; busquemos una opción que se ajuste mejor. ${response}`.trim();
    if(/[¿?]/.test(response))return acknowledgeKnownContext(input,response);
    const missing=fold(input.missingFact??'');
    const question=missing.includes('uso')?'¿Para qué uso principal lo necesitas?':missing.includes('presupuesto')?'¿Cuál es tu presupuesto máximo?':missing.includes('prioridad')?'¿Qué priorizas más: resistencia, batería o cámara?':'¿Qué criterio pesa más para ti: batería, cámara o resistencia?';
    return acknowledgeKnownContext(input,`${response} ${question}`.trim());
  }
  if(action==='OFFER_ALTERNATIVE'){
    const alternatives=unique(input.alternatives??[]).slice(0,2);const namesOne=alternatives.some(product=>new RegExp(`\\b${escapes(product)}\\b`,'i').test(answer));
    return alternatives.length&&!namesOne?`${answer.trim()} Una opción real es ${alternatives.join(' o ')}.`.trim():answer;
  }
  if(action==='SOFT_CLOSE'&&!/[¿?]/.test(answer))return `${answer.trim()} ¿Quieres que revisemos disponibilidad para avanzar?`.trim();
  return answer;
}

type RecommendationContinuity=NonNullable<WriterGuardResult['recommendationContinuity']>;
function continuityState(input:LlmWriteInput,answer:string):RecommendationContinuity{
  const from=String(input.previousRecommendedProduct??'').trim()||null;const to=String(input.recommendedProduct??input.state?.recommendedProduct??'').trim()||null;
  const changed=Boolean((input.recommendationChanged??(from&&to&&!sameFold(from,to)))&&from&&to&&!sameFold(from,to));const reason=String(input.recommendationChangeReason??'').trim()||null;
  if(!changed)return{changed:false,from,to,reason:null,communicated:true,allowed:true,effectiveRecommendedProduct:to??from};
  const text=fold(answer);const changeCue=/\b(?:cambio|cambia|cambiar|cambiaria|ahora (?:te )?recomiendo|nueva recomendacion)\b/.test(text);const mentionsTransition=Boolean(from&&to&&text.includes(fold(from))&&text.includes(fold(to)));
  const reasonTokens=fold(reason??'').split(/[^a-z0-9]+/).filter(token=>token.length>=5||/^\d+$/.test(token));const explainsReason=Boolean(reason&&reasonTokens.some(token=>text.includes(token)));const communicated=Boolean(changeCue&&mentionsTransition&&explainsReason);
  return{changed:true,from,to,reason,communicated,allowed:Boolean(reason&&communicated),effectiveRecommendedProduct:reason&&communicated?to:from};
}
function sameFold(a:string,b:string):boolean{return fold(a)===fold(b);}
function blockedContinuityAnswer(input:LlmWriteInput):string{return cleanPresentation(String(input.directAnswer??''))||'Necesito reevaluar la recomendación con información verificable antes de avanzar.';}
function communicateRecommendationChange(input:LlmWriteInput,answer:string):string{
  const continuity=continuityState(input,answer);if(!continuity.changed||continuity.communicated||!continuity.from||!continuity.to||!continuity.reason)return answer;
  return `Con la nueva información, cambio mi recomendación de ${continuity.from} a ${continuity.to}: ${continuity.reason}. ${answer}`.trim();
}
function ramProfile(input:LlmWriteInput):{physical:number;virtual:number}|null {
  const evidence=[...(input.rag??[]).map(x=>x.text),...(input.verifiedFacts??[]).map(x=>`${x.key}: ${x.value}`)].join('\n');
  const physical=evidence.match(/\bRAM(?:_FISICA|\s+f[ií]sica)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  const virtual=evidence.match(/\bRAM(?:_VIRTUAL|\s+virtual)(?:\s+m[aá]xima)?\s*[:=]?\s*(?:hasta\s+)?(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1];
  if(!physical||!virtual)return null;return{physical:Number(physical.replace(',','.')),virtual:Number(virtual.replace(',','.'))};
}
function conflatesVirtualRam(input:LlmWriteInput,answer:string):boolean {
  const profile=ramProfile(input);if(!profile)return false;const total=profile.physical+profile.virtual;const claims=[...answer.matchAll(/\b(\d+(?:[.,]\d+)?)\s*GB\s+(?:de\s+)?RAM\b/gi)];
  return claims.some(m=>Number(m[1].replace(',','.'))===total&&!/\bvirtual\b/i.test(answer.slice(m.index??0,(m.index??0)+55)));
}
function omitsRamComponent(input:LlmWriteInput,answer:string):boolean{const profile=ramProfile(input);if(!profile||! /\bram\b/i.test(input.message))return false;const text=fold(answer);return !/ram fisica/.test(text)||!/ram virtual/.test(text);}
type NumericClaim={value:number;unit:string;index:number};
function numericClaims(text:string):NumericClaim[]{
  const claims:NumericClaim[]=[];const pattern=/\b(\d+(?:[.,]\d+)?)\s*(mAh|GHz|MHz|MP|W|GB|TB|MB|Hz|fps|nm|µm|kg|g\b|mm|cm|m\b|min(?:utos?)?|horas?|mes(?:es)?|años?|unidades?|%)/gi;
  for(const match of text.matchAll(pattern)){const index=match.index??0;const prefix=fold(text.slice(Math.max(0,index-40),index));if(/(?:\bno\s+(?:tiene|es|soporta|incluye|trae|cuenta con)|\bsin)\s+[^\d]{0,16}$/.test(prefix))continue;const value=Number(match[1].replace(',','.'));if(Number.isFinite(value))claims.push({value,unit:fold(match[2]).replace(/s$/,''),index});}
  return claims;
}
function hasUnsupportedNumericFact(input:LlmWriteInput,answer:string):boolean{
  const asserted=numericClaims(answer);if(!asserted.length)return false;const evidence=[...(input.rag??[]).map(x=>x.text),...(input.verifiedFacts??[]).map(x=>String(x.value))].join('\n');const supported=numericClaims(evidence);const ram=ramProfile(input);
  return asserted.some(claim=>{if(supported.some(fact=>fact.unit===claim.unit&&fact.value===claim.value))return false;const context=fold(answer.slice(Math.max(0,claim.index-20),claim.index+55));const labelledRam=/ram\s+fisica/.test(fold(answer))&&/ram\s+virtual/.test(fold(answer));if(ram&&claim.unit==='gb'&&claim.value===ram.physical+ram.virtual&&labelledRam&&/combinad/.test(context))return false;return true;});
}
function monetaryValues(text:string):string[]{return [...text.matchAll(/\bS\/\s*(\d+(?:[.,]\d{1,2})?)/gi)].map(m=>String(Number(m[1].replace(',','.'))));}
function moneySupported(input:LlmWriteInput,answer:string,domain?:'INSTITUTIONAL'):boolean {
  const values=monetaryValues(answer);if(!values.length)return true;const rag=(input.rag??[]).filter(x=>!domain||x.domain===domain).map(x=>x.text).join('\n');const facts=(input.verifiedFacts??[]).filter(x=>!domain||x.domain===domain).map(x=>`${x.key}=${x.value}`).join('\n');const quote=input.quote?.price==null?'':`S/ ${input.quote.price}`;const supported=new Set(monetaryValues(`${rag}\n${facts}\n${quote}`));return values.every(v=>supported.has(v));
}
function normalizeAvailabilityPresentation(answer:string):string{return answer.replace(/\b(?:adem[aá]s|tambi[eé]n)\s*:\s*DISPONIBLE\b\.?/gi,'También está disponible.').replace(/\b(?:adem[aá]s|tambi[eé]n)\s*:\s*NO_DISPONIBLE\b\.?/gi,'No está disponible.').replace(/(?:También est[aá] disponible\.\s*){2,}/gi,'También está disponible. ').replace(/(?:No est[aá] disponible\.\s*){2,}/gi,'No está disponible. ').replace(/[ \t]{2,}/g,' ').trim();}
function cleanPresentation(answer:string):string {
  let bulletCount=0;const cleaned=answer.split('\n').map(line=>{const normalized=line.replace(/^\s*(?:[-*]\s*)?\*{0,2}(?:Conclusi[oó]n|Datos clave|Consecuencia pr[aá]ctica|Recomendaci[oó]n|Postura|Trade-?off)\*{0,2}\s*:\s*/i,'');const bullet=normalized.match(/^\s*[-*•]\s+(.+)$/);if(!bullet)return normalized.replace(/\*\*/g,'');bulletCount+=1;return bulletCount<=3?`- ${bullet[1].replace(/\*\*/g,'')}`:'';}).filter(Boolean).join('\n').replace(/\n{3,}/g,'\n\n').trim();return normalizeAvailabilityPresentation(cleaned);
}
function trailingQuestion(answer:string):string|null{const questions=[...answer.matchAll(/¿[^?]{1,180}\?/g)].map(match=>match[0].trim());return questions.at(-1)??null;}
function truncateNatural(text:string,max:number):string{const compact=text.replace(/\s+/g,' ').trim();if(compact.length<=max)return compact;const cut=compact.slice(0,max);const boundary=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; '),cut.lastIndexOf(', '),cut.lastIndexOf(' '));return `${cut.slice(0,boundary>Math.floor(max*0.65)?boundary:max).trimEnd()}…`;}
function compactUseCase(value:string|null|undefined):string|null{
  let text=String(value??'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();if(!text)return null;
  text=text.replace(/^\s*(?:uso(?:\s+cotidiano|\s+diario|\s+b[aá]sico|\s+principal)*|caso\s+de\s+uso)\s+(?:en|para)\s+/i,'').replace(/^\s*(?:usar|utilizar)\s+(?:el\s+)?(?:celular|equipo|tel[eé]fono)\s+(?:principalmente\s+)?para\s+/i,'').replace(/\brealizar\s*\/\s*recibir\s+llamadas\b/ig,'llamadas').replace(/\bmensajer[ií]a\s+(?:por\s+)?WhatsApp\b/ig,'WhatsApp');
  if(/whatsapp/i.test(text)&&/llamadas?/i.test(text))return 'WhatsApp y llamadas';return truncateNatural(text.split(/[;|]/,1)[0],70);
}
function compactRecommendationPresentation(input:LlmWriteInput,answer:string):string{
  const intent=String(input.intent??'').toUpperCase();if(!['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent))return answer;
  const question=trailingQuestion(answer)??(String(input.nextBestAction??'').toUpperCase()==='SOFT_CLOSE'?'¿Quieres que revisemos disponibilidad para avanzar?':null);
  const product=String(input.recommendedProduct??input.state?.recommendedProduct??'').trim();const state:any=input.state??{};const budget=input.budget??state.budget??null;const useCase=compactUseCase(input.useCase??state.useCase??null);
  const technicalDump=answer.length>300||/\b(?:bandas?|802\.11|USB\s*Type|ranuras?|FDD-LTE|WCDMA|GSM)\b/i.test(answer)||/^\s*[-*•]\s+/m.test(answer);
  if(technicalDump&&product){
    const reasons:string[]=[];if(budget!=null)reasons.push('entra dentro del presupuesto que me diste');if(useCase)reasons.push(`es la opción que seguiría evaluando para ${useCase}`);
    const lead=`Te recomiendo ${product}. ${reasons.length?`${reasons.join(' y ')}.`:'Es la opción que mejor encaja con los criterios ya confirmados.'}`;
    return [lead,question].filter(Boolean).join(' ').trim();
  }
  const withoutQuestion=question?answer.replace(question,'').trim():answer.trim();const leadLines=withoutQuestion.split('\n').map(line=>line.trim()).filter(line=>line&&!/^[-*•]\s+/.test(line));let lead=leadLines.join(' ').trim();const sentences=lead.split(/(?<=[.!?])\s+/).filter(Boolean);lead=truncateNatural(sentences.slice(0,2).join(' '),260);if(product&&!new RegExp(escapes(product),'i').test(lead))lead=`Te recomiendo ${product}. ${lead}`.trim();return [lead,question].filter(Boolean).join(' ').trim();
}
function focusedCapabilityFact(input:LlmWriteInput):string|null{
  const message=fold(input.message);const product=String(input.resolvedProduct??input.state?.queryTarget??input.state?.activeProduct??'').trim();
  if(/\bram\b/.test(message)){const ram=ramProfile(input);if(!ram)return null;const physical=Number.isInteger(ram.physical)?String(ram.physical):String(ram.physical).replace('.',',');const virtual=Number.isInteger(ram.virtual)?String(ram.virtual):String(ram.virtual).replace('.',',');return `Tiene ${physical} GB de RAM física + hasta ${virtual} GB de RAM virtual.`;}
  const broadResistance=/\b(?:agua|polvo|ip68|ip69|mil|resisten|proteccion)\b/.test(message);
  if(/\b(?:caida|caidas|golpe|golpes)\b/.test(message)&&!broadResistance){
    const rows=[...(input.commercialMove?.verifiedFacts??[]),...(input.verifiedFacts??[])];const atomic=rows.find(row=>String(row.key??'').toUpperCase()==='RESISTENCIA_CAIDAS');
    if(atomic){const value=String(atomic.value??'').trim();return value?`${product?`${product} `:''}tiene resistencia a caídas de ${value.replace(/[.!?]+$/,'')}.`:null;}
    const candidate=rows.find(row=>/CAID|IMPACT|RESIST/.test(String(row.key??'').toUpperCase())||/resistencia\s+a\s+ca[ií]das?/i.test(String(row.value??'')));if(!candidate)return null;const raw=String(candidate.value??'').replace(/\s+/g,' ').trim();const match=raw.match(/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*m\b/i);if(!match)return null;return `${product?`${product} `:''}tiene resistencia a caídas de ${match[1]} m.`;
  }
  return null;
}
function compactFocusedCapabilityPresentation(input:LlmWriteInput,answer:string):string{const intent=String(input.intent??'').toUpperCase();if(!['CAPABILITY','ATTRIBUTE'].includes(intent))return answer;const focused=focusedCapabilityFact(input);return focused??answer;}
function compactComparisonPresentation(input:LlmWriteInput,answer:string):string{
  if(String(input.intent??'').toUpperCase()!=='COMPARE'||answer.length<=750)return answer;const lines=answer.split('\n').map(line=>line.trim()).filter(Boolean);const leadRaw=lines.find(line=>!/^[-*•]\s+/.test(line))??'';const lead=leadRaw.length>180?`${leadRaw.slice(0,177).trimEnd()}…`:leadRaw;const bullets=lines.filter(line=>/^[-*•]\s+/.test(line)).slice(0,3).map(line=>`- ${line.replace(/^[-*•]\s+/,'').replace(/\*\*/g,'')}`);let compact=bullets.length?[lead,...bullets].filter(Boolean).join('\n'):cleanPresentation(answer).split(/(?<=[.!?])\s+/).slice(0,4).join(' ');if(compact.length>750){const cut=compact.slice(0,747);const boundary=cut.lastIndexOf(' ');compact=`${cut.slice(0,boundary>620?boundary:747).trimEnd()}…`;}return compact;
}
function unsupportedFabInference(input:LlmWriteInput,answer:string):string|null {
  const text=fold(answer);const ev=evidenceText(input);const displayFluidity=/\b(?:pantalla|desplazamiento|scroll|animacion|navegacion|visual)\b[^\n.]{0,65}\b(?:fluidez|fluido|fluida)\b|\b(?:fluidez|fluido|fluida)\b[^\n.]{0,65}\b(?:pantalla|desplazamiento|scroll|animacion|navegacion|visual)\b/.test(text)&&/\b(?:frecuencia(?:\s+de\s+refresco)?|refresco|pantalla)\b[^\n.]{0,55}\b\d+(?:[.,]\d+)?\s*hz\b/.test(ev);
  if(/\b(todo el dia|toda la jornada|jornada completa|cubre (?:una|la) jornada|suficiente para (?:un|una) jornada)\b/.test(text)&&!/\b(autonomia|duracion)\b[^\n.]{0,40}\b\d+(?:[.,]\d+)?\s*(?:h|horas)\b|\btodo el dia\b|\bjornada\b/.test(ev))return 'UNSUPPORTED_AUTONOMY_INFERENCE';
  if(/\b(sin lags?|sin trabas|fluidez|fluido|fluida)\b/.test(text)&&!displayFluidity&&!/\b(benchmark|antutu|geekbench|fluidez|lag|prueba de rendimiento|rendimiento medido)\b/.test(ev))return 'UNSUPPORTED_PERFORMANCE_INFERENCE';
  if(/\b(gps|localizacion|ubicacion)\b[^\n.]{0,55}\b(mas estable|estable|precision|preciso|mantener fijad[oa])\b|\b(mas estable|precision|preciso)\b[^\n.]{0,55}\b(gps|localizacion|ubicacion)\b/.test(text)&&!/\b(precision|accuracy|rms|estable|estabilidad|error de posicion)\b/.test(ev))return 'UNSUPPORTED_GPS_INFERENCE';
  if(/\b(graba|video)\b[^\n.]{0,55}\b(buen|mejor|alta calidad|detalle|detallado)\b|\b(buen|mejor)\s+video\b/.test(text)&&!/\bvideo\b[^\n.]{0,80}\b(720p|1080p|2k|4k|fps|estabilizacion|eis|ois|bitrate|calidad)\b/.test(ev))return 'UNSUPPORTED_VIDEO_INFERENCE';
  if(/\b(miles de fotos|horas de video|miles de imagenes)\b/.test(text)&&!/\b(miles de fotos|horas de video|cantidad de fotos|duracion de video)\b/.test(ev))return 'UNSUPPORTED_STORAGE_ESTIMATE';
  const appClaim=/\b(?:compatible|compatibilidad|soporta|funciona|instalar|instala|puedes usar|corre)\b[^\n.]{0,55}\b(?:whatsapp|tiktok|instagram|facebook)\b|\b(?:whatsapp|tiktok|instagram|facebook)\b[^\n.]{0,55}\b(?:compatible|soporta|funciona|instalar|instala|puedes usar|corre)\b/.test(text);if(appClaim&&!/(\bwhatsapp\b|\btiktok\b|\binstagram\b|\bfacebook\b|\bandroid\b|\bgoogle play\b|\bplay store\b)/.test(ev))return 'UNSUPPORTED_APP_COMPATIBILITY';return null;
}
function guardGeneratedAnswer(input:LlmWriteInput,answer:string):string|null {
  const intent=String(input.intent??'').toUpperCase();const explicitPrice=['PRICE','QUOTE','PRICE_AVAILABILITY'].includes(intent);const evidenceBoundPrice=['RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)&&moneySupported(input,answer);const institutionalPrice=['POLICY','WARRANTY'].includes(intent)&&moneySupported(input,answer,'INSTITUTIONAL');if(!explicitPrice&&!evidenceBoundPrice&&!institutionalPrice&&/\bS\/\s*\d/i.test(answer))return 'UNSOLICITED_PRICE';
  const unverifiedAction=/(?:ya\s+reserv(?:e|é)|reserva\s+(?:quedo|quedó|confirmada)|pedido\s+(?:creado|registrado)|compra\s+(?:realizada|confirmada))/i;if(unverifiedAction.test(answer))return 'UNVERIFIED_ACTION';const stockLeak=/(?:stock|disponib)[^\n.]{0,35}\b\d+\s*(?:unidades?|uds?)\b|\b\d+\s*(?:unidades?|uds?)\b[^\n.]{0,35}(?:stock|disponib)/i;if(stockLeak.test(answer))return 'RAW_STOCK_QUANTITY';
  const roboticMeta=/\b(?:cat[aá]logo\s+verificado|evidencia\s+verificada|datos\s+(?:disponibles|suministrados)|seg[uú]n\s+(?:mi|el)\s+sistema(?:\s+interno)?|seg[uú]n\s+el\s+rag|querytarget|\bintent\b)\b/i;const internalControl=/\b(?:SOFT_CLOSE|ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION|ASSISTED_HANDOFF|RECOMMEND_WITHIN_BUDGET|N\+1)\b/;const qaLanguage=/\b(?:no\s+hay\s+evidencia(?:\s+comparativa)?|las\s+fuentes\s+no\s+indican|trade-?off|criterio\s+diferenciador|confidence|score|RAG|oracle|datos\s+recuperados)\b/i;const internalSourcing=/\b(?:seg[uú]n\s+(?:la|su|una)\s+ficha\s+t[eé]cnica|ficha\s+t[eé]cnica|seg[uú]n\s+(?:la\s+)?fuente(?:\s+consultada)?|fuente\s+disponible|evidencia(?:\s+(?:disponible|consultada|recuperada|verificada))?)\b/i;if(roboticMeta.test(answer)||internalControl.test(answer)||qaLanguage.test(answer)||internalSourcing.test(answer))return 'ROBOTIC_META_LANGUAGE';
  const operational=fold(answer);const unsupportedPromise=/\b(?:(?:puedo|podemos|voy\s+a|vamos\s+a|te\s+)?\s*)?(?:agend(?:ar|o|amos|a)|program(?:ar|o|amos|a))\w*\b[^.!?;]{0,45}\b(?:prueba|demo|demostracion|cita)\b|\b(?:yo\s+)?coordino\b|\bte\s+confirmo\s+(?:luego|despues|mas\s+tarde)\b|\bte\s+(?:separo|aparto|reservo)\b|\b(?:(?:puedo|podemos)\s+)?(?:te\s+)?(?:envio|mando|preparo|enviare|mandare)\b[^.!?]{0,45}\b(?:cotizacion|ficha(?:\s+tecnica)?|accesorios?)\b/.test(operational);const advisorPromise=/\b(?:te\s+contactar[áa]|te\s+llamar[áa]|te\s+paso|te\s+derivo)\b[^.!?]{0,45}\b(?:un\s+)?asesor\b/.test(operational)&&input.capabilityAction!=='REQUEST_HUMAN_HANDOFF';const stockPromise=/\b(?:reviso|revisamos|revisar|confirmo|confirmamos|confirmar)\b[^.!?]{0,45}\b(?:stock|disponibilidad)\b/.test(operational)&&input.capabilityAction!=='SOFT_CLOSE_TO_STOCK';if(unsupportedPromise||advisorPromise||stockPromise)return 'UNSUPPORTED_OPERATIONAL_PROMISE';if((answer.match(/\?/g)??[]).length>1)return 'MULTIPLE_NEXT_STEPS';
  const executableNba=String(input.executableNba??input.nextBestAction??input.decision?.nextBestAction??'ANSWER_ONLY').toUpperCase();if(executableNba==='RELATED_VALUE'&&!commercialMoveDelivered(input,answer))return 'COMMERCIAL_MOVE_NOT_DELIVERED';const hasQuestion=/[¿?]/.test(answer);const state:any=input.state??{};const allowedProducts=unique([...(input.allowedProducts??[]),state.activeProduct,state.queryTarget,state.salientProduct,state.selectedProduct,state.recommendedProduct,...(state.comparisonProducts??[])]);if(mentionsProductOutsideAllowlist(answer,allowedProducts))return 'PRODUCT_OUTSIDE_ALLOWLIST';
  const recommendationCta=/\b(?:te\s+)?recomiendo\b|\bmi\s+recomendaci[oó]n\s+es\b/i.test(answer);const alternativeCta=/\b(?:otra|una)\s+(?:alternativa|opci[oó]n)\s+(?:es|ser[ií]a)\b|\bpuedo\s+ofrecerte\b/i.test(answer);const recommendedProduct=String(input.recommendedProduct??state.recommendedProduct??'').trim();const verifiedRecommendation=Boolean(recommendedProduct&&allowedProducts.some(product=>sameFold(product,recommendedProduct)));const recommendationAuthorized=executableNba==='RECOMMEND'||(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)&&verifiedRecommendation);if(recommendationCta&&!recommendationAuthorized)return 'UNAUTHORIZED_COMMERCIAL_ACTION';if(alternativeCta&&executableNba!=='OFFER_ALTERNATIVE')return 'UNAUTHORIZED_COMMERCIAL_ACTION';
  if(hasQuestion&&executableNba==='ASK_MISSING_FACT'){if(!questionConsumesMissingFact(input,answer))return 'UNPROCESSABLE_QUESTION';}else if(hasQuestion&&executableNba!=='ANSWER_ONLY'&&!['SOFT_CLOSE','COLLECT_RESERVATION_DATA'].includes(executableNba))return 'UNAUTHORIZED_CTA';if(executableNba==='ANSWER_ONLY'&&hasQuestion)return 'NBA_ANSWER_ONLY_QUESTION';const speculative=/\b(?:probablemente|seguramente|posiblemente|quiz[aá]s|tal\s+vez)\b/i;if(speculative.test(answer))return 'UNSUPPORTED_SPECULATION';const fabViolation=unsupportedFabInference(input,answer);if(fabViolation)return fabViolation;if(conflatesVirtualRam(input,answer))return 'RAM_VIRTUAL_CONFLATION';if(omitsRamComponent(input,answer))return 'RAM_COMPONENT_OMISSION';if(hasUnsupportedNumericFact(input,answer))return 'UNSUPPORTED_NUMERIC_FACT';
  const lowLightClaim=/\b(?:mejor|superior|mucho\s+mejor|mayor)\b[^\n.]{0,55}\b(?:baja|poca)\s+luz\b|\b(?:baja|poca)\s+luz\b[^\n.]{0,55}\b(?:mejor|superior)\b/i;if(lowLightClaim.test(answer)){const ev=evidenceText(input);if(!/(baja|poca)\s+luz|low.?light|lux/.test(ev))return 'UNSUPPORTED_LOW_LIGHT_INFERENCE';}const superlative=/\b(?:el|la)\s+m[aá]s\s+(?:resistente|potente|r[aá]pido|econ[oó]mico)|\b(?:la|el)\s+mejor\s+(?:opci[oó]n|bater[ií]a|c[aá]mara|rendimiento|resistencia)\b/i;if(superlative.test(answer)){const productIds=new Set((input.rag??[]).map(x=>String(x.productId??'').trim()).filter(Boolean));if(productIds.size<2)return 'UNSUPPORTED_SUPERLATIVE';}return null;
}
function commercialMoveDelivered(input:LlmWriteInput,answer:string):boolean{
  const move=input.commercialMove;if(!move)return false;const text=fold(answer);if(move.kind==='STOCK_STATUS'){const status=move.verifiedFacts.find(fact=>fact.key==='DISPONIBILIDAD')?.value;return status==='DISPONIBLE'?/\b(?:esta|sigue)\s+disponible\b|\bhay\s+(?:stock|disponibilidad|unidades?)\b|\btenemos\s+(?:stock|disponibilidad)\b/.test(text):status==='NO_DISPONIBLE'?/\bno\s+(?:esta\s+)?disponible\b|\bsin\s+stock\b|\bno\s+hay\s+stock\b/.test(text):false;}
  if(move.kind==='CONTEXTUAL_BENEFIT'){
    const rendered=renderCommercialMove(move,input.intent);if(rendered&&text.includes(fold(rendered)))return true;
    const semantic=fold(`${move.attribute??''} ${move.verifiedFacts.map(fact=>`${fact.key} ${fact.value}`).join(' ')}`);
    if(/nfc|google pay/.test(semantic)&&/nfc|google pay/.test(text)&&/contactless|pago/.test(text))return true;
    if(/nocturn|camara/.test(semantic)&&/nocturn/.test(text)&&/captur|noche/.test(text))return true;
    if(/termic/.test(semantic)&&/termic/.test(text)&&/rango|inspeccion|temperatura/.test(text))return true;
    if(/5g|4g|lte|red/.test(semantic)&&/(5g|4g lte)/.test(text))return true;
    const context=move.relevantCustomerContext;const contextGroups=unique([context.useCase,context.problem,...context.priorities,context.objection]).map(value=>fold(value).replace(/[_-]+/g,' ').split(/\s+/).filter(token=>token.length>=4&&!['para','principal'].includes(token))).filter(tokens=>tokens.length);const factTokens=move.verifiedFacts.flatMap(fact=>fold(fact.value).split(/[^a-z0-9.,]+/)).filter(token=>token.length>=3||/\d/.test(token));if(contextGroups.some(tokens=>tokens.every(token=>text.includes(token)))&&factTokens.some(token=>text.includes(token))&&/\b(?:util|ayuda|sirve|conviene|encaja|adecuad[oa]|ideal|permite|facilita|reduce|protege|proteccion|te da|da mas margen)\b/.test(text))return true;return false;
  }
  if(move.kind==='RELATED_VERIFIED_FACT'&&move.verifiedFacts[0]?.key==='PRECIO'&&String(input.intent).toUpperCase()==='STOCK')return /\bprecio\b/.test(text);return move.verifiedFacts.some(fact=>fold(answer).includes(fold(fact.value)));
}
function continuationAddsNewInformation(answer:string,continuation:string):boolean{
  const compact=fold(continuation).replace(/^ademas\s+/,'').trim();if(!compact||/^(?:si|no)[.!]?$/.test(compact))return false;
  const stop=new Set(['ademas','tambien','este','esta','esto','dato','punto','valor','para','porque','justo','funcion','confirmar','prioridad']);
  const answerText=fold(answer);const tokens=compact.split(/[^a-z0-9]+/).filter(token=>token.length>=4&&!stop.has(token));
  return tokens.some(token=>!answerText.includes(token));
}
function preserveCommercialMove(input:LlmWriteInput,answer:string):string{
  if(String(input.nextBestAction??'').toUpperCase()!=='RELATED_VALUE'||commercialMoveDelivered(input,answer))return answer;let continuation=renderCommercialMove(input.commercialMove??null,input.intent);if(!continuation||!continuationAddsNewInformation(answer,continuation))return answer;if(input.commercialMove?.kind==='CONTEXTUAL_BENEFIT'&&!/^\s*(?:adem[aá]s|tambi[eé]n)\b/i.test(continuation)){continuation=`Además, ${continuation.charAt(0).toLocaleLowerCase('es')}${continuation.slice(1)}`;}return `${answer.trim()} ${continuation}`.trim();
}
function directAnswerDelivered(input:LlmWriteInput,directAnswer:string,answer:string):boolean{
  const message=fold(input.message);if(/\bram\b/.test(message))return !omitsRamComponent(input,answer);if(/\b(?:caida|caidas|golpe|golpes)\b/.test(message)){const wanted=numericClaims(directAnswer).find(claim=>claim.unit==='m');if(!wanted)return /caida|golpe/i.test(answer);return numericClaims(answer).some(claim=>claim.unit==='m'&&claim.value===wanted.value)&&/caida|golpe/i.test(answer);}const required=numericClaims(directAnswer);if(required.length){const actual=numericClaims(answer);return required.every(wanted=>actual.some(value=>value.value===wanted.value&&value.unit===wanted.unit));}const ignored=new Set(['este','esta','tiene','para','sobre','producto','equipo','armor']);const tokens=fold(directAnswer).split(/[^a-z0-9]+/).filter(token=>token.length>=4&&!ignored.has(token));const text=fold(answer);return tokens.length>0&&tokens.slice(0,4).every(token=>text.includes(token));
}
function preserveDirectAnswer(input:LlmWriteInput,answer:string):string{const direct=cleanPresentation(String(input.directAnswer??''));if(!direct||directAnswerDelivered(input,direct,answer))return answer;return `${direct} ${answer.trim()}`.trim();}
function stripTrailingQuestion(answer:string):string {const text=answer.trim();const inverted=text.indexOf('¿');if(inverted>0)return text.slice(0,inverted).trim();if(inverted===0)return '';const questionEnd=text.lastIndexOf('?');if(questionEnd<0)return text;const before=text.slice(0,questionEnd);const boundary=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),before.lastIndexOf('\n'));return boundary>=0?before.slice(0,boundary+1).trim():'';}
function internalFallback(answer:string):boolean{return /\b(?:SOFT_CLOSE|ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION|ASSISTED_HANDOFF|RECOMMEND_WITHIN_BUDGET|N\+1)\b|\bcompara\b[^.]{0,90}\bde forma sim[eé]trica\b/i.test(answer);}
function safeFallback(input:LlmWriteInput,fallbackAnswer:string):string {
  if(requestedUnsupportedCapability(input.message)){const refusal=/\b(?:prueba|demo|demostraci[oó]n|cita)\b/i.test(input.message)?'No tengo habilitada una agenda de pruebas desde aquí.':'No tengo habilitada esa gestión desde aquí.';const direct=cleanPresentation(String(input.directAnswer??''));return direct?`${direct} ${refusal}`:refusal;}
  const ram=ramProfile(input);const providedFallback=cleanPresentation(fallbackAnswer);const genericFit=/^(?:Esa opci[oó]n encaja con los criterios indicados|Listo, tomo esa informaci[oó]n como referencia)\.?$/i;const groundedDirect=cleanPresentation(String(input.directAnswer??''));let cleaned=groundedDirect||(providedFallback&&!genericFit.test(providedFallback)?providedFallback:'');if(ram&&/\bram\b/i.test(input.message)){const physical=Number.isInteger(ram.physical)?String(ram.physical):String(ram.physical).replace('.',',');const virtual=Number.isInteger(ram.virtual)?String(ram.virtual):String(ram.virtual).replace('.',',');cleaned=`Tiene ${physical} GB de RAM física + hasta ${virtual} GB de RAM virtual.`;}const focused=focusedCapabilityFact(input);if(focused)cleaned=focused;if(!cleaned)cleaned=cleanPresentation(fallbackAnswer);const action=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();if(action==='RELATED_VALUE'&&input.commercialMove?.kind==='CONTEXTUAL_BENEFIT'&&genericFit.test(cleaned)){cleaned=renderVerifiedFact(input.commercialMove.verifiedFacts[0])??cleaned;}const factUnknown=/^(?:Sobre\s+[^,.]+,\s*)?(?:ese\s+detalle\s+no\s+est[aá]\s+especificado|no\s+tengo\s+confirmado\s+ese\s+dato\s+exacto)\.?$/i;if(['ASK_MISSING_FACT','SOFT_CLOSE','RECOMMEND','OFFER_ALTERNATIVE','COLLECT_RESERVATION_DATA'].includes(action)&&factUnknown.test(cleaned))cleaned='';if(!cleaned&&action==='SOFT_CLOSE')cleaned='Listo, tomo esa información como referencia.';if(!cleaned&&action==='RECOMMEND')cleaned='Esa opción encaja con los criterios indicados.';if(internalFallback(cleaned)){const intent=String(input.intent??'').toUpperCase();cleaned=intent==='COMPARE'?'Aún no hay una diferencia clara entre esas opciones.':['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)?'Aún no hay una opción que destaque con claridad.':'No tengo confirmado ese dato exacto.';}if(action==='ASK_MISSING_FACT'&&/[¿?]/.test(cleaned)&&!questionConsumesMissingFact(input,cleaned))cleaned=stripTrailingQuestion(cleaned);cleaned=executeNba(input,cleaned);cleaned=compactFocusedCapabilityPresentation(input,cleaned);cleaned=compactRecommendationPresentation(input,cleaned);cleaned=preserveCommercialMove(input,cleaned);if(String(input.decision?.nextBestAction??'').toUpperCase()!=='ANSWER_ONLY')return cleaned;return stripTrailingQuestion(cleaned)||'No tengo confirmado ese dato exacto.';
}
export async function safeWrite(llm:LlmProvider,input:LlmWriteInput,fallbackAnswer:string):Promise<WriterGuardResult>{
  try{const writeInput=input.commercialContractPrepared?input:prepareCommercialWriteInput(input);const result=await llm.write(writeInput);let cleaned=cleanPresentation(result.text);cleaned=executeNba(writeInput,cleaned);cleaned=preserveDirectAnswer(writeInput,cleaned);cleaned=compactFocusedCapabilityPresentation(writeInput,cleaned);cleaned=compactComparisonPresentation(writeInput,cleaned);cleaned=compactRecommendationPresentation(writeInput,cleaned);let violation=guardGeneratedAnswer(writeInput,cleaned);if(violation==='NBA_ANSWER_ONLY_QUESTION'){const salvaged=stripTrailingQuestion(cleaned);if(salvaged&&!guardGeneratedAnswer(writeInput,salvaged)){cleaned=salvaged;violation=null;}}if(violation==='COMMERCIAL_MOVE_NOT_DELIVERED'){const repaired=preserveCommercialMove(writeInput,cleaned);const repairedViolation=repaired!==cleaned?guardGeneratedAnswer(writeInput,repaired):violation;if(!repairedViolation){cleaned=repaired;violation=null;}else return{answer:safeFallback(writeInput,fallbackAnswer),nextBestAction:writeInput.nextBestAction??null,missingFact:writeInput.missingFact??null,model:result.model,llmResult:result,fallback:{delivered:false,error:repairedViolation},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:continuityState(writeInput,fallbackAnswer)};}const guardedAnswer=violation?safeFallback(writeInput,fallbackAnswer):cleaned;const continuityBefore=continuityState(writeInput,guardedAnswer);if(continuityBefore.changed&&!continuityBefore.reason)return{answer:blockedContinuityAnswer(writeInput),nextBestAction:'ANSWER_ONLY',missingFact:null,model:result.model,llmResult:result,fallback:{delivered:false,error:'RECOMMENDATION_CHANGE_WITHOUT_REASON'},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:{...continuityBefore,communicated:false,allowed:false,effectiveRecommendedProduct:continuityBefore.from}};const continuityAnswer=communicateRecommendationChange(writeInput,guardedAnswer);const continuity=continuityState(writeInput,continuityAnswer);const continuityPostViolation=continuityAnswer!==guardedAnswer?guardGeneratedAnswer(writeInput,continuityAnswer):null;if(continuity.changed&&(!continuity.allowed||continuityPostViolation))return{answer:blockedContinuityAnswer(writeInput),nextBestAction:'ANSWER_ONLY',missingFact:null,model:result.model,llmResult:result,fallback:{delivered:false,error:continuityPostViolation??'RECOMMENDATION_CHANGE_NOT_COMMUNICATED'},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:{...continuity,allowed:false,effectiveRecommendedProduct:continuity.from}};return{answer:continuityAnswer,nextBestAction:writeInput.nextBestAction??null,missingFact:writeInput.missingFact??null,model:result.model,llmResult:result,fallback:violation?{delivered:false,error:violation}:{delivered:true},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:continuity};
  }catch(error){const writeInput=input.commercialContractPrepared?input:prepareCommercialWriteInput(input);const fallback=safeFallback(writeInput,fallbackAnswer);const continuityBefore=continuityState(writeInput,fallback);if(continuityBefore.changed&&!continuityBefore.reason)return{answer:blockedContinuityAnswer(writeInput),nextBestAction:'ANSWER_ONLY',missingFact:null,model:'deterministic-fallback-v0.4',llmResult:null,fallback:{delivered:false,error:'RECOMMENDATION_CHANGE_WITHOUT_REASON'},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:{...continuityBefore,communicated:false,allowed:false,effectiveRecommendedProduct:continuityBefore.from}};const answer=communicateRecommendationChange(writeInput,fallback);const continuity=continuityState(writeInput,answer);return{answer:continuity.allowed||!continuity.changed?answer:blockedContinuityAnswer(writeInput),nextBestAction:continuity.allowed||!continuity.changed?writeInput.nextBestAction??null:'ANSWER_ONLY',missingFact:continuity.allowed||!continuity.changed?writeInput.missingFact??null:null,model:'deterministic-fallback-v0.4',llmResult:null,fallback:{delivered:false,error:error instanceof Error?error.message:String(error)},commercialMoveKind:writeInput.commercialMove?.kind??null,recommendationContinuity:continuity};}
}

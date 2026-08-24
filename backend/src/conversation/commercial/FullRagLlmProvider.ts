import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';
import { buildFullRagAnswer } from './FullRagAnswerKernel.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan, hasFabricatedCommercialPressure } from './CommercialResponsePlan.ts';

function usesDocumentaryRag(input:LlmWriteInput):boolean{return Boolean(input.verifiedFacts?.some(fact=>fact.domain==='PRODUCT_RAG'||fact.domain==='INSTITUTIONAL_RAG'));}
function isBroadProductInfo(message:string):boolean{const t=fold(message);return /\b(info|informacion|caracteristicas|especificaciones|ficha|cuentame|hablame|que tal es|como es|que tal esta)\b/.test(t)&&!/\b(precio|stock|nfc|5g|bateria|camara|ram|memoria|resistente|resistencia|wifi|bluetooth|sim|termica)\b/.test(t);}
function isExplicitUseCase(message:string):boolean{
  const t=fold(message);
  return /\b(?:lo|la)\s+quiero\s+para\b/.test(t)
    || /\b(?:me sirve|sirve|lo necesito|la necesito|lo uso|la uso)\s+para\b/.test(t)
    || /\b(?:para|uso para)\b[^.!?]{0,55}\b(?:trabajo|construccion|campo|mineria|delivery|reparto|whatsapp|correo|multitarea|varias apps|free fire|pubg|cod mobile|gaming|jugar)\b/.test(t)
    || /\b(?:trabajo en campo|trabajo en construccion|uso diario)\b/.test(t);
}
function isExplicitDiscoveryFact(message:string):boolean{
  if(/[¿?]/.test(message))return false;
  const t=fold(message);
  return /\b(?:se me cae|se me rompe|se me malogra|me falla|me dura poco|me quedo sin|pierdo (?:tiempo|horas?)|perdemos (?:tiempo|horas?)|tengo que parar|tengo que detener|me interrumpe|me hace perder)\b/.test(t)
    || /\b(?:mande|he mandado|tuve que)\s+reparar\b|\b(?:dos|2|varias)\s+reparaciones?\b|\brepar\w*[^.!?]{0,35}\b(?:dos|2|varias)\s+veces\b/.test(t)
    || /\b(?:se me malogro|se malogro)\b[^.!?]{0,60}\b(?:agua|lluvia|polvo|humedad)\b|\b(?:agua|lluvia|polvo|humedad)\b[^.!?]{0,60}\b(?:malogro|rompio|dano)\b/.test(t)
    || /\b(?:lo mas importante|mi prioridad|priorizo|me importa|necesito que|quiero que sea|busco que sea)\b/.test(t);
}
function fulfillmentChoice(message:string):{mode:'DELIVERY'|'PICKUP';location:string|null}|null{
  if(/[¿?]/.test(message))return null;
  const t=fold(message);
  const pickup=/\b(?:prefiero|quiero|voy a|mejor)\b[^.!?]{0,35}\b(?:recoger|recojo|retirar|local|tienda)\b/.test(t)||/^\s*(?:recojo|recoger|local|tienda)\b/.test(t);
  if(pickup)return{mode:'PICKUP',location:null};
  if(!/\b(?:envio|enviar|delivery|entrega)\b/.test(t))return null;
  const match=message.match(/\b(?:env[ií]o|delivery|entrega)(?:\s+(?:a|para))?\s+([^¿?!.]{2,60})/i);
  const location=String(match?.[1]??'').replace(/^a\s+/i,'').trim()||null;
  return{mode:'DELIVERY',location};
}
function isExplicitFulfillmentChoice(message:string,state:LlmDecisionInput['state']):boolean{
  const pending=String(state.pendingCommercialAction??state.lastNba??'').toUpperCase();
  if(pending!=='SOFT_CLOSE')return false;
  const prompt=fold(state.lastAssistantMessage??'');
  if(!/envio|recoger|recojo|local/.test(prompt))return false;
  return Boolean(fulfillmentChoice(message));
}
function fulfillmentSelectionResponse(input:LlmWriteInput):string{
  const choice=fulfillmentChoice(input.message);
  const product=String(input.resolvedProduct??input.state?.selectedProduct??input.state?.recommendedProduct??input.state?.activeProduct??'').trim();
  const target=product?` ${product}`:' el equipo';
  if(choice?.mode==='PICKUP')return`Perfecto, puedes recogerlo en nuestro local. ¿Quieres que te reserve${target} para recojo?`;
  const where=choice?.location?` a ${choice.location}`:'';
  return`Perfecto, sería con envío${where}. ¿Quieres que te reserve${target}?`;
}
function isShortAffirmative(message:string):boolean{
  const t=fold(message).replace(/[.!¡¿?]+/g,'').replace(/\s+/g,' ').trim();
  return /^(?:si|dale|ok|okay|claro|de acuerdo|vamos|avancemos|listo|hazlo|hagamoslo)$/.test(t);
}
function isReservationAffirmative(message:string,state:LlmDecisionInput['state']):boolean{
  if(!isShortAffirmative(message))return false;
  const pending=String(state.pendingCommercialAction??state.lastNba??'').toUpperCase();
  if(pending!=='SOFT_CLOSE')return false;
  const prompt=fold(state.lastAssistantMessage??'');
  return /\bquieres\b[^?]{0,100}\b(?:reserv(?:ar|e)|separ(?:ar|e)|compr(?:ar|e))\b/.test(prompt)
    || /\b(?:te\s+lo|lo|la)\s+(?:reserv(?:o|e)|separ(?:o|e))\b/.test(prompt);
}
function isDirectTechnicalCapability(message:string):boolean{const t=fold(message);const feature=/\b(nfc|google pay|wifi|wi fi|bluetooth|infrarrojo|5g|4g|lte|dual sim|sim|audifono|audifonos|jack|ip68|ip69k|vision nocturna|camara nocturna|camara termica)\b/.test(t);const form=/\b(tiene|trae|soporta|funciona con|trabaja con|agarra|es|sirve para)\b/.test(t);return feature&&form&&!/\b(cual|que)\b[^?.!]{0,45}\b(recomiend|conviene|mejor)\b/.test(t);}
function isBroadComparison(message:string):boolean{const t=fold(message);const compare=/\b(compara|comparame|comparar|comparacion|diferencia|vs|versus)\b/.test(t);const criterion=/\b(bateria|autonomia|carga|resistencia|resistente|caida|golpe|camara|foto|video|ram|memoria|almacenamiento|procesador|rendimiento|gaming|jugar|free fire|pantalla|hz|nfc|5g|termica|peso|tamano)\b/.test(t);return compare&&!criterion;}
function isTradeoffComparisonFollowup(message:string,state:LlmDecisionInput['state']):boolean{
  if((state.comparisonProducts?.length??0)<2&&!state.recommendedProduct)return false;
  const t=fold(message);
  return /\b(?:que|cual)\b[^?.!]{0,35}\b(?:sacrifico|sacrificando|pierdo|perderia|gano|ganaria)\b/.test(t)
    || /\b(?:frente a|comparado con|comparada con|versus|vs)\b/.test(t)&&/\b(?:sacrific|pierdo|gano|diferencia|cambia)\b/.test(t);
}
function isBudgetRecommendationFollowup(message:string,state:LlmDecisionInput['state']):boolean{
  if(state.budget==null)return false;
  const t=fold(message);
  return /\b(?:con|dentro de)\s+(?:ese|mi|el)\s+presupuesto\b/.test(t)&&/\b(?:cual|que)\b[^?.!]{0,50}\b(?:elegir|elegirias|escoger|conviene|recomiend|mejor)\b/.test(t);
}
function naturalSalesPlan(input:LlmWriteInput):string{const original=String(input.deterministicAnswer??'').trim();const style=['FULL_RAG_STYLE:','Habla como asesor comercial humano, no como ficha técnica ni evaluador.','No cambies hechos verificados ni sustituyas el atributo solicitado por otro relacionado.','No inventes benchmarks, FPS, compatibilidades ni ventajas de procesador/GPU no verificadas.','No repitas la respuesta factual ni agregues especificaciones ajenas a la pregunta.','Nunca escribas etiquetas internas como Ejecutar:, N+1:, NBA:, FULL_RAG_STYLE:, ANSWER_ONLY, RELATED_VALUE, COMPARE o RECOMMEND.'].join(' ');return [original,style].filter(Boolean).join('\n');}
function sanitize(text:string,input:LlmWriteInput):string{
  let clean=String(text??'')
    .replace(/(?:^|\n)\s*(?:Ejecutar|N\+1|NBA|FULL_RAG_STYLE)\s*:\s*[A-Z_ -]+\.?\s*/gi,'\n')
    .replace(/\b(?:ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|ASK_USE_CASE|ASK_PROBLEM|ASK_IMPLICATION|ASK_PRIORITY|ASK_BUDGET|SOFT_CLOSE_TO_STOCK|SOFT_CLOSE|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|RESERVATION_DATA_COLLECTION|EXECUTE_RESERVATION|ASSISTED_HANDOFF|COMPARE_PRODUCTS|RECOMMEND_PRODUCT)\b[.:]?/g,'')
    .replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim();
  const intent=String(input.intent??'').toUpperCase();const nba=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();
  if(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)&&nba==='ANSWER_ONLY')clean=clean.replace(/^\s*Te recomiendo\s+([^.:\n]+)(\s*[:.]?)/i,(_m,product)=>`Para lo que buscas, me iría por ${String(product).trim()}.`);
  return clean;
}
function softCloseQuestion(input:LlmWriteInput):string{
  if(input.commercialResponsePlan?.closePurpose==='PRICE_AVAILABILITY')return'¿Quieres que te confirme precio y disponibilidad?';
  if(input.commercialResponsePlan?.closePurpose==='RESERVATION')return'¿Quieres que te lo reserve?';
  return'¿Prefieres envío o recogerlo en nuestro local?';
}
function humanizeKernel(text:string,input:LlmWriteInput,includeCommercialContinuation=true):string{
  let clean=String(text??'')
    .replace(/protecci[oó]n\s+IP68\s+hasta\s+([^,.;\n]+)\s+durante\s+([^,.;\n]+)/gi,'protección frente al agua con IP68 hasta $1 de profundidad durante $2')
    .replace(/protecci[oó]n\s+hasta\s+([^,.;\n]+)\s+durante\s+([^,.;\n]+)/gi,'protección frente al agua hasta $1 de profundidad durante $2');
  const intent=String(input.intent??'').toUpperCase();
  const budget=Number(input.budget??input.state?.budget??NaN);
  if(intent==='RECOMMEND_WITHIN_BUDGET'&&Number.isFinite(budget))clean=clean.replace(/^Para lo que buscas, me iría por /,`Dentro de tu presupuesto de S/ ${budget}, me iría por `);
  const nba=String(input.nextBestAction??input.finalExecutableNba??input.decision?.nextBestAction??'').toUpperCase();
  if(includeCommercialContinuation&&nba==='SOFT_CLOSE'&&!/[¿?]/.test(clean))clean=`${clean.trim()} ${softCloseQuestion(input)}`;
  return clean.trim();
}
function deterministicResult(text:string,model:string):LlmResult{return{text,model,usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}
function factualDecision(result:LlmDecisionResult,primaryIntent:'PRODUCT_INFO'|'CAPABILITY',attributes?:string[]):LlmDecisionResult{return{...result,decision:{...result.decision,primaryIntent,attributes:attributes??result.decision.attributes,customerNeed:null,customerProblem:null,priorities:[],spinContribution:null}};}
function withoutPlannerMemory(result:LlmDecisionResult):LlmDecisionResult{return{...result,decision:{...result.decision,customerNeed:null,customerProblem:null,priorities:[],spinContribution:null}};}

function contextualFactScore(input:LlmWriteInput,fact:{key:string;value:string}):number{
  const context=fold(`${input.message} ${input.useCase??input.state?.useCase??''} ${input.problem??input.state?.problem??''} ${(input.priorities??input.state?.priorities??[]).join(' ')}`);
  const text=fold(`${fact.key} ${fact.value}`);
  let score=0;
  if(/caida|golpe|construccion|obra|campo|repar|polvo|lluvia|agua/.test(context)&&/resisten|caida|ip68|ip69|mil/.test(text))score+=20;
  if(/bateria|cargador|no llega a la tarde/.test(context)&&/bateria|mah|carga/.test(text))score+=20;
  if(/construccion|obra|campo|trabajo/.test(context)&&/bateria|mah/.test(text))score+=5;
  if(/nfc/.test(context)&&/nfc|google pay/.test(text))score+=20;
  return score;
}
function simpleFactLabel(fact:{key:string;value:string}):string{
  const text=fold(`${fact.key} ${fact.value}`);const value=String(fact.value??'').trim();
  if(/caida/.test(text))return /caida/i.test(value)?value:`resistencia a caídas de ${value}`;
  if(/ip68|ip69|mil/.test(text))return value;
  if(/bateria|mah/.test(text))return /bateria/i.test(value)?value:`batería ${value}`;
  if(/carga/.test(text))return /carga/i.test(value)?value:`carga ${value}`;
  if(/nfc|google pay/.test(text))return value;
  return value;
}
function naturalList(values:string[]):string{
  const clean=[...new Set(values.filter(Boolean))];
  if(clean.length<=1)return clean[0]??'';
  if(clean.length===2)return`${clean[0]} y ${clean[1]}`;
  return`${clean.slice(0,-1).join(', ')} y ${clean.at(-1)}`;
}
function ruggedCertificationName(fact:{key:string;value:string}):string|null{
  const text=fold(`${fact.key} ${fact.value}`);
  if(/ip69k/.test(text))return'IP69K';
  if(/ip68/.test(text))return'IP68';
  if(/mil[- _]?std[- _]?810h|mil.*810h/.test(text))return'MIL-STD-810H';
  return null;
}
function ruggedCertifications(input:LlmWriteInput):string[]{return[...new Set((input.verifiedFeatures??[]).map(ruggedCertificationName).filter((value):value is string=>Boolean(value)))];}
function ruggedFabCore(input:LlmWriteInput,product:string):string|null{
  const context=fold(`${input.message} ${input.useCase??input.state?.useCase??''} ${input.problem??input.state?.problem??''} ${(input.priorities??input.state?.priorities??[]).join(' ')}`);
  if(!/caida|golpe|construccion|obra|campo|repar|polvo|lluvia|agua|humedad/.test(context))return null;
  const features=input.verifiedFeatures??[];
  const drop=features.find(fact=>/resisten.*caida|caida/.test(fold(`${fact.key} ${fact.value}`)));
  const certs=ruggedCertifications(input);
  const featureParts:string[]=[];
  if(drop)featureParts.push(simpleFactLabel(drop));
  if(certs.length)featureParts.push(`certificaciones ${naturalList(certs)}`);
  if(!featureParts.length)return null;
  const hasImpact=Boolean(drop||certs.includes('MIL-STD-810H'));
  const hasIngress=certs.includes('IP68')||certs.includes('IP69K');
  const protection=[hasImpact?'golpes y caídas':'',hasIngress?'agua y polvo':''].filter(Boolean);
  const intro=/repar/.test(context)?`En ese caso me iría por ${product}`:`Para ese ritmo me iría por ${product}`;
  const benefit=protection.length
    ?`En palabras simples, está mucho mejor preparado para ${naturalList(protection)}; si lo usas para trabajar, eso ayuda a reducir el riesgo de volver al mismo ciclo de caída, reparación y quedarte sin equipo.`
    :'En palabras simples, esas protecciones sí tienen sentido para un uso más exigente.';
  return`${intro}: tiene ${naturalList(featureParts)}. ${benefit}`;
}
function compactContextualCore(input:LlmWriteInput,fallback:string):string{
  const intent=String(input.intent??'').toUpperCase();
  if(!['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent))return fallback;
  const hasContext=Boolean(input.useCase??input.state?.useCase??input.problem??input.state?.problem??(input.priorities??input.state?.priorities??[]).length);
  if(!hasContext)return fallback;
  const product=String(input.resolvedProduct??input.recommendedProduct??input.quote?.shortName??input.quote?.product??input.state?.recommendedProduct??input.state?.activeProduct??'').trim();
  const facts=(input.verifiedFeatures??[]).map(fact=>({fact,score:contextualFactScore(input,fact)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).map(item=>item.fact);
  const selected=(facts.length?facts:(input.verifiedFeatures??[])).slice(0,2).map(simpleFactLabel).filter(Boolean);
  const ruggedFab=product?ruggedFabCore(input,product):null;
  const fit=ruggedFab??(product&&selected.length?`${product}: ${selected.join(' y ')}.`:'');
  const commercial=input.quote?.price!=null&&input.quote?.stock!=null?`${product||'El equipo'} está a S/ ${input.quote.price} y ${input.quote.stock>0?'tenemos disponibilidad':'ahora no tiene stock disponible'}.`:'';
  return [fit,commercial].filter(Boolean).join(' ')||fallback;
}
function painContext(input:LlmWriteInput):boolean{
  const context=fold(`${input.message} ${input.useCase??input.state?.useCase??''} ${input.problem??input.state?.problem??''}`);
  return /caida|romp|repar|bateria|cargador|polvo|lluvia|agua|humedad|malogr|pierdo/.test(context);
}
function technicalDumpOnPain(text:string,input:LlmWriteInput):boolean{
  if(!painContext(input))return false;
  const noisy=(String(text).match(/\b(?:GLONASS|Galileo|BeiDou|Helio|Mali|GHz|GPU)\b/gi)??[]).length;
  const rugged=(String(text).match(/\b(?:IP68|IP69K|MIL-STD-810H)\b/gi)??[]).length;
  return noisy>0||rugged>3;
}
function naturalFallback(input:LlmWriteInput,core:string):string{
  const context=fold(`${input.message} ${input.useCase??input.state?.useCase??''} ${input.problem??input.state?.problem??''}`);
  let lead='';
  if(/repar/.test(context))lead='Si ya lo reparaste varias veces, cada nueva caída puede terminar otra vez en gasto y en quedarte sin celular justo cuando lo necesitas.';
  else if(/caida|construccion|obra/.test(context))lead='En obra una caída pasa en un segundo; la idea es que no estés pendiente del celular cada vez que lo sacas para trabajar.';
  else if(/bateria|cargador|no llega a la tarde/.test(context))lead='Si a media tarde ya estás buscando dónde cargarlo, terminas pendiente de la batería cuando deberías seguir con tu trabajo.';
  else if(/polvo|lluvia|agua|humedad/.test(context))lead='Si trabajas entre polvo o lluvia, estar cuidando el celular a cada rato termina siendo una preocupación más.';
  const question=input.commercialResponsePlan?.exactNba==='SOFT_CLOSE'?softCloseQuestion(input):'';
  return [lead,core,question].filter(Boolean).join(' ').trim();
}
function shouldForceHumanPainResponse(input:LlmWriteInput,core:string):boolean{
  const intent=String(input.intent??'').toUpperCase();
  return Boolean(core)&&painContext(input)&&['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);
}
function missesRequiredCloseResult(text:string,input:LlmWriteInput):boolean{
  const plan=input.commercialResponsePlan;if(plan?.exactNba!=='SOFT_CLOSE')return false;
  const value=String(text??'');
  if(plan.closePurpose==='RESERVATION')return !/reserv|separ/i.test(value);
  if(plan.closePurpose==='PRICE_AVAILABILITY')return !(/precio/i.test(value)&&/disponib|stock/i.test(value));
  if(plan.closePurpose==='FULFILLMENT'){
    const needsPrice=input.quote?.price!=null;const needsAvailability=input.quote?.stock!=null;
    const priceOk=!needsPrice||/S\/\s*\d/i.test(value);const stockOk=!needsAvailability||/disponib|stock/i.test(value);
    return !(priceOk&&stockOk&&/env[ií]o/i.test(value)&&/recoger|recojo|local/i.test(value));
  }
  return false;
}
function missesRuggedFabEvidence(text:string,input:LlmWriteInput):boolean{
  const context=fold(`${input.message} ${input.useCase??input.state?.useCase??''} ${input.problem??input.state?.problem??''}`);
  if(!/caida|golpe|construccion|obra|campo|repar|polvo|lluvia|agua|humedad/.test(context))return false;
  const certs=ruggedCertifications(input);if(!certs.length)return false;
  const value=String(text??'');
  const certsPresent=certs.every(cert=>value.toUpperCase().includes(cert.toUpperCase()));
  const practical=/golpes?|ca[ií]das?|agua|polvo/.test(value);
  const benefit=/riesgo|repar|quedarte|proteger|aguantar|preparado|pendiente/.test(value);
  return !(certsPresent&&practical&&benefit);
}

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  async decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    const result=await this.#delegate.decide(input);let decision=result.decision;const intent=String(decision.primaryIntent).toUpperCase();
    if(isReservationAffirmative(input.message,input.state))decision={...decision,primaryIntent:'PURCHASE'};
    else if(isExplicitFulfillmentChoice(input.message,input.state))decision={...decision,primaryIntent:'FULFILLMENT_SELECTION',nextBestAction:'SOFT_CLOSE',needsSql:false,needsProductRag:false,needsInstitutionalRag:false};
    else if(isExplicitUseCase(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY','PRICE','STOCK'].includes(intent))decision={...decision,primaryIntent:'EVALUATE_USE'};
    else if(isExplicitDiscoveryFact(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY','PRICE','STOCK'].includes(intent))decision={...decision,primaryIntent:'EVALUATE_USE'};
    else if(isBudgetRecommendationFollowup(input.message,input.state)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))decision={...decision,primaryIntent:'RECOMMEND_WITHIN_BUDGET'};
    else if(isBroadProductInfo(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))return factualDecision(result,'PRODUCT_INFO',[]);
    else if(isDirectTechnicalCapability(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY','PRICE','STOCK'].includes(intent))return factualDecision(result,'CAPABILITY');
    else if(isTradeoffComparisonFollowup(input.message,input.state)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))decision={...decision,primaryIntent:'COMPARE',comparisonProducts:(input.state.comparisonProducts??[]).slice(0,2)};
    else if(isBroadComparison(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))decision={...decision,primaryIntent:'COMPARE',attributes:[]};
    return withoutPlannerMemory({...result,decision});
  }
  async write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);const intent=String(enriched.intent??'').toUpperCase();
    if(intent==='FULFILLMENT_SELECTION')return deterministicResult(fulfillmentSelectionResponse(enriched),'stech-fulfillment-selection');
    const isRecommendation=['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);
    const kernelInput:LlmWriteInput=isRecommendation?enriched:{...enriched,recommendedProduct:null};
    const kernel=['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)?buildFullRagAnswer(kernelInput):null;
    if(kernel){
      const overviewCore=kernel.mode==='OVERVIEW'&&String(enriched.directAnswer??'').trim()?String(enriched.directAnswer).trim():kernel.answer;
      const rawCore=humanizeKernel(overviewCore,enriched,false);
      const factualCore=compactContextualCore(enriched,rawCore);
      const plannedInput:LlmWriteInput={...enriched,directAnswer:factualCore,deterministicAnswer:factualCore};
      const responsePlan=buildCommercialResponsePlan(plannedInput,factualCore);
      plannedInput.commercialResponsePlan=responsePlan;
      plannedInput.deterministicAnswer=buildCommercialResponseInstruction(responsePlan);
      Object.assign(input,plannedInput);
      if(shouldForceHumanPainResponse(plannedInput,factualCore))return deterministicResult(naturalFallback(plannedInput,factualCore),`full-rag-kernel-${kernel.mode.toLowerCase()}-human-pain`);
      if(!responsePlan.shouldUseLlm)return deterministicResult(factualCore,`full-rag-kernel-${kernel.mode.toLowerCase()}`);
      const result=await this.#delegate.write(plannedInput);
      const composed=humanizeKernel(sanitize(result.text,plannedInput),plannedInput);
      if(hasFabricatedCommercialPressure(composed)||technicalDumpOnPain(composed,plannedInput)||missesRequiredCloseResult(composed,plannedInput)||missesRuggedFabEvidence(composed,plannedInput))return deterministicResult(naturalFallback(plannedInput,factualCore),`full-rag-kernel-${kernel.mode.toLowerCase()}-human-fallback`);
      return{...result,text:composed};
    }
    const rawCore=String(enriched.directAnswer??'').trim();
    const factualCore=compactContextualCore(enriched,rawCore);
    enriched.directAnswer=factualCore;
    const responsePlan=buildCommercialResponsePlan(enriched,factualCore);
    enriched.commercialResponsePlan=responsePlan;
    if(responsePlan.mode==='SOFT_CLOSE'&&factualCore)enriched.deterministicAnswer=buildCommercialResponseInstruction(responsePlan);
    else if(usesDocumentaryRag(enriched))enriched.deterministicAnswer=naturalSalesPlan(enriched);
    Object.assign(input,enriched);
    if(shouldForceHumanPainResponse(enriched,factualCore))return deterministicResult(naturalFallback(enriched,factualCore),'full-rag-commercial-human-pain');
    const result=await this.#delegate.write(enriched);
    const composed=humanizeKernel(sanitize(result.text,enriched),enriched);
    if((hasFabricatedCommercialPressure(composed)||technicalDumpOnPain(composed,enriched)||missesRequiredCloseResult(composed,enriched)||missesRuggedFabEvidence(composed,enriched))&&factualCore)return deterministicResult(naturalFallback(enriched,factualCore),'full-rag-commercial-human-fallback');
    return{...result,text:composed};
  }
}

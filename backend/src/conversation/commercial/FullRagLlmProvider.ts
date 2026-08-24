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
function isDirectTechnicalCapability(message:string):boolean{const t=fold(message);const feature=/\b(nfc|google pay|wifi|wi fi|bluetooth|infrarrojo|5g|4g|lte|dual sim|sim|audifono|audifonos|jack|ip68|ip69k|vision nocturna|camara nocturna|camara termica)\b/.test(t);const form=/\b(tiene|trae|soporta|funciona con|trabaja con|agarra|es|sirve para)\b/.test(t);return feature&&form&&!/\b(cual|que)\b[^?.!]{0,45}\b(recomiend|conviene|mejor)\b/.test(t);}
function isBroadComparison(message:string):boolean{const t=fold(message);const compare=/\b(compara|comparame|comparar|comparacion|diferencia|vs|versus)\b/.test(t);const criterion=/\b(bateria|autonomia|carga|resistencia|resistente|caida|golpe|camara|foto|video|ram|memoria|almacenamiento|procesador|rendimiento|gaming|jugar|free fire|pantalla|hz|nfc|5g|termica|peso|tamano)\b/.test(t);return compare&&!criterion;}
function naturalSalesPlan(input:LlmWriteInput):string{const original=String(input.deterministicAnswer??'').trim();const style=['FULL_RAG_STYLE:','Habla como asesor comercial humano, no como ficha técnica ni evaluador.','No cambies hechos verificados ni sustituyas el atributo solicitado por otro relacionado.','No inventes benchmarks, FPS, compatibilidades ni ventajas de procesador/GPU no verificadas.','No repitas la respuesta factual ni agregues especificaciones ajenas a la pregunta.','Nunca escribas etiquetas internas como Ejecutar:, N+1:, NBA:, FULL_RAG_STYLE:, ANSWER_ONLY, RELATED_VALUE, COMPARE o RECOMMEND.'].join(' ');return [original,style].filter(Boolean).join('\n');}
function sanitize(text:string,input:LlmWriteInput):string{let clean=String(text??'').replace(/(?:^|\n)\s*(?:Ejecutar|N\+1|NBA|FULL_RAG_STYLE)\s*:\s*[A-Z_ -]+\.?\s*/gi,'\n').replace(/\b(?:ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|SOFT_CLOSE|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION)\b[.!]?/g,'').replace(/\n{3,}/g,'\n\n').trim();const intent=String(input.intent??'').toUpperCase();const nba=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();if(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)&&nba==='ANSWER_ONLY')clean=clean.replace(/^\s*Te recomiendo\s+([^.:\n]+)(\s*[:.]?)/i,(_m,product)=>`Para lo que buscas, me iría por ${String(product).trim()}.`);return clean;}
function humanizeKernel(text:string,input:LlmWriteInput):string{
  let clean=String(text??'')
    .replace(/protecci[oó]n\s+IP68\s+hasta\s+([^,.;\n]+)\s+durante\s+([^,.;\n]+)/gi,'protección frente al agua con IP68 hasta $1 de profundidad durante $2')
    .replace(/protecci[oó]n\s+hasta\s+([^,.;\n]+)\s+durante\s+([^,.;\n]+)/gi,'protección frente al agua hasta $1 de profundidad durante $2');
  const intent=String(input.intent??'').toUpperCase();
  const budget=Number(input.budget??input.state?.budget??NaN);
  if(intent==='RECOMMEND_WITHIN_BUDGET'&&Number.isFinite(budget)){
    clean=clean.replace(/^Para lo que buscas, me iría por /,`Dentro de tu presupuesto de S/ ${budget}, me iría por `);
  }
  const nba=String(input.nextBestAction??input.finalExecutableNba??input.decision?.nextBestAction??'').toUpperCase();
  if(nba==='SOFT_CLOSE'&&!/[¿?]/.test(clean))clean=`${clean.trim()} ¿Quieres que te revise stock y disponibilidad?`;
  return clean.trim();
}
function deterministicResult(text:string,model:string):LlmResult{return{text,model,usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  async decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    const result=await this.#delegate.decide(input);const intent=String(result.decision.primaryIntent).toUpperCase();
    if(isExplicitUseCase(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY','PRICE','STOCK'].includes(intent))return{...result,decision:{...result.decision,primaryIntent:'EVALUATE_USE'}};
    if(isBroadProductInfo(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))return{...result,decision:{...result.decision,primaryIntent:'PRODUCT_INFO',attributes:[]}};
    if(isDirectTechnicalCapability(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY','PRICE','STOCK'].includes(intent))return{...result,decision:{...result.decision,primaryIntent:'CAPABILITY'}};
    if(isBroadComparison(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(intent))return{...result,decision:{...result.decision,primaryIntent:'COMPARE',attributes:[]}};
    return result;
  }
  async write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);const intent=String(enriched.intent??'').toUpperCase();
    const isRecommendation=['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);
    const kernelInput:LlmWriteInput=isRecommendation?enriched:{...enriched,recommendedProduct:null};
    const kernel=['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)?buildFullRagAnswer(kernelInput):null;
    if(kernel){
      const factualCore=humanizeKernel(kernel.answer,enriched);
      const plannedInput:LlmWriteInput={...enriched,directAnswer:factualCore,deterministicAnswer:factualCore};
      plannedInput.commercialResponsePlan=buildCommercialResponsePlan(plannedInput,factualCore);
      plannedInput.deterministicAnswer=buildCommercialResponseInstruction(plannedInput.commercialResponsePlan);
      Object.assign(input,plannedInput);
      if(!plannedInput.commercialResponsePlan.shouldUseLlm)return deterministicResult(factualCore,`full-rag-kernel-${kernel.mode.toLowerCase()}`);
      const result=await this.#delegate.write(plannedInput);
      const composed=humanizeKernel(sanitize(result.text,plannedInput),plannedInput);
      if(hasFabricatedCommercialPressure(composed))return deterministicResult(factualCore,`full-rag-kernel-${kernel.mode.toLowerCase()}-pressure-fallback`);
      return{...result,text:composed};
    }
    if(usesDocumentaryRag(enriched))enriched.deterministicAnswer=naturalSalesPlan(enriched);Object.assign(input,enriched);const result=await this.#delegate.write(enriched);return{...result,text:humanizeKernel(sanitize(result.text,enriched),enriched)};
  }
}

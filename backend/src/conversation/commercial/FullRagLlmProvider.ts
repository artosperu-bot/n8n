import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';
import { buildFullRagAnswer } from './FullRagAnswerKernel.ts';

function usesDocumentaryRag(input:LlmWriteInput):boolean{return Boolean(input.verifiedFacts?.some(fact=>fact.domain==='PRODUCT_RAG'||fact.domain==='INSTITUTIONAL_RAG'));}
function isBroadProductInfo(message:string):boolean{const t=fold(message);return /\b(info|informacion|caracteristicas|especificaciones|ficha|cuentame|hablame|que tal es|como es|que tal esta)\b/.test(t)&&!/\b(precio|stock|nfc|5g|bateria|camara|ram|memoria|resistente|resistencia|wifi|bluetooth|sim|termica)\b/.test(t);}
function naturalSalesPlan(input:LlmWriteInput):string{
  const original=String(input.deterministicAnswer??'').trim();
  const style=[
    'FULL_RAG_STYLE:',
    'Habla como asesor comercial humano, no como ficha técnica ni evaluador.',
    'No cambies hechos verificados ni sustituyas el atributo solicitado por otro relacionado.',
    'No inventes benchmarks, FPS, compatibilidades ni ventajas de procesador/GPU no verificadas.',
    'No repitas la respuesta factual ni agregues especificaciones ajenas a la pregunta.',
    'Nunca escribas etiquetas internas como Ejecutar:, N+1:, NBA:, FULL_RAG_STYLE:, ANSWER_ONLY, RELATED_VALUE, COMPARE o RECOMMEND.',
  ].join(' ');
  return [original,style].filter(Boolean).join('\n');
}
function sanitize(text:string,input:LlmWriteInput):string{
  let clean=String(text??'')
    .replace(/(?:^|\n)\s*(?:Ejecutar|N\+1|NBA|FULL_RAG_STYLE)\s*:\s*[A-Z_ -]+\.?\s*/gi,'\n')
    .replace(/\b(?:ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|SOFT_CLOSE|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION)\b[.!]?/g,'')
    .replace(/\n{3,}/g,'\n\n').trim();
  const intent=String(input.intent??'').toUpperCase();const nba=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();
  if(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)&&nba==='ANSWER_ONLY')clean=clean.replace(/^\s*Te recomiendo\s+([^.:\n]+)(\s*[:.]?)/i,(_m,product)=>`Para lo que buscas, me iría por ${String(product).trim()}.`);
  return clean;
}
function deterministicResult(text:string,model:string):LlmResult{return{text,model,usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  async decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    const result=await this.#delegate.decide(input);
    if(isBroadProductInfo(input.message)&&!['PURCHASE','QUOTE','POLICY','WARRANTY'].includes(String(result.decision.primaryIntent).toUpperCase())){
      return{...result,decision:{...result.decision,primaryIntent:'PRODUCT_INFO',attributes:[],nextBestAction:'ANSWER_ONLY'}};
    }
    return result;
  }
  async write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);
    const intent=String(enriched.intent??'').toUpperCase();

    // RAG-only factual authority. Budget recommendations are intentionally left
    // outside this kernel because price/budget is SQL authority. A persisted
    // recommended product must not override the product resolved in the current
    // factual turn.
    const kernelInput:LlmWriteInput=intent==='RECOMMEND'?enriched:{...enriched,recommendedProduct:null};
    const kernel=['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','COMPARE','RECOMMEND'].includes(intent)
      ? buildFullRagAnswer(kernelInput)
      : null;
    if(kernel){
      Object.assign(input,enriched,{directAnswer:kernel.answer});
      return deterministicResult(kernel.answer,`full-rag-kernel-${kernel.mode.toLowerCase()}`);
    }

    // Institutional RAG and routes that depend on SQL keep their existing behavior.
    if(usesDocumentaryRag(enriched))enriched.deterministicAnswer=naturalSalesPlan(enriched);
    Object.assign(input,enriched);
    const result=await this.#delegate.write(enriched);
    return{...result,text:sanitize(result.text,enriched)};
  }
}

import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';

function hasCustomerContext(input:LlmWriteInput):boolean{
  const state:any=input.state??{};
  const useCase=String(input.useCase??state.useCase??'').trim();
  const problem=String(input.problem??state.problem??'').trim();
  const priorities=input.priorities??state.priorities??[];
  return Boolean(useCase||problem||priorities.length);
}
function usesDocumentaryRag(input:LlmWriteInput):boolean{
  return Boolean(input.verifiedFacts?.some(fact=>fact.domain==='PRODUCT_RAG'||fact.domain==='INSTITUTIONAL_RAG'));
}
function naturalSalesPlan(input:LlmWriteInput):string{
  const original=String(input.deterministicAnswer??'').trim();
  const style=[
    'FULL_RAG_STYLE:',
    'Habla como un vendedor que conoce el producto, no como una ficha técnica ni un evaluador.',
    'Orden: responde -> explica qué significa para este cliente cuando haya contexto -> toma postura si la evidencia permite decidir -> ejecuta solo el N+1 autorizado.',
    'No repitas la misma especificación en introducción y viñetas.',
    'No uses frases como "ese dato te ayuda a decidir", "ese dato pesa en la decisión", "alineado con tus criterios", "cumple tus prioridades", "criterios ya confirmados" ni "según los datos verificados".',
    'Prefiere lenguaje natural como "para tu caso", "acá yo me fijaría en", "entre esos dos me iría por", "lo más importante para tu uso es".',
    'FAB: traduce solo 1 o 2 hechos importantes a valor práctico; no conviertas cada especificación en un beneficio.',
    'Si no hay contexto suficiente para un beneficio real, responde el dato y termina; no rellenes con una frase comercial genérica.',
    'En comparación/recomendación, si hay evidencia suficiente, da una elección clara y explica 1 o 2 razones ligadas al uso conocido.',
  ].join(' ');
  return [original,style].filter(Boolean).join('\n');
}

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    return this.#delegate.decide(input);
  }
  async write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);
    if(usesDocumentaryRag(enriched))enriched.deterministicAnswer=naturalSalesPlan(enriched);
    Object.assign(input,enriched);

    // A cold product overview already has a grounded 5–6 family summary. Sending
    // it back through the writer caused duplicated fichas and extra filler. Keep
    // it deterministic; WriterGuard will still execute the single authorized N+1.
    if(enriched.presentationMode==='PRODUCT_OVERVIEW'&&!hasCustomerContext(enriched)&&enriched.directAnswer){
      return{
        text:enriched.directAnswer,
        model:'full-rag-overview-v1',
        usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},
        durationMs:0,
      };
    }

    // Contextual RAG turns still go through the LLM so FAB can translate verified
    // features into customer value without changing factual authority.
    return this.#delegate.write(enriched);
  }
}

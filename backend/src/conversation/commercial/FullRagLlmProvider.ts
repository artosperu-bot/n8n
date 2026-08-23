import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';
import { buildColdRagComparison } from './FullRagComparison.ts';

function meaningfulCustomerContext(input:LlmWriteInput):boolean{const state:any=input.state??{};const useCase=String(input.useCase??state.useCase??'').trim();const problem=String(input.problem??state.problem??'').trim();const priorities=(input.priorities??state.priorities??[]).map(x=>String(x).trim()).filter(Boolean);return Boolean(useCase||problem||new Set(priorities.map(x=>x.toLocaleLowerCase('es'))).size>=2);}
function usesDocumentaryRag(input:LlmWriteInput):boolean{return Boolean(input.verifiedFacts?.some(fact=>fact.domain==='PRODUCT_RAG'||fact.domain==='INSTITUTIONAL_RAG'));}
function naturalSalesPlan(input:LlmWriteInput):string{const original=String(input.deterministicAnswer??'').trim();const style=['FULL_RAG_STYLE:','Habla como asesor comercial humano, no como ficha técnica ni evaluador.','La respuesta factual canónica ya viene en directAnswer: no cambies sus hechos, no contradigas sus sí/no y no sustituyas el atributo por otro relacionado.','Orden: responde -> si existe contexto real, explica una sola consecuencia práctica -> toma postura solo si la evidencia permite decidir -> ejecuta únicamente el N+1 autorizado.','FAB: usa máximo 1 beneficio contextual y no repitas la misma especificación.','Sin contexto real, responde el dato y termina. No ofrezcas verificar algo que el RAG ya resolvió y no inventes acciones futuras.','Nunca escribas etiquetas internas como Ejecutar:, N+1:, NBA:, FULL_RAG_STYLE:, ANSWER_ONLY, RELATED_VALUE, COMPARE o RECOMMEND.','No uses frases robóticas como "ese dato te ayuda a decidir", "ese dato pesa en la decisión", "alineado con tus criterios", "cumple tus prioridades", "criterios ya confirmados" o "según los datos verificados".'].join(' ');return [original,style].filter(Boolean).join('\n');}
function sanitize(text:string,input:LlmWriteInput):string{
  let clean=String(text??'').replace(/(?:^|\n)\s*(?:Ejecutar|N\+1|NBA|FULL_RAG_STYLE)\s*:\s*[A-Z_ -]+\.?\s*/gi,'\n').replace(/\b(?:ANSWER_ONLY|RELATED_VALUE|ASK_MISSING_FACT|SOFT_CLOSE|OFFER_ALTERNATIVE|COLLECT_RESERVATION_DATA|EXECUTE_RESERVATION)\b[.!]?/g,'').replace(/\n{3,}/g,'\n\n').trim();
  const intent=String(input.intent??'').toUpperCase();const nba=String(input.nextBestAction??input.decision?.nextBestAction??'').toUpperCase();
  if(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)&&nba==='ANSWER_ONLY')clean=clean.replace(/^\s*Te recomiendo\s+([^.:\n]+)(\s*[:.]?)/i,(_m,product)=>`Para lo que buscas, me iría por ${String(product).trim()}.`);
  return clean;
}
function deterministicResult(text:string,model:string):LlmResult{return{text,model,usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');return this.#delegate.decide(input);}
  async write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);if(usesDocumentaryRag(enriched))enriched.deterministicAnswer=naturalSalesPlan(enriched);Object.assign(input,enriched);
    if(enriched.directAnswer&&((enriched.presentationMode==='PRODUCT_OVERVIEW'&&!meaningfulCustomerContext(enriched))||(enriched.presentationMode==='ATTRIBUTE'&&!meaningfulCustomerContext(enriched))))return deterministicResult(enriched.directAnswer,enriched.presentationMode==='ATTRIBUTE'?'full-rag-attribute-v2':'full-rag-overview-v2');
    if(String(enriched.intent??'').toUpperCase()==='COMPARE'&&!meaningfulCustomerContext(enriched)){const comparison=buildColdRagComparison(enriched.rag??[]);if(comparison)return deterministicResult(comparison,'full-rag-compare-v1');}
    const result=await this.#delegate.write(enriched);return{...result,text:sanitize(result.text,enriched)};
  }
}

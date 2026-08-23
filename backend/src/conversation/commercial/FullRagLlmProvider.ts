import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';

function hasCustomerContext(input:LlmWriteInput):boolean{
  const state:any=input.state??{};
  const useCase=String(input.useCase??state.useCase??'').trim();
  const problem=String(input.problem??state.problem??'').trim();
  const priorities=input.priorities??state.priorities??[];
  return Boolean(useCase||problem||priorities.length);
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
    // WriterGuard owns the prepared contract object. Keep the enrichment on that
    // same object so post-write guards validate exactly what the model received.
    Object.assign(input,enriched);

    // A cold product overview already has a grounded 5–6 family summary. Sending
    // that back through the writer caused duplicated fichas and extra filler. Keep
    // it deterministic; WriterGuard will still execute the single authorized N+1.
    if(enriched.presentationMode==='PRODUCT_OVERVIEW'&&!hasCustomerContext(enriched)&&enriched.directAnswer){
      return{
        text:enriched.directAnswer,
        model:'full-rag-overview-v1',
        usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},
        durationMs:0,
      };
    }

    // Contextual turns still go through the LLM so FAB can translate verified
    // features into customer value without changing factual authority.
    return this.#delegate.write(enriched);
  }
}

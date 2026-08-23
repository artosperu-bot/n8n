import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    return this.#delegate.decide(input);
  }
  write(input:LlmWriteInput):Promise<LlmResult>{
    const enriched=applyFullRagWritePolicy(input);
    // WriterGuard owns the prepared contract object. Keep the enrichment on that
    // same object so post-write guards validate the exact overview/attribute policy
    // the model received instead of validating a stale pre-Full-RAG contract.
    Object.assign(input,enriched);
    return this.#delegate.write(input);
  }
}

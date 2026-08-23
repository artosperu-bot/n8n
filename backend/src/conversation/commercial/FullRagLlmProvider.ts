import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { applyFullRagWritePolicy } from './FullRagWritePolicy.ts';

export class FullRagLlmProvider implements LlmProvider{
  readonly #delegate:LlmProvider;
  constructor(delegate:LlmProvider){this.#delegate=delegate;}
  decide(input:LlmDecisionInput):Promise<LlmDecisionResult>{
    if(!this.#delegate.decide)throw new Error('Wrapped LLM does not implement decide');
    return this.#delegate.decide(input);
  }
  write(input:LlmWriteInput):Promise<LlmResult>{return this.#delegate.write(applyFullRagWritePolicy(input));}
}

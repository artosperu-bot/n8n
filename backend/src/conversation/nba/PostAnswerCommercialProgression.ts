import type { ConversationState } from '../../domain/types.ts';

export type ProgressionLevel='HIGH'|'MEDIUM'|'LOW';

type ProgressionInput={
  intent:string;
  currentNba:string|null;
  state:ConversationState;
  resolvedProduct:string|null;
  verifiedCurrentAnswer:boolean;
  verifiedAlternatives?:number;
  relatedValueAvailable?:boolean;
};

type ProgressionResult={level:ProgressionLevel;candidateNba:string;reason:string;};

const CLOSING_ACTIONS=new Set(['COLLECT_RESERVATION_DATA','ASSISTED_HANDOFF','EXECUTE_RESERVATION']);
const MEDIUM_ACTIONS=new Set(['COMPARE','OFFER_ALTERNATIVE','RECOMMEND','SOFT_CLOSE']);

/**
 * Post-answer progression is a safety/continuity gate, not a second planner.
 *
 * The semantic planner has already chosen the conversational +1. We preserve
 * that compatible action after the factual answer and only force transitions
 * that are operationally protected (purchase/handoff/closing continuity).
 * This keeps SPIN/FAB/LAER advisory instead of turning them into mandatory
 * state-machine steps that can make the bot ask something the customer just
 * told us.
 */
export function evaluatePostAnswerCommercialProgression(input:ProgressionInput):ProgressionResult{
  const intent=String(input.intent??'').toUpperCase();
  const current=String(input.currentNba??'ANSWER_ONLY').toUpperCase();
  const state=input.state??{};

  if(state.purchaseSignal||intent==='PURCHASE'||CLOSING_ACTIONS.has(current)){
    return{
      level:'HIGH',
      candidateNba:CLOSING_ACTIONS.has(current)?current:'COLLECT_RESERVATION_DATA',
      reason:'PURCHASE_CONTINUITY',
    };
  }

  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT'){
    return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};
  }

  if(current==='OFFER_ALTERNATIVE'){
    if((input.verifiedAlternatives??0)>0){
      return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'SEMANTIC_ALTERNATIVE_WITH_VERIFIED_OPTIONS'};
    }
    return{level:'LOW',candidateNba:'ANSWER_ONLY',reason:'NO_VERIFIED_ALTERNATIVE'};
  }

  if(MEDIUM_ACTIONS.has(current)){
    return{level:'MEDIUM',candidateNba:current,reason:'SEMANTIC_COMMERCIAL_ACTION_PRESERVED'};
  }

  if(current==='ASK_MISSING_FACT'){
    return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:'SEMANTIC_DISCOVERY_PRESERVED'};
  }

  return{
    level:'LOW',
    candidateNba:'ANSWER_ONLY',
    reason:input.verifiedCurrentAnswer?'CURRENT_QUESTION_ANSWERED':'NO_SAFE_ADDITIONAL_PROGRESSION',
  };
}

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

type ProgressionResult={
  level:ProgressionLevel;
  candidateNba:string;
  reason:string;
};

const CLOSING_ACTIONS=new Set(['COLLECT_RESERVATION_DATA','ASSISTED_HANDOFF','EXECUTE_RESERVATION']);
const PROGRESSABLE_ANSWERS=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','CAPABILITY','ATTRIBUTE','PRODUCT_INFO','EVALUATE_USE']);
const EXPLORATORY_FACTUAL_INTENTS=new Set(['CAPABILITY','ATTRIBUTE','PRODUCT_INFO','EVALUATE_USE']);

function hasDecisionContext(state:ConversationState):boolean{
  return Boolean(state.useCase||state.problem||(state.priorities?.length??0)>0);
}

function hasMeaningfulHistory(state:ConversationState):boolean{
  const events=new Set(state.interestEvents??[]);
  return events.size>=2||Boolean((state.spinFacts?.length??0)>=2||state.pendingCommercialAction);
}

/**
 * Evaluates commercial value after the current question has been resolved.
 * This function only proposes one bounded NBA. CommercialCapabilities remains
 * the authority that decides whether that proposal is executable this turn.
 */
export function evaluatePostAnswerCommercialProgression(input:ProgressionInput):ProgressionResult{
  const intent=String(input.intent??'').toUpperCase();
  const current=String(input.currentNba??'ANSWER_ONLY').toUpperCase();
  const state=input.state??{};

  if(state.purchaseSignal||intent==='PURCHASE'||CLOSING_ACTIONS.has(current)){
    return{level:'HIGH',candidateNba:CLOSING_ACTIONS.has(current)?current:'COLLECT_RESERVATION_DATA',reason:'PURCHASE_CONTINUITY'};
  }

  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT'){
    return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};
  }

  const explicitInterest=Boolean(state.interestSignal||state.selectedProduct);
  if(explicitInterest&&input.resolvedProduct&&PROGRESSABLE_ANSWERS.has(intent)){
    return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST'};
  }

  if(!['ANSWER_ONLY','ASK_MISSING_FACT'].includes(current)){
    return{level:'MEDIUM',candidateNba:current,reason:'EXISTING_HIGHER_VALUE_ACTION'};
  }

  if(state.objection&&(input.verifiedAlternatives??0)>0){
    return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'OBJECTION_WITH_VERIFIED_ALTERNATIVE'};
  }

  // A generic product overview has already delivered several verified facts.
  // If we still do not know the customer's use/problem/priority, one useful
  // question is more valuable than appending another arbitrary spec.
  if(intent==='PRODUCT_INFO'&&current==='ASK_MISSING_FACT'&&!hasDecisionContext(state)){
    return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:'OVERVIEW_NEEDS_ONE_DECISION_CRITERION'};
  }

  // While the customer is still exploring product facts, prefer one useful
  // related continuation over repeatedly pushing a stock/close CTA.
  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&input.relatedValueAvailable&&EXPLORATORY_FACTUAL_INTENTS.has(intent)){
    return{level:'LOW',candidateNba:'RELATED_VALUE',reason:'EXPLORATORY_VERIFIED_CONTINUATION'};
  }

  const score=Math.max(0,Math.min(100,Number(state.levelOfInterest??0)));
  const matureContext=score>=20&&hasDecisionContext(state)&&hasMeaningfulHistory(state);
  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&matureContext&&PROGRESSABLE_ANSWERS.has(intent)){
    if((input.verifiedAlternatives??0)>=2){
      return{level:'MEDIUM',candidateNba:'COMPARE',reason:'VERIFIED_ALTERNATIVES'};
    }
    return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'MATURE_VERIFIED_CONTEXT'};
  }

  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&input.relatedValueAvailable&&PROGRESSABLE_ANSWERS.has(intent)){
    return{level:'LOW',candidateNba:'RELATED_VALUE',reason:'LIGHT_VERIFIED_CONTINUATION'};
  }

  return{level:'LOW',candidateNba:current==='ASK_MISSING_FACT'?current:'ANSWER_ONLY',reason:'NO_USEFUL_EXECUTABLE_PROGRESSION'};
}

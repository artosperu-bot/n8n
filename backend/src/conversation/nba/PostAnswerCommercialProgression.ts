import type { ConversationState } from '../../domain/types.ts';
import { evaluateSpinReadiness } from './SpinProgression.ts';

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
const PROGRESSABLE_ANSWERS=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','EVALUATE_USE']);

function hasDecisionContext(state:ConversationState):boolean{
  return Boolean(state.useCase||state.problem||(state.priorities?.length??0)>=2);
}

function hasMeaningfulHistory(state:ConversationState):boolean{
  const events=new Set(state.interestEvents??[]);
  return events.size>=2||Boolean((state.spinFacts?.length??0)>=2||state.pendingCommercialAction);
}

export function evaluatePostAnswerCommercialProgression(input:ProgressionInput):ProgressionResult{
  const intent=String(input.intent??'').toUpperCase();
  const current=String(input.currentNba??'ANSWER_ONLY').toUpperCase();
  const state=input.state??{};

  if(state.purchaseSignal||intent==='PURCHASE'||CLOSING_ACTIONS.has(current))return{level:'HIGH',candidateNba:CLOSING_ACTIONS.has(current)?current:'COLLECT_RESERVATION_DATA',reason:'PURCHASE_CONTINUITY'};

  // Commercial N+1 is gated by SPIN readiness, not by the mere existence of a
  // related feature. Once situation + need are known and the current product fit
  // has been grounded, the useful next step is stock/availability.
  const spin=evaluateSpinReadiness(state);
  const stockEligibleIntent=!['STOCK','PRICE','PRICE_AVAILABILITY','PURCHASE','HUMAN','QUOTE'].includes(intent);
  if(
    stockEligibleIntent
    && spin.readyForStock
    && input.verifiedCurrentAnswer
    && Boolean(input.resolvedProduct)
  )return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'SPIN_READY_FOR_STOCK'};

  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT')return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};

  // Without a qualified SPIN context, focused factual questions remain factual.
  if(['PRODUCT_INFO','CAPABILITY','ATTRIBUTE'].includes(intent))return{level:'LOW',candidateNba:'ANSWER_ONLY',reason:'FACTUAL_ANSWER_COMPLETE'};

  const explicitInterest=Boolean(state.interestSignal||state.selectedProduct);
  if(explicitInterest&&input.resolvedProduct&&PROGRESSABLE_ANSWERS.has(intent))return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST'};
  if(!['ANSWER_ONLY','ASK_MISSING_FACT'].includes(current))return{level:'MEDIUM',candidateNba:current,reason:'EXISTING_HIGHER_VALUE_ACTION'};
  if(state.objection&&(input.verifiedAlternatives??0)>0)return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'OBJECTION_WITH_VERIFIED_ALTERNATIVE'};

  const score=Math.max(0,Math.min(100,Number(state.levelOfInterest??0)));
  const matureContext=score>=20&&hasDecisionContext(state)&&hasMeaningfulHistory(state);
  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&matureContext&&PROGRESSABLE_ANSWERS.has(intent)){
    if((input.verifiedAlternatives??0)>=2)return{level:'MEDIUM',candidateNba:'COMPARE',reason:'VERIFIED_ALTERNATIVES'};
    return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'MATURE_VERIFIED_CONTEXT'};
  }

  return{level:'LOW',candidateNba:current==='ASK_MISSING_FACT'?current:'ANSWER_ONLY',reason:'NO_USEFUL_EXECUTABLE_PROGRESSION'};
}

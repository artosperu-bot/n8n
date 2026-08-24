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
const HIGHER_VALUE_ACTIONS=new Set(['RECOMMEND','COMPARE','OFFER_ALTERNATIVE']);

export function evaluatePostAnswerCommercialProgression(input:ProgressionInput):ProgressionResult{
  const intent=String(input.intent??'').toUpperCase();
  const current=String(input.currentNba??'ANSWER_ONLY').toUpperCase();
  const state=input.state??{};
  const spin=evaluateSpinReadiness(state);
  const previousNba=String(state.lastNba??state.pendingCommercialAction??'').toUpperCase();

  if(state.purchaseSignal||intent==='PURCHASE'||CLOSING_ACTIONS.has(current))return{level:'HIGH',candidateNba:CLOSING_ACTIONS.has(current)?current:'COLLECT_RESERVATION_DATA',reason:'PURCHASE_CONTINUITY'};

  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT')return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};

  // The requested commercial operation (compare/recommend/alternative) is part
  // of resolving the current turn and outranks a later stock CTA.
  if(HIGHER_VALUE_ACTIONS.has(current))return{level:'MEDIUM',candidateNba:current,reason:'CURRENT_COMMERCIAL_ACTION_FIRST'};

  if(state.objection&&(input.verifiedAlternatives??0)>0)return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'OBJECTION_WITH_VERIFIED_ALTERNATIVE'};

  // Broad product information is discovery-friendly. Answer first, then ask the
  // one SPIN fact selected by the separate SPIN policy. A focused capability is
  // not permission to restart discovery.
  if(intent==='PRODUCT_INFO'&&input.verifiedCurrentAnswer&&Boolean(input.resolvedProduct)){
    if(spin.nextMissingFact)return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:'BROAD_PRODUCT_INFO_DISCOVERY'};
  }

  if(['CAPABILITY','ATTRIBUTE'].includes(intent)){
    const explicitCloseContext=Boolean(state.interestSignal||state.selectedProduct);
    if(
      explicitCloseContext
      && spin.readyForStock
      && previousNba!=='SOFT_CLOSE'
      && input.verifiedCurrentAnswer
      && Boolean(input.resolvedProduct)
    )return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST_AFTER_VERIFIED_FACT'};
    return{level:'LOW',candidateNba:'ANSWER_ONLY',reason:'FACTUAL_ANSWER_COMPLETE'};
  }

  // For consultative turns, keep advancing discovery one useful question at a
  // time until the customer has supplied enough context. Budget is not a generic
  // SPIN stage; objection/budget intents handle it explicitly before this point.
  if(['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','PRODUCT_INFO'].includes(intent)&&spin.nextMissingFact){
    return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:`SPIN_NEEDS_${spin.stage}`};
  }

  // Only after the current fit/recommendation is grounded do we allow the +1 to
  // become a stock/availability close. Do not repeat the same close on every
  // subsequent technical question.
  const consultativeCloseIntent=['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);
  if(
    consultativeCloseIntent
    && spin.readyForStock
    && previousNba!=='SOFT_CLOSE'
    && input.verifiedCurrentAnswer
    && Boolean(input.resolvedProduct)
  )return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'GROUNDED_FIT_READY_FOR_STOCK'};

  if(['PRICE','PRICE_AVAILABILITY','STOCK'].includes(intent)&&Boolean(state.interestSignal||state.selectedProduct)&&input.resolvedProduct){
    return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST'};
  }

  return{level:'LOW',candidateNba:current==='ASK_MISSING_FACT'&&spin.nextMissingFact?current:'ANSWER_ONLY',reason:'NO_USEFUL_EXECUTABLE_PROGRESSION'};
}

import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';
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
const HIGHER_VALUE_ACTIONS=new Set(['COMPARE','OFFER_ALTERNATIVE']);

function specificActionablePain(problem:string|null|undefined):boolean{
  const value=fold(problem??'');
  return /reparaciones repetidas|reparaciones_repetidas|caidas frecuentes|caidas_frecuentes|autonomia insuficiente|autonomia_insuficiente|exposicion agua polvo|exposicion_agua_polvo|polvo|humedad|lluvia|bateria.*(?:no dura|no llega)|(?:no dura|no llega).*bateria/.test(value);
}

export function evaluatePostAnswerCommercialProgression(input:ProgressionInput):ProgressionResult{
  const intent=String(input.intent??'').toUpperCase();
  const current=String(input.currentNba??'ANSWER_ONLY').toUpperCase();
  const state=input.state??{};
  const spin=evaluateSpinReadiness(state);
  const previousNba=String(state.lastNba??state.pendingCommercialAction??'').toUpperCase();
  const resolved=Boolean(input.resolvedProduct);
  const completedRecommendation=Boolean(
    current==='RECOMMEND'
    && resolved
    && input.verifiedCurrentAnswer
    && state.recommendedProduct
    && fold(state.recommendedProduct)===fold(input.resolvedProduct??'')
  );
  const actionableFit=Boolean(
    specificActionablePain(state.problem)
    || (state.useCase&&state.problem)
    || (state.priorities?.length??0)>0
    || (state.explicitPriorities?.length??0)>0
  );
  const consultative=['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);

  if(state.purchaseSignal||intent==='PURCHASE'||CLOSING_ACTIONS.has(current))return{level:'HIGH',candidateNba:CLOSING_ACTIONS.has(current)?current:'COLLECT_RESERVATION_DATA',reason:'PURCHASE_CONTINUITY'};

  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT')return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};

  if(state.objection&&(input.verifiedAlternatives??0)>0)return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'OBJECTION_WITH_VERIFIED_ALTERNATIVE'};

  if(completedRecommendation){
    return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'COMPLETED_RECOMMENDATION_READY_FOR_COMMERCIAL_RESULT'};
  }

  if(consultative&&spin.nextMissingFact){
    return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:`SPIN_NEEDS_${spin.stage}`};
  }

  if(current==='RECOMMEND'){
    if(consultative&&resolved&&input.verifiedCurrentAnswer&&actionableFit&&spin.readyForStock)return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'GROUNDED_RECOMMENDATION_READY_FOR_COMMERCIAL_RESULT'};
    return{level:'MEDIUM',candidateNba:'RECOMMEND',reason:'CURRENT_RECOMMENDATION_NOT_YET_READY_TO_CLOSE'};
  }

  if(HIGHER_VALUE_ACTIONS.has(current))return{level:'MEDIUM',candidateNba:current,reason:'CURRENT_COMMERCIAL_ACTION_FIRST'};

  if(intent==='PRODUCT_INFO'&&input.verifiedCurrentAnswer&&resolved){
    if(spin.nextMissingFact)return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:'BROAD_PRODUCT_INFO_DISCOVERY'};
  }

  if(['CAPABILITY','ATTRIBUTE'].includes(intent)){
    const explicitCloseContext=Boolean(state.interestSignal||state.selectedProduct);
    if(explicitCloseContext&&spin.readyForStock&&previousNba!=='SOFT_CLOSE'&&input.verifiedCurrentAnswer&&resolved)return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST_AFTER_VERIFIED_FACT'};
    return{level:'LOW',candidateNba:'ANSWER_ONLY',reason:'FACTUAL_ANSWER_COMPLETE'};
  }

  if(consultative&&actionableFit&&spin.readyForStock&&resolved&&input.verifiedCurrentAnswer&&previousNba!=='SOFT_CLOSE')return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'ACTIONABLE_FIT_READY_FOR_COMMERCIAL_RESULT'};

  if(intent==='PRODUCT_INFO'&&spin.nextMissingFact){
    return{level:'LOW',candidateNba:'ASK_MISSING_FACT',reason:`SPIN_NEEDS_${spin.stage}`};
  }

  if(consultative&&spin.readyForStock&&previousNba!=='SOFT_CLOSE'&&input.verifiedCurrentAnswer&&resolved)return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'GROUNDED_FIT_READY_FOR_STOCK'};

  if(['PRICE','PRICE_AVAILABILITY','STOCK'].includes(intent)&&resolved&&input.verifiedCurrentAnswer)return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'PRICE_STOCK_READY_FOR_FULFILLMENT'};

  return{level:'LOW',candidateNba:current==='ASK_MISSING_FACT'&&spin.nextMissingFact?current:'ANSWER_ONLY',reason:'NO_USEFUL_EXECUTABLE_PROGRESSION'};
}
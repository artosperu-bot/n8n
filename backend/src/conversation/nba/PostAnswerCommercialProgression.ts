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
const PROGRESSABLE_ANSWERS=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','EVALUATE_USE']);
const EXPLORATORY_FACTUAL_INTENTS=new Set(['EVALUATE_USE']);

function hasDecisionContext(state:ConversationState):boolean{
  // A single inferred attribute priority (e.g. CAMARA from "¿tiene visión nocturna?")
  // is not enough to fabricate commercial context. Real use/problem or multiple
  // explicit criteria are required before translating a fact into consultative progression.
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
  if(/^CIERRE/.test(String(state.commercialStage??'').toUpperCase())&&current==='ASK_MISSING_FACT')return{level:'HIGH',candidateNba:'ANSWER_ONLY',reason:'CLOSING_STAGE_BLOCKS_DISCOVERY'};

  // FAB belongs to the current factual answer. Browsing a product or asking a
  // focused capability must not become a synthetic RELATED_VALUE / CTA merely
  // because context exists. A real purchase signal above remains authoritative.
  if(['PRODUCT_INFO','CAPABILITY','ATTRIBUTE'].includes(intent))return{level:'LOW',candidateNba:'ANSWER_ONLY',reason:'FACTUAL_ANSWER_COMPLETE'};

  const explicitInterest=Boolean(state.interestSignal||state.selectedProduct);
  if(explicitInterest&&input.resolvedProduct&&PROGRESSABLE_ANSWERS.has(intent))return{level:'HIGH',candidateNba:'SOFT_CLOSE',reason:'EXPLICIT_INTEREST'};
  if(!['ANSWER_ONLY','ASK_MISSING_FACT'].includes(current))return{level:'MEDIUM',candidateNba:current,reason:'EXISTING_HIGHER_VALUE_ACTION'};
  if(state.objection&&(input.verifiedAlternatives??0)>0)return{level:'MEDIUM',candidateNba:'OFFER_ALTERNATIVE',reason:'OBJECTION_WITH_VERIFIED_ALTERNATIVE'};

  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&input.relatedValueAvailable&&hasDecisionContext(state)&&EXPLORATORY_FACTUAL_INTENTS.has(intent))return{level:'LOW',candidateNba:'RELATED_VALUE',reason:'CONTEXTUAL_VERIFIED_CONTINUATION'};

  const score=Math.max(0,Math.min(100,Number(state.levelOfInterest??0)));
  const matureContext=score>=20&&hasDecisionContext(state)&&hasMeaningfulHistory(state);
  if(input.verifiedCurrentAnswer&&input.resolvedProduct&&matureContext&&PROGRESSABLE_ANSWERS.has(intent)){
    if((input.verifiedAlternatives??0)>=2)return{level:'MEDIUM',candidateNba:'COMPARE',reason:'VERIFIED_ALTERNATIVES'};
    return{level:'MEDIUM',candidateNba:'SOFT_CLOSE',reason:'MATURE_VERIFIED_CONTEXT'};
  }

  return{level:'LOW',candidateNba:current==='ASK_MISSING_FACT'?current:'ANSWER_ONLY',reason:'NO_USEFUL_EXECUTABLE_PROGRESSION'};
}

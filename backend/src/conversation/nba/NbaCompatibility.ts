import type { ConversationState } from '../../domain/types.ts';

const FACTUAL = new Set([
  'ATTRIBUTE','CAPABILITY','PRICE_AVAILABILITY','PRICE','STOCK',
  'IMAGES','IMAGE','POLICY','WARRANTY','ORDER_STATUS',
]);
const RELATED_VALUE_FACTUAL=new Set(['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','PRICE_AVAILABILITY','PRICE','STOCK']);

const ALLOWED: Record<string, Set<string>> = {
  GREETING:new Set(['ASK_MISSING_FACT','ANSWER_ONLY']),
  PRODUCT_INFO:new Set(['ASK_MISSING_FACT','ANSWER_ONLY','RELATED_VALUE','SOFT_CLOSE']),
  EVALUATE_USE:new Set(['ASK_MISSING_FACT','RECOMMEND','SOFT_CLOSE','ANSWER_ONLY']),
  BUDGET_CONSTRAINT:new Set(['ASK_MISSING_FACT','RECOMMEND','SOFT_CLOSE','ANSWER_ONLY']),
  RECOMMEND:new Set(['ASK_MISSING_FACT','RECOMMEND','SOFT_CLOSE','ANSWER_ONLY']),
  RECOMMEND_WITHIN_BUDGET:new Set(['ASK_MISSING_FACT','RECOMMEND','SOFT_CLOSE','ANSWER_ONLY']),
  COMPARE:new Set(['COMPARE','RECOMMEND','SOFT_CLOSE','ANSWER_ONLY']),
  OBJECTION:new Set(['ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','RECOMMEND','SOFT_CLOSE']),
  HANDLE_PRICE_OBJECTION:new Set(['ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','RECOMMEND','SOFT_CLOSE']),
  FULFILLMENT_SELECTION:new Set(['SOFT_CLOSE','ANSWER_ONLY']),
  CATALOG:new Set(['OFFER_ALTERNATIVE','ANSWER_ONLY','ASK_MISSING_FACT']),
  CATEGORIES:new Set(['OFFER_ALTERNATIVE','ANSWER_ONLY','ASK_MISSING_FACT']),
  SUBCATEGORIES:new Set(['OFFER_ALTERNATIVE','ANSWER_ONLY','ASK_MISSING_FACT']),
  OTHER:new Set(['ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE']),
};

function purchaseAction(state:ConversationState):string{return (state.quantity??1)>=2?'ASSISTED_HANDOFF':'COLLECT_RESERVATION_DATA';}

export function isNbaCompatible(intent:string, action:string|null|undefined, state:ConversationState={}):boolean {
  if (!action) return false;
  const i=String(intent??'').toUpperCase();
  const a=String(action??'').toUpperCase();
  if (state.purchaseSignal===true || i==='PURCHASE') return a===purchaseAction(state);
  if (['HUMAN','QUOTE'].includes(i)) return a==='ASSISTED_HANDOFF';
  if (FACTUAL.has(i)) return a==='ANSWER_ONLY'||a==='SOFT_CLOSE'||(a==='RELATED_VALUE'&&RELATED_VALUE_FACTUAL.has(i));
  return ALLOWED[i]?.has(a) ?? ALLOWED.OTHER.has(a);
}

export function compatibleNba(
  intent:string,
  state:ConversationState,
  proposed:string|null,
  fallback:string|null,
):string|null {
  const i=String(intent).toUpperCase();
  const deterministic=String(fallback??'').toUpperCase();
  if (state.purchaseSignal===true || i==='PURCHASE') return purchaseAction(state);
  if (['HUMAN','QUOTE'].includes(i)) return 'ASSISTED_HANDOFF';

  // A broad PRODUCT_INFO turn must progress with exactly one useful discovery
  // question when the deterministic authority says context is still missing.
  // The planner may choose the wording, but it cannot suppress that +1 by
  // downgrading the turn to ANSWER_ONLY. Once use/criteria exist, the fallback
  // becomes ANSWER_ONLY and the normal semantic-planner authority resumes.
  if(i==='PRODUCT_INFO'&&deterministic==='ASK_MISSING_FACT')return'ASK_MISSING_FACT';

  // The semantic planner is the conversational authority. Deterministic code
  // validates that its proposal is safe/compatible and only then falls back to
  // the bounded heuristic catalog. This prevents SPIN/NBA heuristics from
  // replacing an already-correct answer with a synthetic discovery step.
  if (isNbaCompatible(intent,proposed,state)) return String(proposed).toUpperCase();
  if (isNbaCompatible(intent,fallback,state)) return String(fallback).toUpperCase();
  if (FACTUAL.has(i)) return 'ANSWER_ONLY';
  return null;
}

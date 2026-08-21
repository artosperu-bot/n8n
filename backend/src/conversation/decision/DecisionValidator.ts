import type { ConversationState } from '../../domain/types.ts';
import type { TurnDecision } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { compatibleNba } from '../nba/NbaCompatibility.ts';

const INTENTS = new Set([
  'GREETING','PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','BUDGET_CONSTRAINT',
  'RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE','PRICE_AVAILABILITY','PRICE','STOCK',
  'IMAGES','IMAGE','POLICY','WARRANTY','OBJECTION','HANDLE_PRICE_OBJECTION','PURCHASE',
  'HUMAN','QUOTE','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS','OTHER',
]);

const NBAS = new Set([
  'ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE','ASSISTED_HANDOFF',
  'COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION',
]);

const NBA_ALIASES: Record<string,string> = {
  ASK_NEED:'ASK_MISSING_FACT',
  ASK_USE:'ASK_MISSING_FACT',
  ASK_BUDGET:'ASK_MISSING_FACT',
  ASK_PRIORITY:'ASK_MISSING_FACT',
  DISCOVER_ONE_FACT:'ASK_MISSING_FACT',
  CLARIFY_OR_HANDOFF:'ASK_MISSING_FACT',
  CONTINUE_BY_NEED:'ANSWER_ONLY',
  CONNECT_TO_USE:'ANSWER_ONLY',
  WAIT_FOR_NEXT_QUESTION:'ANSWER_ONLY',
  WAIT_FOR_PRODUCT_QUESTION:'ANSWER_ONLY',
  RETURN_TO_PRODUCT:'ANSWER_ONLY',
  ADVANCE_IF_INTEREST:'SOFT_CLOSE',
  RECOMMEND_BY_NEED:'RECOMMEND',
  RECOMMEND_BY_PRIORITY:'RECOMMEND',
  EXPLAIN_FIT:'SOFT_CLOSE',
  ADDRESS_OBJECTION:'OFFER_ALTERNATIVE',
  OFFER_ALTERNATIVES:'OFFER_ALTERNATIVE',
  GUIDE_SELECTION:'OFFER_ALTERNATIVE',
};

const STAGES = new Set(['INICIAL','DESCUBRIMIENTO','CONSIDERACION','EVALUACION','OBJECION','CIERRE','CIERRE_ASISTIDO']);

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
}
function editDistance(a:string,b:string):number {
  const rows=a.length+1,cols=b.length+1;
  const d=Array.from({length:rows},()=>Array<number>(cols).fill(0));
  for(let i=0;i<rows;i++)d[i][0]=i;
  for(let j=0;j<cols;j++)d[0][j]=j;
  for(let i=1;i<rows;i++)for(let j=1;j<cols;j++){
    const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}
function fuzzyCanonical(raw:string,universe:string[]):string|null {
  const parts=fold(raw).match(/[a-z0-9]+/g)??[];
  const model=parts.find(x=>/\d/.test(x));
  if(!model)return null;
  const scored=universe.map(product=>{
    const p=fold(product).match(/[a-z0-9]+/g)??[];
    const modelMatch=p.includes(model)?3:0;
    const family=p.filter(x=>!/[0-9]/.test(x)&&x.length>=4);
    const familyMatch=family.some(word=>parts.some(q=>q===word||(q.length>=4&&editDistance(q,word)<=1)))?1:0;
    return {product,score:modelMatch+familyMatch};
  }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score);
  if(!scored.length)return null;
  if(scored[1]&&scored[1].score===scored[0].score)return null;
  return scored[0].product;
}
function knownCanonical(value: string | null | undefined, universe: string[]): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const f = fold(raw);
  return universe.find(p => fold(p) === f || fold(p).includes(f) || f.includes(fold(p))) ?? fuzzyCanonical(raw,universe);
}
function looksLikeProductModel(value:string|null|undefined):boolean {
  const raw=String(value??'').trim();
  if(!raw||raw.length>48)return false;
  const t=fold(raw);
  return /[a-z]/.test(t)&&/\d/.test(t)&&t.split(/\s+/).length<=5;
}
function canonicalIntent(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase();
  return INTENTS.has(v) ? v : null;
}
function canonicalNba(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase();
  const normalized = NBA_ALIASES[v] ?? v;
  return NBAS.has(normalized) ? normalized : null;
}
function canonicalStage(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase();
  return STAGES.has(v) ? v : null;
}
function canonicalReference(value: string | null | undefined, fallback: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase();
  const aliases: Record<string,string> = {
    SELECTION:'SELECTION_REFERENT',
    NAMED:'NAMED_QUERY_TARGET',
    RECOMMENDED:'RECOMMENDED_REFERENT',
    OTHER:'COMPARISON_ALTERNATIVE',
  };
  const normalized = aliases[v] ?? v;
  const allowed = new Set([
    'ACTIVE_PRODUCT_FALLBACK','UNKNOWN_PRODUCT_MENTION','EXPLICIT_PRODUCT_SWITCH','MULTI_PRODUCT_MENTION',
    'NAMED_QUERY_TARGET','SELECTION_REFERENT','RECOMMENDED_REFERENT','COMPARISON_ALTERNATIVE','RECOMMENDED_FALLBACK',
  ]);
  if (allowed.has(normalized)) return normalized;
  const fb = String(fallback ?? '').trim().toUpperCase();
  return allowed.has(fb) ? fb : null;
}
function forcedSql(intent: string): boolean {
  return ['PRICE','PRICE_AVAILABILITY','STOCK','IMAGE','IMAGES','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS','QUOTE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent);
}
function forcedProductRag(intent: string): boolean {
  return ['PRODUCT_INFO','CAPABILITY','ATTRIBUTE','EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE','HANDLE_PRICE_OBJECTION','OBJECTION'].includes(intent);
}
function forcedInstitutionalRag(intent: string): boolean {
  return ['POLICY','WARRANTY'].includes(intent);
}

export function validateTurnDecision(
  decision: TurnDecision,
  state: ConversationState,
  catalogCandidates: string[] = [],
  fallbackDecision?: TurnDecision,
): TurnDecision {
  const universe = unique([
    ...catalogCandidates,
    state.activeProduct,
    state.queryTarget,
    state.salientProduct,
    state.selectedProduct,
    state.recommendedProduct,
    ...(state.comparisonProducts ?? []),
  ]);

  const fallbackIntent = canonicalIntent(fallbackDecision?.primaryIntent);
  const fallbackReference = canonicalReference(fallbackDecision?.referenceType, null);
  const decisionAttributes = unique((decision.attributes ?? []).map(x => String(x).toUpperCase()));
  const fallbackAttributes = unique((fallbackDecision?.attributes ?? []).map(x => String(x).toUpperCase()));
  const currentMentions = unique([
    ...(decision.mentionedProducts ?? []).map(p => knownCanonical(p, universe)),
    ...(fallbackDecision?.mentionedProducts ?? []).map(p => knownCanonical(p, universe)),
  ]).filter(p => catalogCandidates.some(c => fold(c) === fold(p)) || universe.some(c=>fold(c)===fold(p)));

  let primaryIntent = canonicalIntent(decision.primaryIntent)
    ?? fallbackIntent
    ?? 'OTHER';

  if (primaryIntent === 'COMPARE' && fallbackIntent !== 'COMPARE' && currentMentions.length < 2 && (state.comparisonProducts?.length ?? 0) < 2) {
    primaryIntent = fallbackIntent ?? 'OTHER';
  }

  const specificAttributeAuthority = fallbackIntent === 'CAPABILITY' && fallbackAttributes.length > 0;
  if (specificAttributeAuthority && ['PRODUCT_INFO','OTHER','EVALUATE_USE'].includes(primaryIntent)) {
    primaryIntent = 'CAPABILITY';
  }

  let referenceType = canonicalReference(decision.referenceType, fallbackDecision?.referenceType);
  const recentSelection = knownCanonical(state.selectedProduct ?? state.salientProduct, universe);
  const knownDecisionTarget=knownCanonical(decision.targetProduct,universe);
  const knownFallbackTarget=knownCanonical(fallbackDecision?.targetProduct,universe);
  let targetProduct = knownDecisionTarget ?? knownFallbackTarget;

  if (currentMentions.length === 1) {
    targetProduct = currentMentions[0];
    if (!(fallbackDecision?.explicitSwitch === true)) referenceType = 'NAMED_QUERY_TARGET';
  }

  if(currentMentions.length===0&&knownFallbackTarget&&['ACTIVE_PRODUCT_FALLBACK','RECOMMENDED_FALLBACK','RECOMMENDED_REFERENT','COMPARISON_ALTERNATIVE','SELECTION_REFERENT'].includes(String(fallbackReference??''))){
    targetProduct=knownFallbackTarget;
    referenceType=fallbackReference;
  }

  const activeFold=fold(state.activeProduct??'');
  const purchaseNewCandidates=catalogCandidates.filter(p=>!activeFold||fold(p)!==activeFold);
  const sqlPurchaseTarget=fallbackIntent==='PURCHASE'
    ? (purchaseNewCandidates.length===1 ? purchaseNewCandidates[0] : (!state.activeProduct&&catalogCandidates.length===1 ? catalogCandidates[0] : null))
    : null;
  if(sqlPurchaseTarget){
    targetProduct=sqlPurchaseTarget;
    referenceType='SELECTION_REFERENT';
  }

  if (!targetProduct && catalogCandidates.length === 1) targetProduct = catalogCandidates[0];

  if (referenceType === 'SELECTION_REFERENT' && recentSelection && !sqlPurchaseTarget) {
    targetProduct = recentSelection;
  }

  if (!state.activeProduct && fallbackReference === 'RECOMMENDED_FALLBACK' && knownFallbackTarget) {
    targetProduct = knownFallbackTarget;
    referenceType = 'RECOMMENDED_FALLBACK';
  }

  if (referenceType === 'ACTIVE_PRODUCT_FALLBACK' && !state.activeProduct && fallbackReference) {
    referenceType = fallbackReference;
  }

  if (!targetProduct) {
    const rawUnknown=String(fallbackDecision?.targetProduct ?? decision.targetProduct ?? '').trim();
    if(looksLikeProductModel(rawUnknown)) targetProduct=rawUnknown;
  }

  const deterministicSelectionAuthorized = fallbackDecision?.explicitSwitch === true
    || ['SELECTION_REFERENT','EXPLICIT_PRODUCT_SWITCH'].includes(String(fallbackReference??''));
  const referentialSelectionAuthorized = !fallbackDecision && referenceType === 'SELECTION_REFERENT' && Boolean(recentSelection);
  const selectionAuthorized = deterministicSelectionAuthorized || referentialSelectionAuthorized || Boolean(sqlPurchaseTarget);
  let selectedProduct = selectionAuthorized
    ? (sqlPurchaseTarget ? targetProduct : knownCanonical(fallbackDecision?.selectedProduct ?? decision.selectedProduct ?? targetProduct, universe) ?? recentSelection)
    : knownCanonical(state.selectedProduct, universe);

  if(referenceType==='SELECTION_REFERENT'&&recentSelection&&!sqlPurchaseTarget)selectedProduct=recentSelection;
  const explicitSwitch = Boolean(selectionAuthorized && selectedProduct && fold(selectedProduct)!==fold(state.activeProduct??''));

  const proposedNba = canonicalNba(decision.nextBestAction);
  const fallbackNba = canonicalNba(fallbackDecision?.nextBestAction);
  const nextBestAction = compatibleNba(primaryIntent,state,proposedNba,fallbackNba);

  let comparisonProducts = unique([
    ...(decision.comparisonProducts ?? []).map(p => knownCanonical(p, universe)),
    ...(fallbackDecision?.comparisonProducts ?? []).map(p => knownCanonical(p, universe)),
    ...(state.comparisonProducts ?? []).map(p => knownCanonical(p, universe)),
  ]);
  const active = knownCanonical(state.activeProduct, universe);
  if (active && currentMentions.length === 1 && !explicitSwitch && fold(active) !== fold(currentMentions[0])) {
    comparisonProducts = unique([active, currentMentions[0], ...comparisonProducts]).slice(0,2);
  } else {
    comparisonProducts=comparisonProducts.slice(0,2);
  }

  const attributes = primaryIntent === 'CAPABILITY' && specificAttributeAuthority
    ? fallbackAttributes
    : decisionAttributes;
  const targetNeedsResolution = Boolean(targetProduct && !universe.some(p => fold(p) === fold(targetProduct!)));
  return {
    ...decision,
    primaryIntent,
    secondaryIntents: unique(decision.secondaryIntents ?? []).map(x => canonicalIntent(x)).filter((x): x is string => Boolean(x)),
    targetProduct,
    mentionedProducts: currentMentions,
    referenceType,
    explicitSwitch,
    selectedProduct,
    comparisonProducts,
    attributes,
    priorities: unique(decision.priorities ?? []),
    commercialStage: canonicalStage(decision.commercialStage) ?? canonicalStage(fallbackDecision?.commercialStage),
    spinContribution: typeof decision.spinContribution === 'string' && decision.spinContribution.trim() && !decision.spinContribution.includes('[object Object]')
      ? decision.spinContribution.trim().slice(0,240)
      : null,
    nextBestAction,
    needsSql: forcedSql(primaryIntent) || targetNeedsResolution,
    needsProductRag: forcedProductRag(primaryIntent),
    needsInstitutionalRag: forcedInstitutionalRag(primaryIntent),
    confidence: Number.isFinite(decision.confidence) ? Math.max(0, Math.min(1, decision.confidence)) : 0.5,
  };
}

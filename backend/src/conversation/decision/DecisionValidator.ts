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
function canonical(value: string | null | undefined, universe: string[]): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const f = fold(raw);
  return universe.find(p => fold(p) === f || fold(p).includes(f) || f.includes(fold(p))) ?? raw;
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
    ...(decision.mentionedProducts ?? []),
    ...(decision.comparisonProducts ?? []),
  ]);

  const fallbackIntent = canonicalIntent(fallbackDecision?.primaryIntent);
  const fallbackReference = canonicalReference(fallbackDecision?.referenceType, null);
  const fallbackTarget = canonical(fallbackDecision?.targetProduct, universe);
  const currentMentions = unique((decision.mentionedProducts ?? []).map(p => canonical(p, universe)))
    .filter(p => catalogCandidates.some(c => fold(c) === fold(p)));

  let primaryIntent = canonicalIntent(decision.primaryIntent)
    ?? fallbackIntent
    ?? 'OTHER';

  if (primaryIntent === 'COMPARE' && fallbackIntent !== 'COMPARE' && currentMentions.length < 2) {
    primaryIntent = fallbackIntent ?? 'OTHER';
  }

  let referenceType = canonicalReference(decision.referenceType, fallbackDecision?.referenceType);
  const recentSelection = canonical(state.selectedProduct ?? state.salientProduct, universe);
  let targetProduct = canonical(decision.targetProduct, universe);
  let selectedProduct = canonical(decision.selectedProduct, universe);

  if (currentMentions.length === 1) {
    targetProduct = currentMentions[0];
    if (!decision.explicitSwitch) referenceType = 'NAMED_QUERY_TARGET';
  }

  if (!targetProduct && catalogCandidates.length === 1) targetProduct = canonical(catalogCandidates[0], universe);

  if (referenceType === 'SELECTION_REFERENT' && recentSelection) {
    targetProduct = recentSelection;
    selectedProduct = recentSelection;
  }

  if (!state.activeProduct && fallbackReference === 'RECOMMENDED_FALLBACK' && fallbackTarget) {
    targetProduct = fallbackTarget;
    referenceType = 'RECOMMENDED_FALLBACK';
  }

  if (referenceType === 'ACTIVE_PRODUCT_FALLBACK' && !state.activeProduct && fallbackReference) {
    referenceType = fallbackReference;
  }

  const explicitSwitch = decision.explicitSwitch === true && Boolean(selectedProduct);
  const proposedNba = canonicalNba(decision.nextBestAction);
  const fallbackNba = canonicalNba(fallbackDecision?.nextBestAction);
  const nextBestAction = compatibleNba(primaryIntent,state,proposedNba,fallbackNba);

  let comparisonProducts = unique((decision.comparisonProducts?.length ? decision.comparisonProducts : state.comparisonProducts ?? []).map(p => canonical(p, universe)));
  const active = canonical(state.activeProduct, universe);
  if (active && currentMentions.length === 1 && !explicitSwitch && fold(active) !== fold(currentMentions[0])) {
    comparisonProducts = unique([active, currentMentions[0], ...comparisonProducts]).slice(0,2);
  }

  const targetNeedsResolution = Boolean(targetProduct && !catalogCandidates.some(p => fold(p) === fold(targetProduct!)));
  return {
    ...decision,
    primaryIntent,
    secondaryIntents: unique(decision.secondaryIntents ?? []).map(x => canonicalIntent(x)).filter((x): x is string => Boolean(x)),
    targetProduct,
    mentionedProducts: unique((decision.mentionedProducts ?? []).map(p => canonical(p, universe))),
    referenceType,
    explicitSwitch,
    selectedProduct,
    comparisonProducts,
    attributes: unique((decision.attributes ?? []).map(x => String(x).toUpperCase())),
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

import type { ConversationState } from '../../domain/types.ts';
import type { TurnDecision } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';

const INTENTS = new Set([
  'GREETING','PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','BUDGET_CONSTRAINT',
  'RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE','PRICE_AVAILABILITY','PRICE','STOCK',
  'IMAGES','IMAGE','POLICY','WARRANTY','OBJECTION','HANDLE_PRICE_OBJECTION','PURCHASE',
  'HUMAN','QUOTE','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS','OTHER',
]);
const NBAS = new Set([
  'ASK_NEED','CONTINUE_BY_NEED','ASK_USE','CONNECT_TO_USE','WAIT_FOR_NEXT_QUESTION',
  'ASK_BUDGET','RECOMMEND_BY_NEED','EXPLAIN_FIT','RECOMMEND_BY_PRIORITY','ASK_PRIORITY',
  'ADVANCE_IF_INTEREST','WAIT_FOR_PRODUCT_QUESTION','RETURN_TO_PRODUCT','ADDRESS_OBJECTION',
  'ASSISTED_HANDOFF','GUIDE_SELECTION','DISCOVER_ONE_FACT','OFFER_ALTERNATIVES','CLARIFY_OR_HANDOFF',
]);
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
  return NBAS.has(v) ? v : null;
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

  // A single current product mention is not, by itself, a comparison. If deterministic parsing
  // sees no comparison signal, do not let semantic overreach turn the message into COMPARE.
  if (primaryIntent === 'COMPARE' && fallbackIntent !== 'COMPARE' && currentMentions.length < 2) {
    primaryIntent = fallbackIntent ?? 'OTHER';
  }

  let referenceType = canonicalReference(decision.referenceType, fallbackDecision?.referenceType);
  const recentSelection = canonical(state.selectedProduct ?? state.salientProduct, universe);
  let targetProduct = canonical(decision.targetProduct, universe);
  let selectedProduct = canonical(decision.selectedProduct, universe);

  // A named current product found by the authoritative catalog becomes the turn target without
  // implying a switch of active product.
  if (currentMentions.length === 1) {
    targetProduct = currentMentions[0];
    if (!decision.explicitSwitch) referenceType = 'NAMED_QUERY_TARGET';
  }

  if (!targetProduct && catalogCandidates.length === 1) targetProduct = canonical(catalogCandidates[0], universe);

  if (referenceType === 'SELECTION_REFERENT' && recentSelection) {
    targetProduct = recentSelection;
    selectedProduct = recentSelection;
  }

  // After an unresolved product was answered with a verified recommendation, an ambiguous
  // follow-up must continue from that recommendation instead of resurrecting the stale unknown.
  if (!state.activeProduct && fallbackReference === 'RECOMMENDED_FALLBACK' && fallbackTarget) {
    targetProduct = fallbackTarget;
    referenceType = 'RECOMMENDED_FALLBACK';
  }

  if (referenceType === 'ACTIVE_PRODUCT_FALLBACK' && !state.activeProduct && fallbackReference) {
    referenceType = fallbackReference;
  }

  const explicitSwitch = decision.explicitSwitch === true && Boolean(selectedProduct);
  const purchaseLike = ['PURCHASE','HUMAN'].includes(primaryIntent);
  const proposedNba = canonicalNba(decision.nextBestAction);
  const fallbackNba = canonicalNba(fallbackDecision?.nextBestAction);
  const nextBestAction = purchaseLike ? 'ASSISTED_HANDOFF' : (proposedNba ?? fallbackNba);

  return {
    ...decision,
    primaryIntent,
    secondaryIntents: unique(decision.secondaryIntents ?? []).map(x => canonicalIntent(x)).filter((x): x is string => Boolean(x)),
    targetProduct,
    mentionedProducts: unique((decision.mentionedProducts ?? []).map(p => canonical(p, universe))),
    referenceType,
    explicitSwitch,
    selectedProduct,
    comparisonProducts: unique((decision.comparisonProducts?.length ? decision.comparisonProducts : state.comparisonProducts ?? []).map(p => canonical(p, universe))),
    attributes: unique((decision.attributes ?? []).map(x => String(x).toUpperCase())),
    priorities: unique(decision.priorities ?? []),
    commercialStage: canonicalStage(decision.commercialStage) ?? canonicalStage(fallbackDecision?.commercialStage),
    spinContribution: typeof decision.spinContribution === 'string' && decision.spinContribution.trim() && !decision.spinContribution.includes('[object Object]')
      ? decision.spinContribution.trim().slice(0,240)
      : null,
    nextBestAction,
    needsSql: decision.needsSql || forcedSql(primaryIntent) || Boolean(targetProduct && !catalogCandidates.some(p => fold(p) === fold(targetProduct!))),
    needsProductRag: decision.needsProductRag || forcedProductRag(primaryIntent),
    needsInstitutionalRag: decision.needsInstitutionalRag || forcedInstitutionalRag(primaryIntent),
    confidence: Number.isFinite(decision.confidence) ? Math.max(0, Math.min(1, decision.confidence)) : 0.5,
  };
}

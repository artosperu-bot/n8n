import type { ConversationState } from '../../domain/types.ts';
import type { TurnDecision } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
}
function canonical(value: string | null | undefined, universe: string[]): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const f = fold(raw);
  return universe.find(p => fold(p) === f || fold(p).includes(f) || f.includes(fold(p))) ?? raw;
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

export function validateTurnDecision(decision: TurnDecision, state: ConversationState, catalogCandidates: string[] = []): TurnDecision {
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

  const referenceType = String(decision.referenceType ?? '').toUpperCase();
  const recentSelection = canonical(state.selectedProduct ?? state.salientProduct, universe);
  let targetProduct = canonical(decision.targetProduct, universe);
  let selectedProduct = canonical(decision.selectedProduct, universe);

  // SQL/catalog identity is allowed to fill a missing semantic target, but never to choose
  // between several candidates. Ambiguity remains a conversation decision.
  if (!targetProduct && catalogCandidates.length === 1) targetProduct = canonical(catalogCandidates[0], universe);

  if (referenceType === 'SELECTION' && recentSelection) {
    targetProduct = recentSelection;
    selectedProduct = recentSelection;
  }

  const explicitSwitch = decision.explicitSwitch === true && Boolean(selectedProduct);
  const primaryIntent = String(decision.primaryIntent || 'OTHER');
  const purchaseLike = ['PURCHASE','HUMAN'].includes(primaryIntent) || state.purchaseSignal === true;
  const nextBestAction = purchaseLike ? 'ASSISTED_HANDOFF' : decision.nextBestAction;

  return {
    ...decision,
    primaryIntent,
    secondaryIntents: unique(decision.secondaryIntents ?? []),
    targetProduct,
    mentionedProducts: unique((decision.mentionedProducts ?? []).map(p => canonical(p, universe))),
    referenceType: decision.referenceType ?? null,
    explicitSwitch,
    selectedProduct,
    comparisonProducts: unique((decision.comparisonProducts?.length ? decision.comparisonProducts : state.comparisonProducts ?? []).map(p => canonical(p, universe))),
    attributes: unique((decision.attributes ?? []).map(x => String(x).toUpperCase())),
    priorities: unique(decision.priorities ?? []),
    nextBestAction,
    needsSql: decision.needsSql || forcedSql(primaryIntent) || Boolean(targetProduct && !catalogCandidates.some(p => fold(p) === fold(targetProduct!))),
    needsProductRag: decision.needsProductRag || forcedProductRag(primaryIntent),
    needsInstitutionalRag: decision.needsInstitutionalRag || forcedInstitutionalRag(primaryIntent),
    confidence: Number.isFinite(decision.confidence) ? Math.max(0, Math.min(1, decision.confidence)) : 0.5,
  };
}

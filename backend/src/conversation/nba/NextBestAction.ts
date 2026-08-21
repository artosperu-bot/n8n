import type { ConversationState } from '../../domain/types.ts';

/**
 * Bounded commercial next-best-action catalog.
 *
 * The action is intentionally coarse: it tells the writer what kind of move is
 * allowed next without forcing a scripted phrase. Facts still come from SQL/RAG
 * authorities; this layer only controls conversational progression.
 */
export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  // A strong purchase signal is terminal for discovery: never ask the customer
  // to re-explain needs once they already decided to advance.
  if (state.purchaseSignal) return 'ASSISTED_HANDOFF';

  switch (intent) {
    case 'GREETING':
      return 'ASK_MISSING_FACT';

    // Complete factual questions should be answered directly. The writer may
    // still be warm/commercial, but it must not manufacture a follow-up question.
    case 'PRODUCT_INFO':
    case 'ATTRIBUTE':
    case 'CAPABILITY':
    case 'PRICE_AVAILABILITY':
    case 'PRICE':
    case 'STOCK':
    case 'IMAGES':
    case 'IMAGE':
    case 'POLICY':
    case 'WARRANTY':
    case 'ORDER_STATUS':
      return 'ANSWER_ONLY';

    case 'EVALUATE_USE':
      if (!state.problem && !state.useCase) return 'ASK_MISSING_FACT';
      if (state.budget == null && !state.recommendedProduct && !state.activeProduct) return 'ASK_MISSING_FACT';
      if (!state.recommendedProduct && !state.activeProduct) return 'RECOMMEND';
      return 'SOFT_CLOSE';

    case 'BUDGET_CONSTRAINT':
      return state.problem || state.useCase || (state.priorities?.length ?? 0) > 0
        ? 'RECOMMEND'
        : 'ASK_MISSING_FACT';

    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET':
      return 'SOFT_CLOSE';

    case 'COMPARE':
      return (state.priorities?.length ?? 0) > 0 ? 'RECOMMEND' : 'COMPARE';

    case 'OBJECTION':
    case 'HANDLE_PRICE_OBJECTION':
      return 'OFFER_ALTERNATIVE';

    case 'PURCHASE':
    case 'HUMAN':
    case 'QUOTE':
      return 'ASSISTED_HANDOFF';

    case 'CATALOG':
    case 'CATEGORIES':
    case 'SUBCATEGORIES':
      return 'OFFER_ALTERNATIVE';

    default:
      return 'ASK_MISSING_FACT';
  }
}

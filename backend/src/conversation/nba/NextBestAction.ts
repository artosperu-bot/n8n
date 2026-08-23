import type { ConversationState } from '../../domain/types.ts';

/**
 * Bounded commercial next-best-action catalog.
 * Facts still come from SQL/RAG authorities; this layer only controls progression.
 */
export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  const normalized=String(intent??'').toUpperCase();
  const multiUnit=(state.quantity??1)>=2;

  if (state.purchaseSignal) return multiUnit ? 'ASSISTED_HANDOFF' : 'COLLECT_RESERVATION_DATA';

  switch (normalized) {
    case 'GREETING':
      return 'ASK_MISSING_FACT';

    case 'PRICE_AVAILABILITY':
    case 'PRICE':
    case 'STOCK':
      return state.selectedProduct || (state.interestSignal && state.activeProduct) ? 'SOFT_CLOSE' : 'ANSWER_ONLY';

    case 'PRODUCT_INFO':
      return state.useCase || state.problem || (state.priorities?.length ?? 0) > 0
        ? 'ANSWER_ONLY'
        : 'ASK_MISSING_FACT';

    case 'ATTRIBUTE':
    case 'CAPABILITY':
    case 'IMAGES':
    case 'IMAGE':
    case 'POLICY':
    case 'WARRANTY':
    case 'ORDER_STATUS':
      return 'ANSWER_ONLY';

    case 'EVALUATE_USE':
      if (!state.problem && !state.useCase && !(state.priorities?.length)) return 'ASK_MISSING_FACT';
      if (!state.recommendedProduct && !state.activeProduct) return 'RECOMMEND';
      return 'SOFT_CLOSE';

    case 'BUDGET_CONSTRAINT':
      return state.problem || state.useCase || (state.priorities?.length ?? 0) > 0
        ? 'RECOMMEND'
        : 'ASK_MISSING_FACT';

    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET':
      // The recommendation itself resolves the current consultative question.
      // Do not automatically turn every documentary recommendation into a stock CTA.
      // PostAnswerCommercialProgression may still promote a later step when real
      // interest, purchase intent or mature decision context justifies it.
      return 'ANSWER_ONLY';

    case 'COMPARE':
      return (state.priorities?.length ?? 0) > 0 ? 'RECOMMEND' : 'COMPARE';

    case 'OBJECTION':
    case 'HANDLE_PRICE_OBJECTION':
      return 'OFFER_ALTERNATIVE';

    case 'PURCHASE':
      return multiUnit ? 'ASSISTED_HANDOFF' : 'COLLECT_RESERVATION_DATA';
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

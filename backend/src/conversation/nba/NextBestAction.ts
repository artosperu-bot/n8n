import type { ConversationState } from '../../domain/types.ts';
import { evaluateSpinReadiness } from './SpinProgression.ts';

/**
 * Bounded commercial next-best-action catalog.
 * Facts still come from SQL/RAG authorities; this layer only controls the one
 * executable +1 after the current customer request is answered.
 *
 * SPIN is a separate authority: it says which discovery fact is missing. N+1
 * decides whether the current turn should ask that one fact or perform another
 * commercial action. Never execute two independent continuations in one turn.
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
      // SQL resolves price + availability together. Once a product is known,
      // the useful +1 is fulfillment (delivery vs pickup), not asking stock again.
      return state.activeProduct || state.selectedProduct || state.recommendedProduct ? 'SOFT_CLOSE' : 'ANSWER_ONLY';

    case 'PRODUCT_INFO': {
      const spin=evaluateSpinReadiness(state);
      return spin.nextMissingFact ? 'ASK_MISSING_FACT' : 'ANSWER_ONLY';
    }

    case 'ATTRIBUTE':
    case 'CAPABILITY':
    case 'IMAGES':
    case 'IMAGE':
    case 'WARRANTY':
    case 'ORDER_STATUS':
      return 'ANSWER_ONLY';

    case 'POLICY':
      // If the previous turn already offered delivery/pickup, a policy answer
      // such as "envío a Ate" or "prefiero recojo" should move one step to reservation.
      return state.activeProduct && String(state.pendingCommercialAction??state.lastNba??'').toUpperCase()==='SOFT_CLOSE'
        ? 'SOFT_CLOSE'
        : 'ANSWER_ONLY';

    case 'EVALUATE_USE': {
      const spin=evaluateSpinReadiness(state);
      if(spin.nextMissingFact)return'ASK_MISSING_FACT';
      if(!state.recommendedProduct&&!state.activeProduct)return'RECOMMEND';
      return'ANSWER_ONLY';
    }

    case 'BUDGET_CONSTRAINT':
      return state.problem || state.useCase || (state.priorities?.length ?? 0) > 0
        ? 'RECOMMEND'
        : 'ASK_MISSING_FACT';

    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET': {
      const spin=evaluateSpinReadiness(state);
      return spin.nextMissingFact ? 'ASK_MISSING_FACT' : 'ANSWER_ONLY';
    }

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

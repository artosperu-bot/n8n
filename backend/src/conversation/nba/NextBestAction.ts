import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

function specificActionablePain(problem:string|null|undefined):boolean{
  const value=fold(problem??'');
  return /reparaciones repetidas|reparaciones_repetidas|caidas frecuentes|caidas_frecuentes|autonomia insuficiente|autonomia_insuficiente|exposicion agua polvo|exposicion_agua_polvo|polvo|humedad|lluvia|bateria.*(?:no dura|no llega)|(?:no dura|no llega).*bateria/.test(value);
}

/**
 * Conservative deterministic fallback for the semantic planner.
 *
 * This function is deliberately not a conversation state machine. GPT may
 * propose the one useful commercial +1; deterministic code only supplies a
 * safe fallback when that proposal is absent/incompatible. SQL/RAG and side
 * effects remain authoritative elsewhere.
 */
export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  const normalized=String(intent??'').toUpperCase();
  const multiUnit=(state.quantity??1)>=2;
  const resolvedProduct=Boolean(state.activeProduct||state.selectedProduct||state.recommendedProduct);
  const enoughRecommendationContext=Boolean(
    specificActionablePain(state.problem)
    || state.useCase
    || (state.priorities?.length??0)>0
    || (state.explicitPriorities?.length??0)>0
  );

  if (state.purchaseSignal) return multiUnit ? 'ASSISTED_HANDOFF' : 'COLLECT_RESERVATION_DATA';

  switch (normalized) {
    case 'GREETING':
      return 'ASK_MISSING_FACT';

    case 'PRICE_AVAILABILITY':
    case 'PRICE':
    case 'STOCK':
    case 'ATTRIBUTE':
    case 'CAPABILITY':
    case 'IMAGES':
    case 'IMAGE':
    case 'WARRANTY':
    case 'ORDER_STATUS':
    case 'POLICY':
      return 'ANSWER_ONLY';

    case 'PRODUCT_INFO':
      return enoughRecommendationContext ? 'ANSWER_ONLY' : 'ASK_MISSING_FACT';

    case 'FULFILLMENT_SELECTION':
      return resolvedProduct ? 'SOFT_CLOSE' : 'ANSWER_ONLY';

    case 'EVALUATE_USE':
      if (resolvedProduct) return 'ANSWER_ONLY';
      return enoughRecommendationContext ? 'RECOMMEND' : 'ASK_MISSING_FACT';

    case 'BUDGET_CONSTRAINT':
      return enoughRecommendationContext ? 'RECOMMEND' : 'ASK_MISSING_FACT';

    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET':
      if (!resolvedProduct && !enoughRecommendationContext) return 'ASK_MISSING_FACT';
      return resolvedProduct ? 'ANSWER_ONLY' : 'RECOMMEND';

    case 'COMPARE':
      return 'COMPARE';

    case 'OBJECTION':
    case 'HANDLE_PRICE_OBJECTION':
      return 'ANSWER_ONLY';

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
      return 'ANSWER_ONLY';
  }
}

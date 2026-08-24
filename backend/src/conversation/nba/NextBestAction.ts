import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';
import { evaluateSpinReadiness } from './SpinProgression.ts';

function specificActionablePain(problem:string|null|undefined):boolean{
  const value=fold(problem??'');
  return /reparaciones repetidas|reparaciones_repetidas|caidas frecuentes|caidas_frecuentes|autonomia insuficiente|autonomia_insuficiente|exposicion agua polvo|exposicion_agua_polvo|polvo|humedad|lluvia|bateria.*(?:no dura|no llega)|(?:no dura|no llega).*bateria/.test(value);
}

/**
 * Bounded commercial next-best-action catalog.
 * Facts still come from SQL/RAG authorities; this layer only controls the one
 * executable +1 after the current customer request is answered.
 */
export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  const normalized=String(intent??'').toUpperCase();
  const multiUnit=(state.quantity??1)>=2;
  const resolvedProduct=Boolean(state.activeProduct||state.selectedProduct||state.recommendedProduct);
  const actionableFit=Boolean(
    specificActionablePain(state.problem)
    || (state.useCase&&state.problem)
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
      return resolvedProduct ? 'SOFT_CLOSE' : 'ANSWER_ONLY';

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

    case 'FULFILLMENT_SELECTION':
      return resolvedProduct ? 'SOFT_CLOSE' : 'ANSWER_ONLY';

    case 'POLICY':
      return state.activeProduct && String(state.pendingCommercialAction??state.lastNba??'').toUpperCase()==='SOFT_CLOSE'
        ? 'SOFT_CLOSE'
        : 'ANSWER_ONLY';

    case 'EVALUATE_USE': {
      if(resolvedProduct&&actionableFit)return'SOFT_CLOSE';
      const spin=evaluateSpinReadiness(state);
      if(spin.nextMissingFact)return'ASK_MISSING_FACT';
      if(!resolvedProduct)return'RECOMMEND';
      return'ANSWER_ONLY';
    }

    case 'BUDGET_CONSTRAINT':
      return state.problem || state.useCase || (state.priorities?.length ?? 0) > 0
        ? 'RECOMMEND'
        : 'ASK_MISSING_FACT';

    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET': {
      if(resolvedProduct&&actionableFit)return'SOFT_CLOSE';
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

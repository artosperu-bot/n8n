import type { ConversationState } from '../../domain/types.ts';

export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  switch (intent) {
    case 'GREETING': return 'ASK_NEED';
    case 'PRODUCT_INFO': return state.useCase ? 'CONTINUE_BY_NEED' : 'ASK_USE';
    case 'ATTRIBUTE':
    case 'CAPABILITY': return state.useCase || state.problem ? 'CONNECT_TO_USE' : 'WAIT_FOR_NEXT_QUESTION';
    case 'EVALUATE_USE':
      if (!state.problem && !state.useCase) return 'ASK_USE';
      if (state.budget == null) return 'ASK_BUDGET';
      if (!state.recommendedProduct && !state.activeProduct) return 'RECOMMEND_BY_NEED';
      return 'EXPLAIN_FIT';
    case 'BUDGET_CONSTRAINT':
      return state.problem || state.useCase || (state.priorities?.length ?? 0) > 0 ? 'RECOMMEND_BY_NEED' : 'ASK_NEED';
    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET': return 'EXPLAIN_FIT';
    case 'COMPARE': return (state.priorities ?? []).length ? 'RECOMMEND_BY_PRIORITY' : 'ASK_PRIORITY';
    case 'PRICE_AVAILABILITY':
    case 'PRICE':
    case 'STOCK': return 'ADVANCE_IF_INTEREST';
    case 'IMAGES':
    case 'IMAGE': return 'WAIT_FOR_PRODUCT_QUESTION';
    case 'POLICY':
    case 'WARRANTY': return state.activeProduct || state.recommendedProduct ? 'RETURN_TO_PRODUCT' : 'WAIT_FOR_NEXT_QUESTION';
    case 'OBJECTION':
    case 'HANDLE_PRICE_OBJECTION': return 'ADDRESS_OBJECTION';
    case 'PURCHASE':
    case 'HUMAN':
    case 'QUOTE': return 'ASSISTED_HANDOFF';
    case 'CATALOG':
    case 'CATEGORIES':
    case 'SUBCATEGORIES': return 'GUIDE_SELECTION';
    case 'ORDER_STATUS': return null;
    default: return 'DISCOVER_ONE_FACT';
  }
}

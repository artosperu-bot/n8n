import type { ConversationState } from '../../domain/types.ts';

export function nextBestAction(intent: string, state: ConversationState = {}): string | null {
  switch (intent) {
    case 'GREETING': return 'ASK_NEED';
    case 'PRODUCT_INFO': return state.useCase ? 'CONTINUE_BY_NEED' : 'ASK_USE';
    case 'ATTRIBUTE': return 'CONNECT_TO_USE';
    case 'EVALUATE_USE':
      if (!state.problem && !state.useCase) return 'ASK_USE';
      if (state.budget == null) return 'ASK_BUDGET';
      if (!state.activeProduct) return 'RECOMMEND_BY_NEED';
      return 'EXPLAIN_FIT';
    case 'RECOMMEND':
    case 'RECOMMEND_WITHIN_BUDGET': return 'EXPLAIN_FIT';
    case 'COMPARE': return (state.priorities ?? []).length ? 'RECOMMEND_BY_PRIORITY' : 'ASK_PRIORITY';
    case 'PRICE_AVAILABILITY':
    case 'PRICE':
    case 'STOCK': return 'ADVANCE_IF_INTEREST';
    case 'IMAGES':
    case 'IMAGE': return 'WAIT_FOR_PRODUCT_QUESTION';
    case 'POLICY':
    case 'WARRANTY': return state.activeProduct ? 'RETURN_TO_PRODUCT' : 'ASK_PRODUCT';
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

export function nextBestAction(intent:string):string|null {
  switch(intent){
    case 'PRICE': return 'ADVANCE_IF_INTEREST';
    case 'STOCK': return 'RESERVE_OR_CONTINUE';
    case 'IMAGE': return 'WAIT_FOR_PRODUCT_QUESTION';
    case 'PURCHASE': return 'RESERVE_24H';
    case 'QUOTE': return 'CONFIRM_PRODUCT_AND_QUANTITY';
    case 'BUDGET_CONSTRAINT': return 'DISCOVER_USE_OR_CRITERION';
    case 'RECOMMEND_WITHIN_BUDGET':
    case 'RECOMMEND': return 'EXPLAIN_FIT';
    case 'HANDLE_PRICE_OBJECTION': return 'OFFER_VERIFIED_ALTERNATIVE';
    case 'COMPARE': return 'RECOMMEND_BY_NEED';
    case 'CAPABILITY': return 'CONNECT_BENEFIT_TO_NEED';
    case 'WARRANTY':
    case 'POLICY': return 'RETURN_TO_PURCHASE';
    case 'GREETING': return 'DISCOVER_NEED';
    default: return 'DISCOVER_ONE_FACT';
  }
}

export type RecommendationAuthorityInput={
  intent:string;
  nba:string;
  hasTarget:boolean;
  hasDecisionContext:boolean;
};

export type SemanticUseCaseMergeInput={
  previousUseCase?:string|null;
  fallbackUseCase?:string|null;
  semanticUseCase?:string|null;
};

function clean(value:string|null|undefined):string|null{
  const normalized=value?.trim();
  return normalized?normalized:null;
}

function isGenericFallbackUseCase(value:string):boolean{
  const normalized=value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .trim();
  return ['trabajo','laboral','uso laboral','uso de trabajo'].includes(normalized);
}

/**
 * Ranking alternative products is a commercial action, not a side effect of
 * merely detecting a price objection. The semantic planner/NBA must authorize
 * the alternative path explicitly.
 */
export function shouldUseRecommendationCandidates(input:RecommendationAuthorityInput):boolean{
  if(input.intent==='RECOMMEND'||input.intent==='RECOMMEND_WITHIN_BUDGET') return true;

  if(input.intent==='HANDLE_PRICE_OBJECTION'){
    return input.nba==='OFFER_ALTERNATIVE'||input.nba==='RECOMMEND';
  }

  return input.intent==='EVALUATE_USE'&&!input.hasTarget&&input.hasDecisionContext;
}

/**
 * Durable prior context wins. For the current turn, a richer semantic use case
 * wins over a deliberately coarse deterministic fallback such as "trabajo".
 */
export function mergeSemanticUseCase(input:SemanticUseCaseMergeInput):string|null{
  const previous=clean(input.previousUseCase);
  const fallback=clean(input.fallbackUseCase);
  const semantic=clean(input.semanticUseCase);

  if(previous) return previous;
  if(semantic&&(!fallback||isGenericFallbackUseCase(fallback))) return semantic;
  return fallback??semantic;
}

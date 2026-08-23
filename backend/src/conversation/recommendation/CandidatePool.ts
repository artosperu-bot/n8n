import type { ProductQuote, RecommendationDecisionTrace } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type CandidatePoolOptions={
  maxBudget:number|null;
  exclude:string|null;
};

export type CandidatePool={
  catalog:ProductQuote[];
  available:ProductQuote[];
  eligible:ProductQuote[];
  discarded:RecommendationDecisionTrace['discardedCandidates'];
};

function productName(q:ProductQuote):string{
  return String(q.shortName??q.product).trim()||q.product;
}
function same(a:string|null|undefined,b:string|null|undefined):boolean{
  return Boolean(a&&b&&fold(a)===fold(b));
}

/**
 * STECH-AUDIT:
 * ROLE: separates product existence from recommendation eligibility.
 * INPUT AUTHORITY: ERP catalog rows.
 * OUTPUT AUTHORITY: catalog / available / eligible candidate sets.
 * MAY DECIDE: budget, stock and explicit exclusion eligibility only.
 * MUST NOT DECIDE: recommendation winner, product facts or customer-facing wording.
 */
export function partitionRecommendationCandidates(
  rows:ProductQuote[],
  options:CandidatePoolOptions,
):CandidatePool{
  const catalog=[...rows];
  const available=catalog.filter(row=>row.stock==null||row.stock>0);
  const eligible:ProductQuote[]=[];
  const discarded:RecommendationDecisionTrace['discardedCandidates']=[];

  for(const row of catalog){
    const name=productName(row);
    // Budget is evaluated first so the trace records the first explicit business
    // constraint that excludes the candidate. Product existence is never erased.
    if(options.maxBudget!=null&&row.price!=null&&row.price>options.maxBudget){
      discarded.push({product:name,reason:'BUDGET'});
      continue;
    }
    if(row.stock!=null&&row.stock<=0){
      discarded.push({product:name,reason:'NO_STOCK'});
      continue;
    }
    if(options.exclude&&same(name,options.exclude)){
      discarded.push({product:name,reason:'EXCLUDED'});
      continue;
    }
    eligible.push(row);
  }

  return{catalog,available,eligible,discarded};
}

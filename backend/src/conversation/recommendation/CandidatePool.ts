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
 * ROLE: separates product existence, current availability and documentary eligibility.
 * INPUT AUTHORITY: ERP catalog rows.
 * OUTPUT AUTHORITY: catalog / available / eligible candidate sets.
 * MAY DECIDE: budget and explicit exclusion eligibility only.
 * MUST NOT DECIDE: technical capability truth, recommendation winner or customer-facing wording.
 * IMPORTANT: stock must not erase a product before RAG evaluates a hard technical requirement.
 * Availability remains separately exposed in `available`; downstream business ranking may still
 * prefer available products when no hard technical requirement is present.
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
    if(options.maxBudget!=null&&row.price!=null&&row.price>options.maxBudget){
      discarded.push({product:name,reason:'BUDGET'});
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

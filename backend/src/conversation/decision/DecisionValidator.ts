import type { ConversationState } from '../../domain/types.ts';
import type { TurnDecision } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { compatibleNba } from '../nba/NbaCompatibility.ts';
import { nextBestAction as deterministicNextBestAction } from '../nba/NextBestAction.ts';

const INTENTS=new Set(['GREETING','PRODUCT_INFO','ATTRIBUTE','CAPABILITY','EVALUATE_USE','BUDGET_CONSTRAINT','RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE','PRICE_AVAILABILITY','PRICE','STOCK','IMAGES','IMAGE','POLICY','FULFILLMENT_SELECTION','WARRANTY','OBJECTION','HANDLE_PRICE_OBJECTION','PURCHASE','HUMAN','QUOTE','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS','OTHER']);
const INTENT_ALIASES:Record<string,string>={
  PURCHASE_INTENT:'PURCHASE',BUY_PRODUCT:'PURCHASE',PURCHASE_CONFIRMATION:'PURCHASE',CONFIRM_PURCHASE:'PURCHASE',
  STOCK_CHECK:'STOCK',CHECK_AVAILABILITY:'STOCK',AVAILABILITY_QUERY:'STOCK',
  PRICE_QUERY:'PRICE',PRICE_INQUIRY:'PRICE',
  QUESTION_SPECIFIC_FEATURE:'CAPABILITY',PRODUCT_QUESTION:'CAPABILITY',HARDWARE_SPEC:'CAPABILITY',PRODUCT_FEATURE:'CAPABILITY',SPECIFICATION:'CAPABILITY',
};
const NBAS=new Set(['ANSWER_ONLY','ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE','ASSISTED_HANDOFF','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION']);
const NBA_ALIASES:Record<string,string>={ASK_NEED:'ASK_MISSING_FACT',ASK_USE:'ASK_MISSING_FACT',ASK_BUDGET:'ASK_MISSING_FACT',ASK_PRIORITY:'ASK_MISSING_FACT',DISCOVER_ONE_FACT:'ASK_MISSING_FACT',CLARIFY_OR_HANDOFF:'ASK_MISSING_FACT',CONTINUE_BY_NEED:'ANSWER_ONLY',CONNECT_TO_USE:'ANSWER_ONLY',WAIT_FOR_NEXT_QUESTION:'ANSWER_ONLY',WAIT_FOR_PRODUCT_QUESTION:'ANSWER_ONLY',RETURN_TO_PRODUCT:'ANSWER_ONLY',ADVANCE_IF_INTEREST:'SOFT_CLOSE',RECOMMEND_BY_NEED:'RECOMMEND',RECOMMEND_BY_PRIORITY:'RECOMMEND',EXPLAIN_FIT:'SOFT_CLOSE',ADDRESS_OBJECTION:'OFFER_ALTERNATIVE',OFFER_ALTERNATIVES:'OFFER_ALTERNATIVE',GUIDE_SELECTION:'OFFER_ALTERNATIVE'};
const STAGES=new Set(['INICIAL','DESCUBRIMIENTO','CONSIDERACION','EVALUACION','OBJECION','CIERRE','CIERRE_ASISTIDO']);
function unique(values:Array<string|null|undefined>):string[]{return[...new Set(values.map(v=>String(v??'').trim()).filter(Boolean))];}
function editDistance(a:string,b:string):number{const rows=a.length+1,cols=b.length+1,d=Array.from({length:rows},()=>Array<number>(cols).fill(0));for(let i=0;i<rows;i++)d[i][0]=i;for(let j=0;j<cols;j++)d[0][j]=j;for(let i=1;i<rows;i++)for(let j=1;j<cols;j++){const cost=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
function fuzzyCanonical(raw:string,bUniverse:string[]):string|null{const parts=fold(raw).match(/[a-z0-9]+/g)??[],model=parts.find(x=>/\d/.test(x));if(!model)return null;const scored=bUniverse.map(product=>{const p=fold(product).match(/[a-z0-9]+/g)??[],modelMatch=p.includes(model)?3:0,family=p.filter(x=>!/[0-9]/.test(x)&&x.length>=4),familyMatch=family.some(word=>parts.some(q=>q===word||(q.length>=4&&editDistance(q,word)<=1)))?1:0;return{product,score:modelMatch+familyMatch};}).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score);if(!scored.length||scored[1]&&scored[1].score===scored[0].score)return null;return scored[0].product;}
function knownCanonical(value:string|null|undefined,universe:string[]):string|null{const raw=String(value??'').trim();if(!raw)return null;const f=fold(raw);return universe.find(p=>fold(p)===f||fold(p).includes(f)||f.includes(fold(p)))??fuzzyCanonical(raw,universe);}
function looksLikeProductModel(value:string|null|undefined):boolean{const raw=String(value??'').trim();if(!raw||raw.length>48)return false;const t=fold(raw);return/[a-z]/.test(t)&&/\d/.test(t)&&t.split(/\s+/).length<=5;}
function canonicalOrModel(value:string|null|undefined,universe:string[]):string|null{const canonical=knownCanonical(value,universe);if(canonical)return canonical;const raw=String(value??'').trim();return looksLikeProductModel(raw)?raw:null;}
function canonicalIntent(value:string|null|undefined):string|null{const v=String(value??'').trim().toUpperCase(),normalized=INTENT_ALIASES[v]??v;return INTENTS.has(normalized)?normalized:null;}
function canonicalNba(value:string|null|undefined):string|null{const v=String(value??'').trim().toUpperCase(),normalized=NBA_ALIASES[v]??v;return NBAS.has(normalized)?normalized:null;}
function canonicalStage(value:string|null|undefined):string|null{const v=String(value??'').trim().toUpperCase();return STAGES.has(v)?v:null;}
function canonicalReference(value:string|null|undefined,fallback:string|null|undefined):string|null{const v=String(value??'').trim().toUpperCase(),aliases:Record<string,string>={SELECTION:'SELECTION_REFERENT',NAMED:'NAMED_QUERY_TARGET',RECOMMENDED:'RECOMMENDED_REFERENT',OTHER:'COMPARISON_ALTERNATIVE'},normalized=aliases[v]??v,allowed=new Set(['ACTIVE_PRODUCT_FALLBACK','UNKNOWN_PRODUCT_MENTION','EXPLICIT_PRODUCT_SWITCH','MULTI_PRODUCT_MENTION','NAMED_QUERY_TARGET','SELECTION_REFERENT','RECOMMENDED_REFERENT','COMPARISON_ALTERNATIVE','RECOMMENDED_FALLBACK']);if(allowed.has(normalized))return normalized;const fb=String(fallback??'').trim().toUpperCase();return allowed.has(fb)?fb:null;}
function forcedSql(intent:string):boolean{return['PRICE','PRICE_AVAILABILITY','STOCK','IMAGE','IMAGES','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS','QUOTE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent);}
function forcedProductRag(intent:string):boolean{return['PRODUCT_INFO','CAPABILITY','ATTRIBUTE','EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE','HANDLE_PRICE_OBJECTION','OBJECTION'].includes(intent);}
function forcedInstitutionalRag(intent:string):boolean{return['POLICY','WARRANTY'].includes(intent);}
function sameStringListContains(values:string[],target:string):boolean{return values.some(value=>fold(value)===fold(target));}
function sameProduct(a:string|null|undefined,b:string|null|undefined):boolean{return Boolean(a&&b&&fold(a)===fold(b));}
function strongStage(intent:string):string|null{if(intent==='PURCHASE')return'CIERRE';if(['HUMAN','QUOTE'].includes(intent))return'CIERRE_ASISTIDO';return null;}
function factualSemanticIntent(intent:string):boolean{return['PRODUCT_INFO','ATTRIBUTE','CAPABILITY','PRICE_AVAILABILITY','PRICE','STOCK','IMAGES','IMAGE','POLICY','FULFILLMENT_SELECTION','WARRANTY','ORDER_STATUS'].includes(intent);}

export function validateTurnDecision(decision:TurnDecision,state:ConversationState,catalogCandidates:string[]=[],fallbackDecision?:TurnDecision):TurnDecision{
  const universe=unique([...catalogCandidates,state.activeProduct,state.queryTarget,state.salientProduct,state.selectedProduct,state.recommendedProduct,...(state.comparisonProducts??[])]);
  const fallbackIntent=canonicalIntent(fallbackDecision?.primaryIntent),fallbackReference=canonicalReference(fallbackDecision?.referenceType,null),plannerReference=canonicalReference(decision.referenceType,fallbackDecision?.referenceType),decisionAttributes=unique((decision.attributes??[]).map(x=>String(x).toUpperCase())),fallbackAttributes=unique((fallbackDecision?.attributes??[]).map(x=>String(x).toUpperCase()));
  const currentMentions=unique([...(decision.mentionedProducts??[]).map(p=>knownCanonical(p,universe)),...(fallbackDecision?.mentionedProducts??[]).map(p=>knownCanonical(p,universe))]).filter(Boolean);
  const rawComparisonProducts=unique([...(decision.comparisonProducts??[]),...(fallbackDecision?.comparisonProducts??[]),...(state.comparisonProducts??[])]).map(p=>canonicalOrModel(p,universe)).filter((p):p is string=>Boolean(p));
  const plannerIntent=canonicalIntent(decision.primaryIntent);
  let primaryIntent=plannerIntent??fallbackIntent??'OTHER';

  if(fallbackIntent&&['OBJECTION','HANDLE_PRICE_OBJECTION'].includes(fallbackIntent)&&['OBJECTION','HANDLE_PRICE_OBJECTION'].includes(primaryIntent))primaryIntent=fallbackIntent;
  if(fallbackIntent==='EVALUATE_USE'&&['PRODUCT_INFO','OTHER','EVALUATE_USE'].includes(primaryIntent))primaryIntent='EVALUATE_USE';
  if(fallbackIntent&&['PURCHASE','HUMAN','QUOTE'].includes(fallbackIntent))primaryIntent=fallbackIntent;
  const contextualPurchaseContinuation=state.purchaseSignal===true&&String(state.lastIntent??'').toUpperCase()==='STOCK'&&String(state.lastNba??state.pendingCommercialAction??'').toUpperCase()==='SOFT_CLOSE'&&['OTHER',null].includes(plannerIntent as any)&&fallbackIntent==='OTHER';
  if(contextualPurchaseContinuation)primaryIntent='PURCHASE';

  if(primaryIntent==='PURCHASE'&&fallbackIntent!=='PURCHASE'&&state.purchaseSignal!==true)primaryIntent=fallbackIntent??'OTHER';

  if(primaryIntent==='COMPARE'&&fallbackIntent&&['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','BUDGET_CONSTRAINT'].includes(fallbackIntent))primaryIntent=fallbackIntent;

  const comparisonAuthority=fallbackIntent==='COMPARE'||(state.comparisonProducts?.length??0)>=2;
  if(primaryIntent==='COMPARE'&&!comparisonAuthority)primaryIntent=fallbackIntent??'OTHER';
  if(comparisonAuthority&&rawComparisonProducts.length>=2&&fallbackIntent==='COMPARE')primaryIntent='COMPARE';

  const specificAttributeAuthority=fallbackIntent==='CAPABILITY'&&fallbackAttributes.length>0;
  if(specificAttributeAuthority&&['PRODUCT_INFO','OTHER','EVALUATE_USE'].includes(primaryIntent))primaryIntent='CAPABILITY';

  let referenceType=plannerReference;
  const recentSelection=knownCanonical(state.selectedProduct??state.salientProduct,universe),knownDecisionTarget=knownCanonical(decision.targetProduct,universe),knownFallbackTarget=knownCanonical(fallbackDecision?.targetProduct,universe),activeFold=fold(state.activeProduct??''),newCatalogCandidates=catalogCandidates.filter(p=>!activeFold||fold(p)!==activeFold),uniqueNewCatalogTarget=newCatalogCandidates.length===1?newCatalogCandidates[0]:null;
  let targetProduct=knownDecisionTarget??knownFallbackTarget,authorityReason=knownDecisionTarget?'CANONICAL_PLANNER_TARGET':'CONTEXT_FALLBACK';

  if(currentMentions.length===1){targetProduct=currentMentions[0];authorityReason='CURRENT_MENTION';if(!(fallbackDecision?.explicitSwitch===true)&&fallbackReference!=='COMPARISON_ALTERNATIVE')referenceType='NAMED_QUERY_TARGET';}

  const factualFallback=['PRICE','STOCK','CAPABILITY','IMAGE','PRODUCT_INFO','FULFILLMENT_SELECTION'].includes(String(fallbackIntent??''));
  if(currentMentions.length===0&&fallbackReference==='ACTIVE_PRODUCT_FALLBACK'&&knownFallbackTarget&&factualFallback){targetProduct=knownFallbackTarget;referenceType='ACTIVE_PRODUCT_FALLBACK';authorityReason='ACTIVE_FACTUAL_FALLBACK';}

  if(currentMentions.length===0&&!knownDecisionTarget&&knownFallbackTarget&&['ACTIVE_PRODUCT_FALLBACK','RECOMMENDED_FALLBACK','RECOMMENDED_REFERENT','COMPARISON_ALTERNATIVE','SELECTION_REFERENT'].includes(String(fallbackReference??''))){targetProduct=knownFallbackTarget;referenceType=fallbackReference;authorityReason='CONTEXT_FALLBACK';}

  const purchaseIntent=primaryIntent==='PURCHASE';
  const decisionTargetIsCatalog=Boolean(knownDecisionTarget&&catalogCandidates.some(p=>sameProduct(p,knownDecisionTarget)));
  const namedPurchaseTarget=purchaseIntent&&decisionTargetIsCatalog&&plannerReference==='NAMED_QUERY_TARGET'?knownDecisionTarget:null;
  const contextualPurchaseTarget=purchaseIntent&&String(state.lastIntent??'').toUpperCase()==='STOCK'&&String(state.lastNba??state.pendingCommercialAction??'').toUpperCase()==='SOFT_CLOSE'
    ?knownCanonical(state.selectedProduct??state.recommendedProduct??state.activeProduct,universe)
    :null;
  const sqlPurchaseTarget=purchaseIntent&&!namedPurchaseTarget&&!contextualPurchaseTarget
    ?(newCatalogCandidates.length===1?newCatalogCandidates[0]:(!state.activeProduct&&catalogCandidates.length===1?catalogCandidates[0]:null))
    :null;
  if(namedPurchaseTarget){targetProduct=namedPurchaseTarget;referenceType='NAMED_QUERY_TARGET';authorityReason='NAMED_SQL_PURCHASE_SELECTION';}
  else if(contextualPurchaseTarget){targetProduct=contextualPurchaseTarget;referenceType='SELECTION_REFERENT';authorityReason='CONFIRMED_SOFT_CLOSE_SELECTION';}
  else if(sqlPurchaseTarget){targetProduct=sqlPurchaseTarget;referenceType='SELECTION_REFERENT';authorityReason='UNIQUE_SQL_PURCHASE_SELECTION';}

  if(!targetProduct&&catalogCandidates.length===1){targetProduct=catalogCandidates[0];authorityReason='ONLY_CATALOG_CANDIDATE';}
  if(referenceType==='SELECTION_REFERENT'&&recentSelection&&!sqlPurchaseTarget&&!namedPurchaseTarget&&!contextualPurchaseTarget){targetProduct=recentSelection;authorityReason='RECENT_SELECTION';}
  if(!state.activeProduct&&fallbackReference==='RECOMMENDED_FALLBACK'&&knownFallbackTarget){targetProduct=knownFallbackTarget;referenceType='RECOMMENDED_FALLBACK';authorityReason='RECOMMENDED_FALLBACK';}
  if(referenceType==='ACTIVE_PRODUCT_FALLBACK'&&!state.activeProduct&&fallbackReference)referenceType=fallbackReference;
  if(!targetProduct){const rawUnknown=String(fallbackDecision?.targetProduct??decision.targetProduct??'').trim();if(looksLikeProductModel(rawUnknown)){targetProduct=rawUnknown;authorityReason='UNRESOLVED_MODEL_TEXT';}}

  const deterministicSelectionAuthorized=fallbackDecision?.explicitSwitch===true||['SELECTION_REFERENT','EXPLICIT_PRODUCT_SWITCH'].includes(String(fallbackReference??''));
  const referentialSelectionAuthorized=!fallbackDecision&&referenceType==='SELECTION_REFERENT'&&Boolean(recentSelection);
  const selectionAuthorized=deterministicSelectionAuthorized||referentialSelectionAuthorized||Boolean(sqlPurchaseTarget)||Boolean(namedPurchaseTarget)||Boolean(contextualPurchaseTarget);
  let selectedProduct=selectionAuthorized
    ?((sqlPurchaseTarget||namedPurchaseTarget||contextualPurchaseTarget)?targetProduct:knownCanonical(fallbackDecision?.selectedProduct??decision.selectedProduct??targetProduct,universe)??recentSelection)
    :knownCanonical(state.selectedProduct,universe);
  if(referenceType==='SELECTION_REFERENT'&&recentSelection&&!sqlPurchaseTarget&&!namedPurchaseTarget&&!contextualPurchaseTarget)selectedProduct=recentSelection;
  const explicitSwitch=Boolean(selectionAuthorized&&selectedProduct&&fold(selectedProduct)!==fold(state.activeProduct??''));

  const proposedNba=canonicalNba(decision.nextBestAction);
  const deterministicNba=canonicalNba(deterministicNextBestAction(primaryIntent,state)??fallbackDecision?.nextBestAction);
  const nextBestAction=compatibleNba(primaryIntent,state,proposedNba,deterministicNba);
  let comparisonProducts=rawComparisonProducts.slice(0,2);
  const active=knownCanonical(state.activeProduct,universe);

  const currentTurnTarget=canonicalOrModel(targetProduct,universe);
  if(active&&currentTurnTarget&&!explicitSwitch&&!sameProduct(active,currentTurnTarget))comparisonProducts=unique([active,currentTurnTarget,...currentMentions,...comparisonProducts]).slice(0,2);
  else comparisonProducts=comparisonProducts.slice(0,2);

  const attributes=primaryIntent==='CAPABILITY'&&specificAttributeAuthority?fallbackAttributes:decisionAttributes;
  const targetNeedsResolution=Boolean(targetProduct&&!universe.some(p=>sameProduct(p,targetProduct)));
  const normalizedMentions=currentTurnTarget&&!sameStringListContains(currentMentions,currentTurnTarget)&&uniqueNewCatalogTarget&&sameProduct(currentTurnTarget,uniqueNewCatalogTarget)?unique([...currentMentions,currentTurnTarget]):currentMentions;
  const commercialStage=strongStage(primaryIntent)??canonicalStage(decision.commercialStage)??canonicalStage(fallbackDecision?.commercialStage);
  const deterministicPriorities=unique(fallbackDecision?.priorities??state.priorities??[]);
  const neutralOtherWithoutPendingSpin=primaryIntent==='OTHER'&&fallbackIntent==='OTHER'&&!state.pendingMissingFact;
  const factual=factualSemanticIntent(primaryIntent)||neutralOtherWithoutPendingSpin;
  const customerNeed=factual?null:decision.customerNeed;
  const customerProblem=factual?null:decision.customerProblem;
  const spinContribution=factual?null:(typeof decision.spinContribution==='string'&&decision.spinContribution.trim()&&!decision.spinContribution.includes('[object Object]')?decision.spinContribution.trim().slice(0,240):null);

  if(state.sessionId&&(uniqueNewCatalogTarget||knownDecisionTarget&&state.activeProduct&&!sameProduct(knownDecisionTarget,state.activeProduct)||referenceType!=='ACTIVE_PRODUCT_FALLBACK'))console.log(JSON.stringify({event:'STECH_REFERENCE_TRACE',sessionId:state.sessionId,activeBefore:state.activeProduct??null,selectedBefore:state.selectedProduct??null,recommendedBefore:state.recommendedProduct??null,plannerTarget:decision.targetProduct??null,deterministicTarget:fallbackDecision?.targetProduct??null,plannerReference:decision.referenceType??null,deterministicReference:fallbackDecision?.referenceType??null,catalogCandidates,newCatalogCandidates,currentMentions:normalizedMentions,comparisonProducts,finalTarget:targetProduct??null,finalReference:referenceType??null,selectedProduct:selectedProduct??null,explicitSwitch,authorityReason,finalIntent:primaryIntent}));

  return{...decision,primaryIntent,secondaryIntents:unique(decision.secondaryIntents??[]).map(x=>canonicalIntent(x)).filter((x):x is string=>Boolean(x)),targetProduct,mentionedProducts:normalizedMentions,referenceType,explicitSwitch,selectedProduct,comparisonProducts,attributes,customerNeed,customerProblem,priorities:deterministicPriorities,commercialStage,spinContribution,nextBestAction,needsSql:forcedSql(primaryIntent)||targetNeedsResolution,needsProductRag:forcedProductRag(primaryIntent),needsInstitutionalRag:forcedInstitutionalRag(primaryIntent),confidence:Number.isFinite(decision.confidence)?Math.max(0,Math.min(1,decision.confidence)):0.5};
}

import type { ConversationState } from '../../domain/types.ts';
import { normalizeGenuineUseCase, normalizeUseCaseSpinFact } from '../commercial/UseCaseNormalizer.ts';

export type StatePatch=Partial<ConversationState>&{spinResidual?:string};

type ProductFlowState={
  activeProduct:string|null;
  activeProductId:string|null;
  activeProductCode:string|null;
  queryTarget:string|null;
  salientProduct:string|null;
  selectedProduct:string|null;
  recommendedProduct:string|null;
  lastResolvedProductId:string|null;
  lastResolvedProductCode:string|null;
};

function productFlowState(state:Partial<ConversationState>):ProductFlowState{
  return{
    activeProduct:state.activeProduct??null,
    activeProductId:state.activeProductId??null,
    activeProductCode:state.activeProductCode??null,
    queryTarget:state.queryTarget??null,
    salientProduct:state.salientProduct??null,
    selectedProduct:state.selectedProduct??null,
    recommendedProduct:state.recommendedProduct??null,
    lastResolvedProductId:state.lastResolvedProductId??null,
    lastResolvedProductCode:state.lastResolvedProductCode??null,
  };
}

function sameProduct(a:string|null|undefined,b:string|null|undefined):boolean{
  return Boolean(a&&b&&a.trim().toLocaleLowerCase()===b.trim().toLocaleLowerCase());
}

const STAGE_RANK:Record<string,number>={DESCUBRIMIENTO:1,EVALUACION:2,OBJECION:2,CONSIDERACION:3,CIERRE:4,CIERRE_ASISTIDO:4};

function topRecommendationTie(trace:any):boolean{
  const winnerReason=String(trace?.recommendation?.winnerReason??'').toUpperCase();
  if(winnerReason==='WINNER')return false;
  if(winnerReason==='TOP_TIE')return true;
  const ranked=Array.isArray(trace?.recommendation?.rankedCandidates)?trace.recommendation.rankedCandidates:[];
  if(ranked.length<2)return false;
  const a=ranked[0],b=ranked[1];
  const scoreA=Number(a?.score),scoreB=Number(b?.score);
  const confidenceA=Number(a?.confidence),confidenceB=Number(b?.confidence);
  return Number.isFinite(scoreA)&&Number.isFinite(scoreB)
    && Math.abs(scoreA-scoreB)<1e-9
    && (!Number.isFinite(confidenceA)||!Number.isFinite(confidenceB)||Math.abs(confidenceA-confidenceB)<1e-9);
}

export function reduceState(previous:ConversationState,patch:StatePatch):ConversationState{
  const{spinResidual,spinFacts:patchSpinFacts,...canonicalPatch}=patch;
  const spinFacts=[...new Set([...(previous.spinFacts??[]),...(patchSpinFacts??[])]
    .map(normalizeUseCaseSpinFact).filter((value):value is string=>Boolean(value)))];
  const normalizedResidual=normalizeUseCaseSpinFact(spinResidual);
  if(normalizedResidual&&normalizedResidual.length>3&&!spinFacts.includes(normalizedResidual))spinFacts.push(normalizedResidual);

  const beforeProducts=productFlowState(previous);
  const incomingProducts=productFlowState(canonicalPatch);

  const next:ConversationState={
    ...previous,
    ...canonicalPatch,
    spinFacts,
    turnCount:(previous.turnCount??0)+1,
    updatedAt:new Date().toISOString(),
  };
  next.useCase=normalizeGenuineUseCase(next.useCase);

  const currentIntent=String(canonicalPatch.lastIntent??'').toUpperCase();
  const currentRoute=String(canonicalPatch.lastRoute??'').toUpperCase();
  const trace=canonicalPatch.lastDecisionTrace as any;
  const tracedWinner=String(trace?.recommendation?.winner??'').trim()||null;
  const recommendationTopTie=topRecommendationTie(trace);
  const patchRecommendation=String(canonicalPatch.recommendedProduct??'').trim()||null;
  const recommendationWinner=tracedWinner??(
    patchRecommendation&&sameProduct(patchRecommendation,canonicalPatch.salientProduct)
      ?patchRecommendation
      :null
  );
  const recommendationCanOwnActive=Boolean(
    recommendationWinner
    && (
      !beforeProducts.activeProduct
      || sameProduct(beforeProducts.activeProduct,recommendationWinner)
      || canonicalPatch.explicitSwitch===true
    )
  );
  const recommendationFocus=Boolean(
    currentRoute==='RAG_RECOMMENDATION'
    && ['RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE','HANDLE_PRICE_OBJECTION'].includes(currentIntent)
    && recommendationWinner
    && recommendationCanOwnActive
    && sameProduct(recommendationWinner,canonicalPatch.recommendedProduct)
    && !recommendationTopTie
  );
  const previousRecommendation=previous.customerVisibleRecommendedProduct??previous.recommendedProduct??null;
  const recommendationChanged=Boolean(
    canonicalPatch.recommendationChanged
    ??(previousRecommendation&&patchRecommendation&&!sameProduct(previousRecommendation,patchRecommendation)&&canonicalPatch.explicitSwitch!==true)
  );
  const recommendationChangeCommunicated=canonicalPatch.recommendationChangeCommunicated===true;
  const recommendationChangeReason=String(canonicalPatch.recommendationChangeReason??'').trim()||null;
  const productContinuityBlocked=Boolean(recommendationChanged&&canonicalPatch.explicitSwitch!==true&&(!recommendationChangeCommunicated||!recommendationChangeReason));

  let productFlowReason='STATE_PATCH';
  if(recommendationFocus&&recommendationWinner&&!productContinuityBlocked){
    productFlowReason='RECOMMENDATION_WINNER_FOCUS';
    next.activeProduct=recommendationWinner;
    next.salientProduct=recommendationWinner;
    next.queryTarget=recommendationWinner;
    if(canonicalPatch.lastResolvedProductId)next.activeProductId=canonicalPatch.lastResolvedProductId;
    if(canonicalPatch.lastResolvedProductCode)next.activeProductCode=canonicalPatch.lastResolvedProductCode;
  }else if(canonicalPatch.explicitSwitch){
    productFlowReason='EXPLICIT_PRODUCT_SWITCH';
  }else if(recommendationWinner&&beforeProducts.activeProduct&&!sameProduct(beforeProducts.activeProduct,recommendationWinner)){
    productFlowReason='RECOMMENDATION_PRESERVE_ACTIVE';
    next.activeProduct=beforeProducts.activeProduct;
    next.activeProductId=beforeProducts.activeProductId;
    next.activeProductCode=beforeProducts.activeProductCode;
  }else if(recommendationTopTie&&currentRoute==='RAG_RECOMMENDATION'){
    productFlowReason='RECOMMENDATION_TIE_PRESERVE_FOCUS';
  }

  // A conversational topic switch changes the active product, not the customer's purchase selection.
  // Purchase/selection language remains authoritative for selectedProduct.
  if(String(trace?.referenceType??'').toUpperCase()==='EXPLICIT_PRODUCT_SWITCH'&&currentIntent!=='PURCHASE'){
    next.selectedProduct=previous.selectedProduct??null;
  }

  if(productContinuityBlocked){
    productFlowReason='RECOMMENDATION_CHANGE_BLOCKED';
    next.activeProduct=beforeProducts.activeProduct;
    next.activeProductId=beforeProducts.activeProductId;
    next.activeProductCode=beforeProducts.activeProductCode;
    next.queryTarget=beforeProducts.queryTarget;
    next.salientProduct=beforeProducts.salientProduct;
    next.selectedProduct=beforeProducts.selectedProduct;
    next.recommendedProduct=previousRecommendation;
    next.lastResolvedProductId=beforeProducts.lastResolvedProductId;
    next.lastResolvedProductCode=beforeProducts.lastResolvedProductCode;
    if(['SOFT_CLOSE','CHECK_STOCK','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION'].includes(String(next.lastNba??'').toUpperCase())){
      next.lastNba='ANSWER_ONLY';
      next.pendingCommercialAction='ANSWER_ONLY';
    }
  }

  const clearsStaleRecommendation=Object.prototype.hasOwnProperty.call(canonicalPatch,'recommendedProduct')
    &&canonicalPatch.recommendedProduct===null
    &&currentRoute==='RAG_PRODUCT'
    &&Boolean(canonicalPatch.queryTarget&&!sameProduct(canonicalPatch.queryTarget,previous.customerVisibleRecommendedProduct??previous.recommendedProduct));
  if(next.recommendedProduct&&!productContinuityBlocked)next.customerVisibleRecommendedProduct=next.recommendedProduct;
  else if(clearsStaleRecommendation)next.customerVisibleRecommendedProduct=null;
  else next.customerVisibleRecommendedProduct=previous.customerVisibleRecommendedProduct??previous.recommendedProduct??null;

  const previousStage=String(previous.commercialStage??'').toUpperCase();
  const proposedStage=String(next.commercialStage??'').toUpperCase();
  const previousStageRank=STAGE_RANK[previousStage]??0;const proposedStageRank=STAGE_RANK[proposedStage]??0;
  const stageWouldRegress=Boolean(previousStageRank&&proposedStageRank&&proposedStageRank<previousStageRank&&currentRoute!=='RESERVATION_CANCELLED');
  next.stageContinuityValid=!stageWouldRegress;
  if(stageWouldRegress)next.commercialStage=previous.commercialStage??next.commercialStage;

  // Closing stage is deterministic authority. A stale semantic stage such as
  // DESCUBRIMIENTO/CONSIDERACION cannot move a purchase or human handoff backwards.
  if(currentIntent==='PURCHASE')next.commercialStage='CIERRE';
  if(['HUMAN','QUOTE'].includes(currentIntent)||canonicalPatch.handoffActive===true)next.commercialStage='CIERRE_ASISTIDO';

  const preserveAssistedJourney=previous.handoffActive===true
    && canonicalPatch.handoffActive===false
    && ['POLICY','WARRANTY'].includes(currentIntent)
    && (
      Number(previous.quantity??0)>=2
      || String(previous.lastIntent??'').toUpperCase()==='QUOTE'
      || String(previous.commercialStage??'').toUpperCase()==='CIERRE_ASISTIDO'
    );

  if(preserveAssistedJourney){
    next.handoffActive=true;
    next.blockAutomaticReply=previous.blockAutomaticReply??true;
    next.handoffReason=previous.handoffReason??'CONTINUAR_VENTA';
    next.pendingCommercialAction=previous.pendingCommercialAction??'ASSISTED_HANDOFF';
    next.commercialStage=previous.commercialStage??next.commercialStage;
    next.commercialStrategy=previous.commercialStrategy??next.commercialStrategy;
  }

  const afterProducts=productFlowState(next);
  const staleActiveDetected=Boolean(recommendationWinner&&incomingProducts.activeProduct&&!sameProduct(recommendationWinner,incomingProducts.activeProduct));
  const productFlow={
    reason:productFlowReason,
    before:beforeProducts,
    incoming:incomingProducts,
    after:afterProducts,
    recommendationWinner,
    recommendationTopTie,
    consistency:{
      staleActiveDetected,
      activeMatchesRecommendation:recommendationWinner?sameProduct(next.activeProduct,recommendationWinner):null,
      selectedPreserved:(next.selectedProduct??null)===(previous.selectedProduct??null)||Boolean(canonicalPatch.explicitSwitch),
      arbitraryWinnerRisk:recommendationTopTie,
      productContinuityValid:!productContinuityBlocked,
      stageContinuityValid:next.stageContinuityValid!==false,
    },
  };

  if(next.lastDecisionTrace){
    (next.lastDecisionTrace as any).productFlow=productFlow;
    (next.lastDecisionTrace as any).effectiveProduct=next.activeProduct??null;
    (next.lastDecisionTrace as any).continuity={
      recommendationChanged,
      from:canonicalPatch.recommendationChangeFrom??previousRecommendation,
      to:patchRecommendation,
      reason:recommendationChangeReason,
      communicated:recommendationChanged?recommendationChangeCommunicated:true,
      allowed:!productContinuityBlocked,
      stageContinuityValid:next.stageContinuityValid!==false,
    };
  }

  if(next.sessionId&&(staleActiveDetected||recommendationTopTie||productFlowReason!=='STATE_PATCH')){
    console.log(JSON.stringify({
      event:'STECH_PRODUCT_FLOW',
      sessionId:next.sessionId,
      intent:currentIntent||null,
      route:currentRoute||null,
      referenceType:(next.lastDecisionTrace as any)?.referenceType??null,
      reason:productFlowReason,
      recommendationWinner,
      recommendationTopTie,
      before:beforeProducts,
      incoming:incomingProducts,
      after:afterProducts,
      consistency:productFlow.consistency,
    }));
  }

  return next;
}

import type { LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { normalizeEvidence } from '../evidence/EvidenceNormalizer.ts';
import { canExecuteCapability, evaluateTurnCapabilities, missingFactCapability, requestedUnsupportedCapability, type CommercialCapabilityAction } from './CommercialCapabilities.ts';
import { deriveCommercialImplications } from './CommercialImplications.ts';

function unique(values:Array<string|null|undefined>):string[]{
  return [...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];
}

function supportedCapabilityNames(capabilities:Record<string,boolean>):string[]{
  const names:Record<string,string>={askUseCase:'ASK_USE_CASE',askProblem:'ASK_PROBLEM',askPriority:'ASK_PRIORITY',askBudget:'ASK_BUDGET',askProduct:'ASK_PRODUCT',checkPrice:'CHECK_PRICE',checkStock:'CHECK_STOCK',answerProductFeature:'ANSWER_PRODUCT_FEATURE',answerWarranty:'ANSWER_WARRANTY',answerDelivery:'ANSWER_DELIVERY',answerPayment:'ANSWER_PAYMENT',answerLocation:'ANSWER_LOCATION',compareProducts:'COMPARE_PRODUCTS',recommendProduct:'RECOMMEND_PRODUCT',showImages:'SHOW_IMAGES',offerAlternative:'OFFER_ALTERNATIVE',softClose:'SOFT_CLOSE',collectReservationData:'COLLECT_RESERVATION_DATA',requestHumanHandoff:'REQUEST_HUMAN_HANDOFF',executeReservation:'EXECUTE_RESERVATION',scheduleDemo:'SCHEDULE_DEMO',sendQuote:'SEND_QUOTE',sendProductSheet:'SEND_PRODUCT_SHEET',prepareAccessories:'PREPARE_ACCESSORIES'};
  return Object.entries(capabilities).filter(([,enabled])=>enabled).map(([key])=>names[key]).filter(Boolean);
}

function includesProduct(products:string[],candidate:string|null):boolean{
  return Boolean(candidate&&products.some(product=>fold(product)===fold(candidate)));
}

function commercialGoal(action:string|null):string|null{
  switch(String(action??'').toUpperCase()){
    case 'RECOMMEND':return 'recomendar una opción con razones verificables';
    case 'COMPARE':return 'resolver la comparación con diferencias verificables';
    case 'ASK_MISSING_FACT':return 'obtener un solo dato que cambie la decisión';
    case 'OFFER_ALTERNATIVE':return 'presentar una alternativa verificada sin asumir elección';
    case 'SOFT_CLOSE':return 'proponer un siguiente paso comercial breve sin volver a discovery';
    case 'ANSWER_ONLY':return 'resolver la pregunta sin agregar discovery';
    default:return null;
  }
}

function nextMissingFact(facts:{
  useCase:string|null;
  problem:string|null;
  priorities:string[];
  budget:number|null;
},intent:string):string|null{
  if(['HANDLE_PRICE_OBJECTION','OBJECTION','BUDGET_CONSTRAINT'].includes(intent)&&facts.budget==null)return 'presupuesto máximo';
  if(!facts.useCase)return 'uso principal';
  if(!facts.priorities.length)return 'prioridad principal';
  if(facts.budget==null)return 'presupuesto máximo';
  if(!facts.problem)return 'problema principal';
  return null;
}

function isActuallyMissing(label:string,facts:{
  useCase:string|null;
  problem:string|null;
  priorities:string[];
  budget:number|null;
  activeProduct:string|null;
  selectedProduct:string|null;
  recommendedProduct:string|null;
}):boolean{
  const value=fold(label);
  if(/uso/.test(value))return !facts.useCase;
  if(/problema/.test(value))return !facts.problem;
  if(/prioridad|criterio/.test(value))return facts.priorities.length===0;
  if(/presupuesto|tope/.test(value))return facts.budget==null;
  if(/modelo|producto/.test(value))return !facts.activeProduct&&!facts.selectedProduct&&!facts.recommendedProduct;
  // Interest and purchase signals are observed state, never discovery questions.
  if(/interes|compra/.test(value))return false;
  return false;
}

function collectMissingFacts(facts:{
  useCase:string|null;
  problem:string|null;
  priorities:string[];
  budget:number|null;
  activeProduct:string|null;
  selectedProduct:string|null;
  recommendedProduct:string|null;
}):string[]{
  const missing:string[]=[];
  if(!facts.useCase)missing.push('uso principal');
  if(!facts.problem)missing.push('problema principal');
  if(!facts.priorities.length)missing.push('prioridad principal');
  if(facts.budget==null)missing.push('presupuesto máximo');
  if(!facts.activeProduct&&!facts.selectedProduct&&!facts.recommendedProduct)missing.push('modelo de interés');
  return missing;
}

export function prepareCommercialWriteInput(input:LlmWriteInput):LlmWriteInput{
  const state:any=input.state??{};
  const useCase=input.useCase??state.useCase??null;
  const problem=input.problem??state.problem??null;
  const priorities=unique(input.priorities??state.priorities??[]);
  const budget=input.budget??state.budget??null;
  const interestSignal=input.interestSignal??state.interestSignal??false;
  const purchaseSignal=input.purchaseSignal??state.purchaseSignal??false;
  const activeProduct=input.activeProduct??state.activeProduct??null;
  const selectedProduct=input.selectedProduct??state.selectedProduct??input.decision?.selectedProduct??null;
  const recommendedProduct=input.recommendedProduct??state.recommendedProduct??null;
  const objection=input.objection??state.objection??input.decision?.objection??null;
  const levelOfInterest=input.levelOfInterest??state.levelOfInterest??0;
  const attribute=input.attribute??unique(state.currentAttributes??[])[0]??null;
  const implications=unique(input.implications??deriveCommercialImplications(problem,objection));
  const previousPendingAction=input.pendingAction??state.pendingCommercialAction??state.lastNba??null;
  const verifiedFacts=input.verifiedFacts??normalizeEvidence({intent:input.intent,quote:input.quote,rag:input.rag});
  const verifiedFeatures=input.verifiedFeatures??verifiedFacts.filter(fact=>fact.domain==='PRODUCT_RAG');
  const allowedProducts=unique(input.allowedProducts??[]);
  const alternatives=unique(input.alternatives??[]).filter(product=>includesProduct(allowedProducts,product));
  const knownFacts=input.knownFacts??{
    useCase,problem,priorities,budget,objection,activeProduct,selectedProduct,recommendedProduct,
    interestSignal,purchaseSignal,
  };

  let nextBestAction=String(input.nextBestAction??input.decision?.nextBestAction??'ANSWER_ONLY').toUpperCase();
  const proposedMissing=String(input.missingFact??'').trim();
  const missingFacts=collectMissingFacts({useCase,problem,priorities,budget,activeProduct,selectedProduct,recommendedProduct});
  let missingFact=proposedMissing&&isActuallyMissing(proposedMissing,{useCase,problem,priorities,budget,activeProduct,selectedProduct,recommendedProduct})
    ?proposedMissing
    :nextMissingFact({useCase,problem,priorities,budget},String(input.intent??'').toUpperCase());
  let decisionImpact=input.decisionImpact??Boolean(missingFact&&missingFactCapability(missingFact));
  const capabilityInput={...input,allowedProducts,alternatives,verifiedFacts,verifiedFeatures,interestSignal,purchaseSignal,activeProduct,selectedProduct,recommendedProduct,useCase,problem,priorities,budget,decisionImpact};
  const turnCapabilities=evaluateTurnCapabilities(capabilityInput);
  const unsupportedRequest=requestedUnsupportedCapability(input.message);
  const actionFor=(nba:string):CommercialCapabilityAction|null=>{
    if(nba==='ANSWER_ONLY')return 'ANSWER_ONLY';
    if(nba==='ASK_MISSING_FACT')return missingFactCapability(missingFact);
    if(nba==='RECOMMEND')return 'RECOMMEND_PRODUCT';
    if(nba==='COMPARE')return 'COMPARE_PRODUCTS';
    if(nba==='OFFER_ALTERNATIVE')return 'OFFER_ALTERNATIVE';
    if(nba==='SOFT_CLOSE')return 'SOFT_CLOSE_TO_STOCK';
    if(nba==='COLLECT_RESERVATION_DATA')return 'RESERVATION_DATA_COLLECTION';
    if(nba==='ASSISTED_HANDOFF')return 'REQUEST_HUMAN_HANDOFF';
    if(nba==='EXECUTE_RESERVATION')return 'EXECUTE_RESERVATION';
    return null;
  };
  if(purchaseSignal&&['ASK_MISSING_FACT','COMPARE','RECOMMEND','OFFER_ALTERNATIVE'].includes(nextBestAction))nextBestAction='COLLECT_RESERVATION_DATA';
  let capabilityAction=actionFor(nextBestAction);
  let executable=Boolean(capabilityAction&&canExecuteCapability(capabilityAction,turnCapabilities,decisionImpact));
  if(!executable&&nextBestAction==='RECOMMEND'&&String(input.intent??'').toUpperCase()==='COMPARE'&&canExecuteCapability('COMPARE_PRODUCTS',turnCapabilities,decisionImpact)){
    nextBestAction='COMPARE';capabilityAction='COMPARE_PRODUCTS';executable=true;
  }
  if(!executable&&nextBestAction==='OFFER_ALTERNATIVE'){
    const askAction=missingFactCapability(missingFact);
    if(askAction&&canExecuteCapability(askAction,turnCapabilities,decisionImpact)){nextBestAction='ASK_MISSING_FACT';capabilityAction=askAction;executable=true;}
  }
  if(unsupportedRequest){nextBestAction='ANSWER_ONLY';capabilityAction='ANSWER_ONLY';executable=true;decisionImpact=false;missingFact=null;}
  if(!executable){nextBestAction='ANSWER_ONLY';capabilityAction='ANSWER_ONLY';decisionImpact=false;missingFact=null;}
  if(nextBestAction!=='ASK_MISSING_FACT')missingFact=null;
  const resolvedProduct=selectedProduct??recommendedProduct??activeProduct;
  const pendingQuestion=nextBestAction==='ASK_MISSING_FACT'?missingFact:null;
  const pendingAction=nextBestAction;
  const commercialSignals={purchaseSignal,interestSignal,objection,selectedProduct,recommendedProduct,activeProduct,commercialStage:input.commercialStage??state.commercialStage??input.decision?.commercialStage??null,levelOfInterest,budget,problem,implications,priorities,attribute,useCase,pendingCommercialAction:previousPendingAction};

  return {
    ...input,
    decision:input.decision?{...input.decision,nextBestAction}:input.decision,
    allowedProducts,alternatives,verifiedFacts,verifiedFeatures,
    nextBestAction,commercialStage:input.commercialStage??state.commercialStage??input.decision?.commercialStage??null,
    knownFacts,missingFacts,missingFact,decisionImpact,interestSignal,purchaseSignal,objection,activeProduct,selectedProduct,recommendedProduct,
    useCase,problem,priorities,budget,
    customerContext:input.customerContext??{useCase,problem,priorities,budget,objection},
    commercialGoal:input.commercialGoal??commercialGoal(nextBestAction),capabilityAction,turnCapabilities,
    resolvedCurrentIntent:String(input.intent??'OTHER').toUpperCase(),commercialSignals,resolvedProduct,
    supportedCapabilities:supportedCapabilityNames(turnCapabilities),executableNba:nextBestAction,
    levelOfInterest,attribute,implications,pendingQuestion,pendingAction,
    commercialContractPrepared:true,
  };
}

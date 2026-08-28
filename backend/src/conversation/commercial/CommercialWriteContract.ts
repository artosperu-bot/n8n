import type { CommercialMove, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { normalizeEvidence } from '../evidence/EvidenceNormalizer.ts';
import { canExecuteCapability, evaluateTurnCapabilities, missingFactCapability, requestedUnsupportedCapability, type CommercialCapabilityAction } from './CommercialCapabilities.ts';
import { normalizeGenuineUseCase } from './UseCaseNormalizer.ts';
import { buildGroundedDirectAnswer } from './GroundedDirectAnswer.ts';
import { evaluateSpinReadiness } from '../nba/SpinProgression.ts';

function unique(values:Array<string|null|undefined>):string[]{
  return [...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];
}
function explicitImplications(input:LlmWriteInput,state:any):string[]{
  const persisted=(state?.spinFacts??[])
    .map((value:unknown)=>String(value??'').trim())
    .filter((value:string)=>/^implicacion:/i.test(value))
    .map((value:string)=>value.replace(/^implicacion:/i,'').trim())
    .filter(Boolean);
  return unique([...(input.implications??[]),...persisted]);
}

function directAttributeFamily(attribute:string|null,fact:{key:string;value:string}):boolean{
  const requested=fold(attribute??'').replace(/[^a-z0-9]+/g,'');
  if(!requested)return false;
  const content=fold(`${fact.key} ${fact.value}`).replace(/[^a-z0-9]+/g,'');
  const families:Record<string,string[]>={
    memoria:['ram','memoria'],ram:['ram','memoria'],
    almacenamiento:['almacenamiento','rom','memoriainterna'],rom:['almacenamiento','rom','memoriainterna'],
    bateria:['bateria','autonomia','carga'],autonomia:['bateria','autonomia','carga'],
    resistencia:['resistencia','caida','ip68','ip69','milstd'],camara:['camara','foto','video','mp'],
  };
  const tokens=families[requested]??[requested];
  return tokens.some(token=>content.includes(token));
}

function selectCommercialMove(input:LlmWriteInput,verifiedFacts:LlmWriteInput['verifiedFacts'],verifiedFeatures:LlmWriteInput['verifiedFeatures'],attribute:string|null,resolvedProduct:string|null,context:{useCase:string|null;problem:string|null;priorities:string[];budget:number|null;objection:string|null},levelOfInterest:number):CommercialMove|null{
  if(!resolvedProduct)return null;
  const intent=String(input.intent??'').toUpperCase();
  const intensity=levelOfInterest>=60?'HIGH':levelOfInterest>=20?'MEDIUM':'LIGHT';
  if(['PRICE','PRICE_AVAILABILITY'].includes(intent)){
    const stockFact=(verifiedFacts??[]).find(fact=>fact.domain==='SQL'&&fact.key==='DISPONIBILIDAD');
    if(stockFact)return{action:'RELATED_VALUE',kind:'STOCK_STATUS',targetProduct:resolvedProduct,intensity,reason:'VERIFIED_STOCK_RELATED_TO_PRICE',basis:['SQL'],attribute:null,verifiedFacts:[stockFact],relevantCustomerContext:context};
  }
  const realContext={...context,useCase:normalizeGenuineUseCase(context.useCase)};
  const hasCustomerContext=Boolean(realContext.useCase||realContext.problem||realContext.priorities.length||realContext.objection);
  if(verifiedFeatures?.length&&hasCustomerContext){
    return{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:resolvedProduct,intensity,reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute,verifiedFacts:verifiedFeatures,relevantCustomerContext:realContext};
  }
  const directIntentKeys:Record<string,Set<string>>={
    PRICE:new Set(['PRECIO']),PRICE_AVAILABILITY:new Set(['PRECIO','DISPONIBILIDAD']),STOCK:new Set(['DISPONIBILIDAD']),
  };
  const relatedFact=(verifiedFacts??[]).find(fact=>{
    if(fact.key==='PRODUCTO'||fact.domain==='INSTITUTIONAL_RAG')return false;
    if(directIntentKeys[intent]?.has(fact.key))return false;
    return !directAttributeFamily(attribute,fact);
  });
  if(relatedFact){
    const basis:CommercialMove['basis']=relatedFact.domain==='SQL'?['SQL']:['VERIFIED_PRODUCT_FEATURE'];
    const kind=relatedFact.key==='DISPONIBILIDAD'?'STOCK_STATUS':'RELATED_VERIFIED_FACT';
    return{action:'RELATED_VALUE',kind,targetProduct:resolvedProduct,intensity,reason:'DISTINCT_VERIFIED_RELATED_FACT',basis,attribute:relatedFact.key,verifiedFacts:[relatedFact],relevantCustomerContext:realContext};
  }
  return null;
}

function supportedCapabilityNames(capabilities:Record<string,boolean>):string[]{
  const names:Record<string,string>={askUseCase:'ASK_USE_CASE',askProblem:'ASK_PROBLEM',askImplication:'ASK_IMPLICATION',askPriority:'ASK_PRIORITY',askBudget:'ASK_BUDGET',askProduct:'ASK_PRODUCT',addRelatedValue:'ADD_RELATED_VALUE',checkPrice:'CHECK_PRICE',checkStock:'CHECK_STOCK',answerProductFeature:'ANSWER_PRODUCT_FEATURE',answerWarranty:'ANSWER_WARRANTY',answerDelivery:'ANSWER_DELIVERY',answerPayment:'ANSWER_PAYMENT',answerLocation:'ANSWER_LOCATION',compareProducts:'COMPARE_PRODUCTS',recommendProduct:'RECOMMEND_PRODUCT',showImages:'SHOW_IMAGES',offerAlternative:'OFFER_ALTERNATIVE',softClose:'SOFT_CLOSE',collectReservationData:'COLLECT_RESERVATION_DATA',requestHumanHandoff:'REQUEST_HUMAN_HANDOFF',executeReservation:'EXECUTE_RESERVATION',scheduleDemo:'SCHEDULE_DEMO',sendQuote:'SEND_QUOTE',sendProductSheet:'SEND_PRODUCT_SHEET',prepareAccessories:'PREPARE_ACCESSORIES'};
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
    case 'RELATED_VALUE':return 'añadir un solo valor relacionado y verificable sin forzar una pregunta';
    case 'ANSWER_ONLY':return 'resolver la pregunta sin agregar discovery';
    default:return null;
  }
}

function spinState(state:any,facts:{useCase:string|null;problem:string|null;priorities:string[]}):any{
  return{...state,useCase:facts.useCase,problem:facts.problem,priorities:facts.priorities};
}

function nextMissingFact(facts:{useCase:string|null;problem:string|null;priorities:string[];budget:number|null},intent:string,state:any):string|null{
  // Objections must be answered on their own terms. Detecting price friction is
  // not authorization to invent budget discovery; only an explicit budget
  // constraint may request a budget ceiling.
  if(['OBJECTION','HANDLE_PRICE_OBJECTION'].includes(intent))return null;
  if(intent==='BUDGET_CONSTRAINT'&&facts.budget==null)return 'presupuesto máximo';
  return evaluateSpinReadiness(spinState(state,facts)).nextMissingFact;
}

function implicationKnown(state:any):boolean{
  return String(state?.lastSpinContribution??'').toUpperCase()==='IMPLICACION'
    || (state?.spinFacts??[]).some((value:string)=>/^(?:implicacion|impacto):/i.test(String(value))||/\b(?:implicacion|impacto|consecuencia)\b/i.test(String(value)));
}

function isActuallyMissing(label:string,facts:{useCase:string|null;problem:string|null;priorities:string[];budget:number|null;activeProduct:string|null;selectedProduct:string|null;recommendedProduct:string|null},state:any):boolean{
  const value=fold(label);
  if(/uso/.test(value))return !facts.useCase;
  if(/impacto|implicacion|consecuencia/.test(value))return Boolean(facts.problem)&&!implicationKnown(state);
  if(/problema/.test(value))return !facts.problem;
  if(/prioridad|criterio/.test(value))return facts.priorities.length===0;
  if(/presupuesto|tope/.test(value))return facts.budget==null;
  if(/modelo|producto/.test(value))return !facts.activeProduct&&!facts.selectedProduct&&!facts.recommendedProduct;
  if(/interes|compra/.test(value))return false;
  return false;
}

function collectMissingFacts(facts:{useCase:string|null;problem:string|null;priorities:string[];budget:number|null;activeProduct:string|null;selectedProduct:string|null;recommendedProduct:string|null},intent:string,state:any):string[]{
  const missing:string[]=[];
  const spinMissing=nextMissingFact(facts,intent,state);
  if(spinMissing)missing.push(spinMissing);
  if(!facts.activeProduct&&!facts.selectedProduct&&!facts.recommendedProduct&&!['RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE'].includes(intent))missing.push('modelo de interés');
  return unique(missing);
}

function capabilityFor(nba:string,missingFact:string|null):CommercialCapabilityAction|null{
  if(nba==='ANSWER_ONLY')return 'ANSWER_ONLY';
  if(nba==='RELATED_VALUE')return 'ADD_RELATED_VALUE';
  if(nba==='ASK_MISSING_FACT')return missingFactCapability(missingFact);
  if(nba==='RECOMMEND')return 'RECOMMEND_PRODUCT';
  if(nba==='COMPARE')return 'COMPARE_PRODUCTS';
  if(nba==='OFFER_ALTERNATIVE')return 'OFFER_ALTERNATIVE';
  if(nba==='SOFT_CLOSE')return 'SOFT_CLOSE_TO_STOCK';
  if(nba==='COLLECT_RESERVATION_DATA')return 'RESERVATION_DATA_COLLECTION';
  if(nba==='ASSISTED_HANDOFF')return 'REQUEST_HUMAN_HANDOFF';
  if(nba==='EXECUTE_RESERVATION')return 'EXECUTE_RESERVATION';
  return null;
}

export function prepareCommercialWriteInput(input:LlmWriteInput):LlmWriteInput{
  const state:any=input.state??{};
  const useCase=normalizeGenuineUseCase(input.useCase??state.useCase??null);
  const problem=input.problem??state.problem??null;
  const priorities=unique(input.priorities??state.priorities??[]);
  const budget=input.budget??state.budget??null;
  const interestSignal=input.interestSignal??state.interestSignal??false;
  const purchaseSignal=input.purchaseSignal??state.purchaseSignal??false;
  const activeProduct=input.activeProduct??state.activeProduct??null;
  const selectedProduct=input.selectedProduct??state.selectedProduct??input.decision?.selectedProduct??null;
  const recommendedProduct=input.recommendedProduct??state.recommendedProduct??null;
  const intentCode=String(input.intent??'').toUpperCase();
  const factualIntent=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','CAPABILITY','PRODUCT_INFO','ATTRIBUTE','WARRANTY','POLICY','ORDER_STATUS']).has(intentCode);
  const currentTurnProduct=input.resolvedProduct??input.quote?.shortName??input.quote?.product??input.decision?.targetProduct??null;
  const resolvedTurnProduct=factualIntent
    ?currentTurnProduct??selectedProduct??recommendedProduct??activeProduct
    :input.resolvedProduct??selectedProduct??recommendedProduct??activeProduct??input.quote?.shortName??input.quote?.product??input.decision?.targetProduct??null;
  const objection=input.objection??state.objection??input.decision?.objection??null;
  const levelOfInterest=input.levelOfInterest??state.levelOfInterest??0;
  const attribute=unique([input.attribute,...(input.decision?.attributes??[]),...(state.currentAttributes??[])])[0]??null;
  const implications=explicitImplications(input,state);
  const previousPendingAction=input.pendingAction??state.pendingCommercialAction??state.lastNba??null;
  const verifiedFacts=input.verifiedFacts??normalizeEvidence({intent:input.intent,quote:input.quote,rag:input.rag});
  const allVerifiedFeatures=input.verifiedFeatures??verifiedFacts.filter(fact=>fact.domain==='PRODUCT_RAG');
  const attributeFeatures=attribute?allVerifiedFeatures.filter(fact=>directAttributeFamily(attribute,fact)):[];
  const verifiedFeatures=['CAPABILITY','ATTRIBUTE'].includes(intentCode)&&attributeFeatures.length?attributeFeatures:allVerifiedFeatures;
  const directAnswer=input.directAnswer??buildGroundedDirectAnswer({message:input.message,intent:input.intent,attribute,resolvedProduct:resolvedTurnProduct,quote:input.quote,rag:input.rag,verifiedFacts});
  const moveContext={useCase,problem,priorities,budget,objection};
  const commercialMove=selectCommercialMove(input,verifiedFacts,verifiedFeatures,attribute,resolvedTurnProduct,moveContext,levelOfInterest);
  const allowedProducts=unique(input.allowedProducts??[]);
  const alternatives=unique(input.alternatives??[]).filter(product=>includesProduct(allowedProducts,product));
  const knownFacts=input.knownFacts??{useCase,problem,priorities,budget,objection,activeProduct,selectedProduct,recommendedProduct,interestSignal,purchaseSignal};

  const candidateNba=String(input.candidateNba??input.finalExecutableNba??input.nextBestAction??input.decision?.nextBestAction??'ANSWER_ONLY').toUpperCase();
  let finalExecutableNba=candidateNba;
  const proposedMissing=String(input.missingFact??'').trim();
  const missingContext={useCase,problem,priorities,budget,activeProduct,selectedProduct,recommendedProduct};
  const missingFacts=collectMissingFacts(missingContext,intentCode,state);
  let missingFact=proposedMissing&&isActuallyMissing(proposedMissing,missingContext,state)
    ?proposedMissing
    :nextMissingFact({useCase,problem,priorities,budget},intentCode,state);
  let decisionImpact=input.decisionImpact??Boolean(missingFact&&missingFactCapability(missingFact));
  const capabilityInput={...input,allowedProducts,alternatives,verifiedFacts,verifiedFeatures,commercialMove,resolvedProduct:resolvedTurnProduct,interestSignal,purchaseSignal,activeProduct,selectedProduct,recommendedProduct,useCase,problem,priorities,budget,decisionImpact};
  const turnCapabilities=evaluateTurnCapabilities(capabilityInput);
  const unsupportedRequest=requestedUnsupportedCapability(input.message);

  if(purchaseSignal&&['ASK_MISSING_FACT','COMPARE','RECOMMEND','OFFER_ALTERNATIVE'].includes(finalExecutableNba))finalExecutableNba='COLLECT_RESERVATION_DATA';
  let capabilityAction=capabilityFor(finalExecutableNba,missingFact);
  let executable=Boolean(capabilityAction&&canExecuteCapability(capabilityAction,turnCapabilities,decisionImpact));

  if(!executable&&finalExecutableNba==='RECOMMEND'&&intentCode==='COMPARE'&&canExecuteCapability('COMPARE_PRODUCTS',turnCapabilities,decisionImpact)){
    finalExecutableNba='COMPARE';capabilityAction='COMPARE_PRODUCTS';executable=true;
  }
  if(!executable&&finalExecutableNba==='OFFER_ALTERNATIVE'){
    const askAction=missingFactCapability(missingFact);
    if(askAction&&canExecuteCapability(askAction,turnCapabilities,decisionImpact)){
      finalExecutableNba='ASK_MISSING_FACT';capabilityAction=askAction;executable=true;
    }
  }
  if(unsupportedRequest){
    finalExecutableNba='ANSWER_ONLY';capabilityAction='ANSWER_ONLY';executable=true;decisionImpact=false;missingFact=null;
  }
  if(!executable){
    finalExecutableNba='ANSWER_ONLY';capabilityAction='ANSWER_ONLY';decisionImpact=false;missingFact=null;
  }
  if(finalExecutableNba!=='ASK_MISSING_FACT')missingFact=null;

  const resolvedProduct=resolvedTurnProduct;
  const pendingQuestion=finalExecutableNba==='ASK_MISSING_FACT'?missingFact:null;
  const pendingAction=finalExecutableNba;
  const commercialSignals={purchaseSignal,interestSignal,objection,selectedProduct,recommendedProduct,activeProduct,commercialStage:input.commercialStage??state.commercialStage??input.decision?.commercialStage??null,levelOfInterest,budget,problem,implications,priorities,attribute,useCase,pendingCommercialAction:previousPendingAction};

  return {
    ...input,
    decision:input.decision?{...input.decision,nextBestAction:finalExecutableNba}:input.decision,
    allowedProducts,alternatives,verifiedFacts,verifiedFeatures,commercialMove,directAnswer,
    candidateNba,
    finalExecutableNba,
    nextBestAction:finalExecutableNba,
    executableNba:finalExecutableNba,
    commercialStage:input.commercialStage??state.commercialStage??input.decision?.commercialStage??null,
    knownFacts,missingFacts,missingFact,decisionImpact,interestSignal,purchaseSignal,objection,activeProduct,selectedProduct,recommendedProduct,
    useCase,problem,priorities,budget,
    customerContext:input.customerContext??{useCase,problem,priorities,budget,objection},
    commercialGoal:commercialGoal(finalExecutableNba),capabilityAction,turnCapabilities,
    resolvedCurrentIntent:intentCode||'OTHER',commercialSignals,resolvedProduct,
    supportedCapabilities:supportedCapabilityNames(turnCapabilities),
    levelOfInterest,attribute,implications,pendingQuestion,pendingAction,
    commercialContractPrepared:true,
  };
}
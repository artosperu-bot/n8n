import type { LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';

export type CommercialCapabilityAction =
  | 'ANSWER_ONLY'
  | 'ADD_RELATED_VALUE'
  | 'ASK_USE_CASE'
  | 'ASK_PROBLEM'
  | 'ASK_IMPLICATION'
  | 'ASK_PRIORITY'
  | 'ASK_BUDGET'
  | 'ASK_PRODUCT'
  | 'RECOMMEND_PRODUCT'
  | 'COMPARE_PRODUCTS'
  | 'OFFER_ALTERNATIVE'
  | 'SOFT_CLOSE_TO_STOCK'
  | 'RESERVATION_DATA_COLLECTION'
  | 'REQUEST_HUMAN_HANDOFF'
  | 'EXECUTE_RESERVATION';

export type CommercialCapabilities = {
  askUseCase:boolean;
  askProblem:boolean;
  askImplication:boolean;
  askPriority:boolean;
  askBudget:boolean;
  askProduct:boolean;
  addRelatedValue:boolean;
  checkPrice:boolean;
  checkStock:boolean;
  answerProductFeature:boolean;
  answerWarranty:boolean;
  answerDelivery:boolean;
  answerPayment:boolean;
  answerLocation:boolean;
  compareProducts:boolean;
  recommendProduct:boolean;
  showImages:boolean;
  offerAlternative:boolean;
  softClose:boolean;
  collectReservationData:boolean;
  requestHumanHandoff:boolean;
  executeReservation:boolean;
  scheduleDemo:boolean;
  sendQuote:boolean;
  sendProductSheet:boolean;
  prepareAccessories:boolean;
};

export const IMPLEMENTED_COMMERCIAL_CAPABILITIES:Readonly<CommercialCapabilities>=Object.freeze({
  askUseCase:true,askProblem:true,askImplication:true,askPriority:true,askBudget:true,askProduct:true,addRelatedValue:true,
  checkPrice:true,checkStock:true,answerProductFeature:true,answerWarranty:true,answerDelivery:true,answerPayment:true,answerLocation:true,
  compareProducts:true,recommendProduct:true,showImages:true,offerAlternative:true,softClose:true,
  collectReservationData:true,requestHumanHandoff:true,
  executeReservation:false,scheduleDemo:false,sendQuote:false,sendProductSheet:false,prepareAccessories:false,
});

function unique(values:Array<string|null|undefined>):string[]{return[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];}
function same(a:string|null|undefined,b:string|null|undefined):boolean{return Boolean(a&&b&&fold(a)===fold(b));}
function resolvedProduct(input:LlmWriteInput):string|null{
  return input.resolvedProduct??input.selectedProduct??input.recommendedProduct??input.activeProduct??input.state?.selectedProduct??input.state?.recommendedProduct??input.state?.activeProduct??input.quote?.shortName??input.quote?.product??null;
}
function productEvidenceCount(input:LlmWriteInput):number{
  return new Set((input.verifiedFeatures??[]).map(fact=>String(fact.productId??'').trim()).filter(Boolean)).size;
}
function hasInstitutionalEvidence(input:LlmWriteInput):boolean{
  return (input.rag??[]).some(row=>row.domain==='INSTITUTIONAL'||/INSTITUCIONAL|POLICY/i.test(row.source));
}
function hasRealImages(input:LlmWriteInput):boolean{return (input.imageUrls??[]).some(url=>/^https?:\/\//i.test(url));}
function sqlResolved(input:LlmWriteInput):boolean{
  const product=resolvedProduct(input);const quoteName=input.quote?.shortName??input.quote?.product??null;
  return Boolean(product&&input.quote&&same(product,quoteName));
}
function priorStockKnown(input:LlmWriteInput,product:string|null):boolean{
  if(!product)return false;
  const token=fold(product).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();
  return (input.state?.interestEvents??[]).some(event=>{
    const value=String(event??'').toUpperCase();
    return value.startsWith('STOCK:')&&(value.includes(token)||fold(value.slice(6))===fold(product));
  });
}

export function missingFactCapability(missingFact:string|null|undefined):CommercialCapabilityAction|null{
  const value=fold(missingFact??'');
  if(/uso/.test(value))return 'ASK_USE_CASE';
  if(/impacto|implicacion|consecuencia/.test(value))return 'ASK_IMPLICATION';
  if(/problema/.test(value))return 'ASK_PROBLEM';
  if(/prioridad|criterio/.test(value))return 'ASK_PRIORITY';
  if(/presupuesto|tope/.test(value))return 'ASK_BUDGET';
  if(/modelo|producto/.test(value))return 'ASK_PRODUCT';
  return null;
}

export function requestedUnsupportedCapability(message:string|null|undefined):boolean{
  const value=fold(message??'');
  return [
    /\b(?:agendar|agendarme|programar|coordinar)\w*\s+(?:una?\s+)?(?:prueba|demo|demostracion|cita)\b/,
    /\b(?:enviar|enviarme|mandar|mandarme|pasar|pasarme)\w*\s+(?:una?\s+|la\s+)?(?:cotizacion|ficha tecnica)\b/,
    /\b(?:preparar|prepararme|armar|armarme)\w*\s+(?:un\s+)?(?:kit|paquete)\s+de\s+accesorios\b/,
  ].some(pattern=>pattern.test(value));
}

export function evaluateTurnCapabilities(input:LlmWriteInput):CommercialCapabilities{
  const base=IMPLEMENTED_COMMERCIAL_CAPABILITIES;
  const allowed=unique(input.allowedProducts??[]);const alternatives=unique(input.alternatives??[]).filter(option=>allowed.some(product=>same(product,option)));
  const product=resolvedProduct(input);const recommended=input.recommendedProduct??input.state?.recommendedProduct??null;const featureEvidence=(input.verifiedFeatures??[]).length>0;
  const institutional=hasInstitutionalEvidence(input);const message=fold(input.message??'');const decisionImpact=input.decisionImpact===true;
  const matureCommercialContext=Number(input.levelOfInterest??input.state?.levelOfInterest??0)>=20&&Boolean(input.useCase||input.problem||(input.priorities??[]).length);
  const interestContext=Boolean(input.interestSignal||input.purchaseSignal||input.selectedProduct||input.recommendedProduct||input.state?.selectedProduct||input.state?.recommendedProduct||matureCommercialContext);
  const implicationKnown=(input.implications??[]).length>0||String(input.state?.lastSpinContribution??'').toUpperCase()==='IMPLICACION'||(input.state?.spinFacts??[]).some(value=>/^(?:implicacion|impacto):/i.test(String(value)));
  const currentIntent=String(input.resolvedCurrentIntent??input.intent??'').toUpperCase();
  const currentStockKnown=sqlResolved(input)&&input.quote?.stock!=null;
  const previousStockKnown=priorStockKnown(input,product);
  const fulfillmentProgression=['PRICE','PRICE_AVAILABILITY','STOCK'].includes(currentIntent)
    || (currentIntent==='POLICY'&&String(input.state?.pendingCommercialAction??input.state?.lastNba??'').toUpperCase()==='SOFT_CLOSE');
  const fitOfferProgression=['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(currentIntent)
    && Boolean(product&&featureEvidence&&(input.useCase||input.problem||(input.priorities??[]).length));
  return {
    ...base,
    askUseCase:base.askUseCase&&decisionImpact&&!input.useCase,
    askProblem:base.askProblem&&decisionImpact&&!input.problem,
    askImplication:base.askImplication&&decisionImpact&&Boolean(input.problem)&&!implicationKnown,
    askPriority:base.askPriority&&decisionImpact&&!(input.priorities??[]).length,
    askBudget:base.askBudget&&decisionImpact&&input.budget==null,
    askProduct:base.askProduct&&decisionImpact&&!product,
    addRelatedValue:base.addRelatedValue&&Boolean(product&&input.commercialMove&&(
      input.commercialMove.basis.includes('SQL')?sqlResolved(input):featureEvidence
    )),
    checkPrice:base.checkPrice&&sqlResolved(input)&&input.quote?.price!=null,
    checkStock:base.checkStock&&sqlResolved(input)&&input.quote?.stock!=null,
    answerProductFeature:base.answerProductFeature&&Boolean(product&&featureEvidence),
    answerWarranty:base.answerWarranty&&institutional&&(/garantia/.test(message)||String(input.intent).toUpperCase()==='WARRANTY'),
    answerDelivery:base.answerDelivery&&institutional&&/envio|entrega|delivery|recojo/.test(message),
    answerPayment:base.answerPayment&&institutional&&/pago|yape|plin|transferencia|tarjeta|cuota/.test(message),
    answerLocation:base.answerLocation&&institutional&&/tienda|direccion|ubicacion|horario/.test(message),
    compareProducts:base.compareProducts&&alternatives.length>=2&&productEvidenceCount(input)>=2,
    recommendProduct:base.recommendProduct&&Boolean(recommended&&allowed.some(item=>same(item,recommended))&&featureEvidence),
    showImages:base.showImages&&hasRealImages(input),
    offerAlternative:base.offerAlternative&&alternatives.length>0,
    // SOFT_CLOSE has three result-first meanings:
    // fit -> offer price+availability; price+stock -> fulfillment; fulfillment -> reservation.
    softClose:base.softClose&&Boolean(product&&(
      fitOfferProgression
      || (fulfillmentProgression&&(currentStockKnown||previousStockKnown||interestContext))
    )),
    // purchaseSignal is the authority. It may come from an explicit BUY intent
    // or from a typed/contextual affirmative to a visible reservation question.
    collectReservationData:base.collectReservationData&&Boolean(product&&input.purchaseSignal),
    requestHumanHandoff:base.requestHumanHandoff&&String(input.intent).toUpperCase()==='HUMAN',
  };
}

export function canExecuteCapability(action:CommercialCapabilityAction,capabilities:CommercialCapabilities,decisionImpact:boolean):boolean{
  switch(action){
    case 'ANSWER_ONLY':return true;
    case 'ADD_RELATED_VALUE':return capabilities.addRelatedValue;
    case 'ASK_USE_CASE':return decisionImpact&&capabilities.askUseCase;
    case 'ASK_PROBLEM':return decisionImpact&&capabilities.askProblem;
    case 'ASK_IMPLICATION':return decisionImpact&&capabilities.askImplication;
    case 'ASK_PRIORITY':return decisionImpact&&capabilities.askPriority;
    case 'ASK_BUDGET':return decisionImpact&&capabilities.askBudget;
    case 'ASK_PRODUCT':return decisionImpact&&capabilities.askProduct;
    case 'RECOMMEND_PRODUCT':return capabilities.recommendProduct;
    case 'COMPARE_PRODUCTS':return capabilities.compareProducts;
    case 'OFFER_ALTERNATIVE':return capabilities.offerAlternative;
    case 'SOFT_CLOSE_TO_STOCK':return capabilities.softClose;
    case 'RESERVATION_DATA_COLLECTION':return capabilities.collectReservationData;
    case 'REQUEST_HUMAN_HANDOFF':return capabilities.requestHumanHandoff;
    case 'EXECUTE_RESERVATION':return capabilities.executeReservation;
  }
}

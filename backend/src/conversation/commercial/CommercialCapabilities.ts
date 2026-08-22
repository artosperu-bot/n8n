import type { LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';

export type CommercialCapabilityAction =
  | 'ANSWER_ONLY'
  | 'ASK_USE_CASE'
  | 'ASK_PROBLEM'
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
  askPriority:boolean;
  askBudget:boolean;
  askProduct:boolean;
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

// Only operations implemented by the current backend. False entries are
// intentional: they prevent the writer from promising aspirational workflows.
export const IMPLEMENTED_COMMERCIAL_CAPABILITIES:Readonly<CommercialCapabilities>=Object.freeze({
  askUseCase:true,askProblem:true,askPriority:true,askBudget:true,askProduct:true,
  checkPrice:true,checkStock:true,answerProductFeature:true,answerWarranty:true,answerDelivery:true,answerPayment:true,answerLocation:true,
  compareProducts:true,recommendProduct:true,showImages:true,offerAlternative:true,softClose:true,
  collectReservationData:true,requestHumanHandoff:true,
  executeReservation:false,scheduleDemo:false,sendQuote:false,sendProductSheet:false,prepareAccessories:false,
});

function unique(values:Array<string|null|undefined>):string[]{return[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];}
function same(a:string|null|undefined,b:string|null|undefined):boolean{return Boolean(a&&b&&fold(a)===fold(b));}
function resolvedProduct(input:LlmWriteInput):string|null{
  return input.selectedProduct??input.recommendedProduct??input.activeProduct??input.state?.selectedProduct??input.state?.recommendedProduct??input.state?.activeProduct??null;
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

export function missingFactCapability(missingFact:string|null|undefined):CommercialCapabilityAction|null{
  const value=fold(missingFact??'');
  if(/uso/.test(value))return 'ASK_USE_CASE';
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
  const interestContext=Boolean(input.interestSignal||input.purchaseSignal||input.selectedProduct||input.recommendedProduct||input.state?.selectedProduct||input.state?.recommendedProduct);
  return {
    ...base,
    askUseCase:base.askUseCase&&decisionImpact&&!input.useCase,
    askProblem:base.askProblem&&decisionImpact&&!input.problem,
    askPriority:base.askPriority&&decisionImpact&&!(input.priorities??[]).length,
    askBudget:base.askBudget&&decisionImpact&&input.budget==null,
    askProduct:base.askProduct&&decisionImpact&&!product,
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
    softClose:base.softClose&&Boolean(product&&interestContext&&sqlResolved(input)&&input.quote?.stock!=null),
    collectReservationData:base.collectReservationData&&Boolean(product&&input.purchaseSignal&&String(input.intent).toUpperCase()==='PURCHASE'),
    requestHumanHandoff:base.requestHumanHandoff&&String(input.intent).toUpperCase()==='HUMAN',
  };
}

export function canExecuteCapability(action:CommercialCapabilityAction,capabilities:CommercialCapabilities,decisionImpact:boolean):boolean{
  switch(action){
    case 'ANSWER_ONLY':return true;
    case 'ASK_USE_CASE':return decisionImpact&&capabilities.askUseCase;
    case 'ASK_PROBLEM':return decisionImpact&&capabilities.askProblem;
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

import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmDecisionResult, LlmProvider, TurnDecision } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ConversationState, ProductImage, ProductQuote, RagEvidence, RecommendationDecisionTrace, TurnDecisionTrace } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { extractCommercialFacts } from './commercial/CommercialFacts.ts';
import { updateInterestLevel } from './commercial/InterestLevel.ts';
import { prepareCommercialWriteInput } from './commercial/CommercialWriteContract.ts';
import { normalizeGenuineUseCase, normalizeUseCaseSpinFact } from './commercial/UseCaseNormalizer.ts';
import { productEvidenceSections } from './commercial/ProductEvidencePolicy.ts';
import { imageResponse, institutionalResponse, noEvidenceResponse, priceResponse, purchaseResponse, quoteRequestResponse, stockResponse } from './commercial/ResponsePolicy.ts';
import { extractReservationBundle, mergeReservationBundle, reservationBundleMissing, reservationBundlePrompt, reservationBundleStage, reservationMissingPrompt } from './commercial/ReservationData.ts';
import { validateTurnDecision } from './decision/DecisionValidator.ts';
import { resolveInstitutionalTopic } from './institutional/InstitutionalTopicResolver.ts';
import { resolveIntentPlan } from './intent/IntentPlan.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from './nba/PostAnswerCommercialProgression.ts';
import { rankRecommendations } from './recommendation/RecommendationPolicy.ts';
import { partitionRecommendationCandidates } from './recommendation/CandidatePool.ts';
import { resolveReference } from './reference/ReferenceResolver.ts';
import { reduceState } from './state/StateReducer.ts';
import { safeWrite } from './writer/WriterGuard.ts';
import { fold } from '../shared/text.ts';

type Dependencies = {
  conversations: ConversationRepository;
  telemetry: TelemetryRepository;
  erp: ErpRepository;
  rag: RagRepository;
  llm: LlmProvider;
  automation: AutomationBus;
};
type CandidateRank = { quote: ProductQuote; evidence: RagEvidence[]; score: number; reasons:string[]; criteria:string[]; criterionScores:Record<string,number>; tradeoffs:string[]; confidence:number; winnerStatus:'WINNER'|'NO_COMPARABLE_EVIDENCE'|'TOP_TIE'|'NOT_TOP' };
type RankCandidatesResult={ranks:CandidateRank[];trace:RecommendationDecisionTrace};
type ReservationAdvance={stage:ConversationState['reservationStage'];document?:string|null;name?:string|null;address?:string|null;answer:string;nba:string;route:string;cancelled?:boolean};
type ErpAuthorityDiagnostics={errors:string[]};

function unique(values: Array<unknown>): string[] {
  return [...new Set(values.filter((v):v is string=>typeof v==='string').map(v=>v.trim()).filter(Boolean))];
}
function productName(q: ProductQuote | null | undefined): string | null {
  return q ? String(q.shortName ?? q.product).trim() || null : null;
}
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && fold(a) === fold(b));
}
function recommendationReasonForCriterion(reason:string,criterion:string):boolean{
  const text=fold(reason);const key=criterion.toUpperCase();
  if(key==='BATERIA')return /bateria|carga|mah/.test(text);
  if(key==='RESISTENCIA')return /resisten|caida|ip68|ip69|mil.std/.test(text);
  if(key==='MEMORIA')return /ram|memoria|almacen/.test(text);
  if(key==='CAMARA')return /camara|mp|nocturna|video/.test(text);
  if(key==='FISICO')return /peso|dimension|grosor/.test(text);
  return text.includes(fold(criterion));
}
function verifiedRecommendationChangeReason(trace:RecommendationDecisionTrace|null,from:string|null,to:string|null,reasons:string[]):string|null{
  if(!trace||!from||!to||same(from,to))return null;
  if(trace.discardedCandidates.some(candidate=>same(candidate.product,from)&&candidate.reason==='BUDGET'))return 'encaja en el presupuesto indicado';
  const winner=trace.rankedCandidates.find(candidate=>same(candidate.product,to));
  const previous=trace.rankedCandidates.find(candidate=>same(candidate.product,from));
  if(!winner||!previous)return null;
  const differentiator=(winner.criteria??[])
    .map(criterion=>({criterion,delta:Number(winner.criterionScores?.[criterion]??0)-Number(previous.criterionScores?.[criterion]??0)}))
    .filter(item=>Number.isFinite(item.delta)&&item.delta>1e-9)
    .sort((a,b)=>b.delta-a.delta)[0]?.criterion;
  if(!differentiator)return null;
  return reasons.find(reason=>recommendationReasonForCriterion(reason,differentiator))??null;
}
function normalizeIntent(intent: string, budget: number | null): string {
  if (intent === 'PRICE_AVAILABILITY') return 'PRICE';
  if (intent === 'IMAGES') return 'IMAGE';
  if (intent === 'ATTRIBUTE') return 'CAPABILITY';
  if (intent === 'OBJECTION') return 'HANDLE_PRICE_OBJECTION';
  if (intent === 'RECOMMEND') return budget != null ? 'RECOMMEND_WITHIN_BUDGET' : 'RECOMMEND';
  return intent || 'OTHER';
}
function semanticIntent(intent: string): string {
  if (intent === 'PRICE') return 'PRICE_AVAILABILITY';
  if (intent === 'IMAGE') return 'IMAGES';
  if (intent === 'CAPABILITY') return 'ATTRIBUTE';
  if (intent === 'HANDLE_PRICE_OBJECTION') return 'OBJECTION';
  if (intent === 'RECOMMEND_WITHIN_BUDGET') return 'RECOMMEND';
  return intent;
}
function stageFor(intent: string, proposed: string | null): string {
  if (proposed) return proposed;
  if (intent === 'PURCHASE') return 'CIERRE';
  if (['HUMAN','QUOTE'].includes(intent)) return 'CIERRE_ASISTIDO';
  if (intent === 'HANDLE_PRICE_OBJECTION') return 'OBJECION';
  if (['RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent)) return 'EVALUACION';
  if (['PRICE','STOCK'].includes(intent)) return 'CONSIDERACION';
  return 'DESCUBRIMIENTO';
}
function strategyFor(intent: string): string {
  if (['PURCHASE','HUMAN','QUOTE'].includes(intent)) return 'CIERRE_PROGRESIVO';
  if (intent === 'HANDLE_PRICE_OBJECTION') return 'LAER';
  if (intent === 'COMPARE') return 'ELECCION_GUIADA';
  if (['PRODUCT_INFO','CAPABILITY','RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE'].includes(intent)) return 'FAB_SPIN';
  return 'RESPUESTA_DIRECTA';
}
function inheritedFactualIntent(lastIntent: string | null | undefined, referenceReason: string): string | null {
  if (!['COMPARISON_ALTERNATIVE','RECOMMENDED_REFERENT','SELECTION_REFERENT'].includes(referenceReason)) return null;
  const prior=normalizeIntent(String(lastIntent ?? ''),null);
  return ['PRICE','STOCK','CAPABILITY','IMAGE'].includes(prior) ? prior : null;
}
function fallbackDecision(message: string, state: ConversationState): TurnDecision {
  const plan = resolveIntentPlan(message);
  const ref = resolveReference(message, state);
  const institutional = resolveInstitutionalTopic(message);
  const institutionalIntent = institutional
    ? (institutional.category === 'garantia' || (institutional.category === 'postventa' && institutional.subcategory === 'garantia_general') ? 'WARRANTY' : 'POLICY')
    : null;
  const inheritedIntent = plan.primary === 'OTHER' ? inheritedFactualIntent(state.lastIntent,ref.reason) : null;
  const primary = plan.primary === 'OTHER' ? (institutionalIntent ?? inheritedIntent ?? plan.primary) : plan.primary;
  const intent = normalizeIntent(primary, state.budget ?? null);
  return {
    primaryIntent:intent,
    secondaryIntents:plan.secondary.map(x => normalizeIntent(x, state.budget ?? null)),
    targetProduct:ref.queryTarget ?? state.queryTarget ?? state.activeProduct ?? null,
    mentionedProducts:ref.mentionedProducts,
    referenceType:ref.reason,
    explicitSwitch:ref.explicitSwitch,
    selectedProduct:ref.selectedProduct,
    comparisonProducts:state.comparisonProducts ?? [],
    attributes:plan.attributes,
    customerNeed:state.useCase ?? null,
    customerProblem:state.problem ?? null,
    priorities:state.priorities ?? [],
    objection:state.objection ?? null,
    commercialStage:state.commercialStage ?? null,
    spinContribution:null,
    nextBestAction:nextBestAction(intent, state),
    needsSql:['PRICE','STOCK','IMAGE','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','ORDER_STATUS'].includes(intent),
    needsProductRag:['PRODUCT_INFO','CAPABILITY','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE','HANDLE_PRICE_OBJECTION'].includes(intent),
    needsInstitutionalRag:['POLICY','WARRANTY'].includes(intent),
    confidence:(institutionalIntent && primary === institutionalIntent) || inheritedIntent ? 0.99 : plan.confidence,
  };
}
function plannerDebug(result: LlmDecisionResult | null) {
  if (!result) return undefined;
  return {
    model:result.model,
    inputTokens:result.usage.inputTokens,
    outputTokens:result.usage.outputTokens,
    totalTokens:result.usage.totalTokens,
    cachedInputTokens:result.usage.cachedInputTokens,
    durationMs:result.durationMs,
  };
}
function extractOrderCredentials(message:string):{orderNumber:string|null;email:string|null}{
  const email=message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const orderNumber=message.match(/\b(?:pedido|orden)\s*(?:n(?:ro|°)?\.?|#)?\s*([A-Z0-9-]{4,})\b/i)?.[1] ?? null;
  return {orderNumber,email};
}
function resolutionOrigin(referenceType:string|null|undefined, explicitSwitch:boolean, resolved:boolean,target:string|null,previous:ConversationState):string {
  if(!resolved)return 'SIN_RESOLVER';
  const ref=String(referenceType??'').toUpperCase();
  if(explicitSwitch||ref==='SELECTION_REFERENT')return 'SELECCION_USUARIO';
  if(['RECOMMENDED_REFERENT','COMPARISON_ALTERNATIVE','RECOMMENDED_FALLBACK'].includes(ref))return 'REFERENCIA_CONTEXTO';
  if(ref==='ACTIVE_PRODUCT_FALLBACK'||same(target,previous.activeProduct))return 'PRODUCTO_ACTIVO';
  return 'MENSAJE_ACTUAL';
}
function tokenSum(values:Array<number|null|undefined>):number|null {
  const nums=values.filter((x):x is number=>typeof x==='number'&&Number.isFinite(x));
  return nums.length?nums.reduce((a,b)=>a+b,0):null;
}
function spinContributionCode(previous:ConversationState,current:ConversationState,decision:TurnDecision):string|null {
  const raw=fold(decision.spinContribution??'');
  if(raw.includes('implic'))return 'IMPLICACION';
  if(!previous.problem&&current.problem)return 'PROBLEMA';
  if((!previous.useCase&&current.useCase)||(!previous.sector&&current.sector))return 'SITUACION';
  const before=new Set(previous.priorities??[]);
  if((current.priorities??[]).some(p=>!before.has(p)))return 'NECESIDAD_SOLUCION';
  if(raw.includes('proble'))return 'PROBLEMA';
  if(raw.includes('neces')||raw.includes('prioridad'))return 'NECESIDAD_SOLUCION';
  if(raw)return 'SITUACION';
  return null;
}
function recommendationSections(state:ConversationState):string[]{
  const base=productEvidenceSections({primary:'RECOMMEND'},state);
  const use=fold(state.useCase??'');
  const problem=fold(state.problem??'');
  const combined=`${use} ${problem}`;
  const extra:string[]=[];
  if(/delivery|repart|logistica/.test(use))extra.push('BATERIA','RESISTENCIA','POSICIONAMIENTO','REDES','CONECTIVIDAD');
  if(/campo|construccion|obra|tecnico/.test(use))extra.push('RESISTENCIA','BATERIA');
  if(/caida|durabilidad|golpe/.test(problem))extra.push('RESISTENCIA');
  if(/autonomia/.test(problem))extra.push('BATERIA');
  if(/foto|fotografia|camara|video|redes sociales|subir.*red/.test(combined))extra.push('CAMARA','MEMORIA','CONECTIVIDAD','REDES');
  if(/termic|temperatura|calor/.test(combined))extra.push('TERMICA','SENSORES','RESISTENCIA');
  return unique([...base,...extra]).slice(0,8);
}
function isComparisonFollowup(message:string,state:ConversationState,decision:TurnDecision):boolean{
  if((state.comparisonProducts?.length??0)<2||!(decision.attributes?.length))return false;
  const t=fold(message);
  return /\b(cual|que)\b[^?.!]{0,55}\b(mejor|gana|conviene)\b/.test(t)
    || /^y\s+en\s+/.test(t)
    || (/^y\s+/.test(t)&&['COMPARE','CAPABILITY'].includes(String(state.lastIntent??'').toUpperCase()));
}
function explicitUnknownTarget(message:string,decision:TurnDecision):boolean{
  const target=String(decision.targetProduct??'').trim();
  if(!target)return false;
  const named=(decision.mentionedProducts??[]).some(x=>same(x,target));
  return named&&fold(message).includes(fold(target));
}
function safeError(error:unknown):string{
  const raw=error instanceof Error?error.message:String(error);
  return raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]').replace(/\b\d{8,12}\b/g,'[REDACTED_ID]').slice(0,240);
}
function isReservationAbandonment(message:string):boolean{
  const text=fold(message);
  return /\b(?:ya\s+no|no\s+quiero|cancel|anul|abandona|dejemos|deten|para(?:r)?)\b[^.!?]{0,55}\b(?:reserva|separacion|compra)\b/.test(text)
    || /\b(?:reserva|separacion|compra)\b[^.!?]{0,55}\b(?:cancel|anul|abandona|dejemos|deten|para(?:r)?)\b/.test(text);
}
function isExplicitReservationOperation(message:string):boolean{
  const text=fold(message);
  return /\b(?:continu|seguir|retom|avanz)\w*\b[^.!?]{0,45}\b(?:reserva|separacion)\b/.test(text)
    || /\b(?:reserva|separacion)\b[^.!?]{0,45}\b(?:continu|seguir|retom|avanz)\w*\b/.test(text);
}
function reservationFieldCompatible(stage:ConversationState['reservationStage'],message:string):boolean{
  const bundle=extractReservationBundle(message);
  if(bundle.document||bundle.name||bundle.address)return true;
  const raw=message.trim();
  if(stage==='NEED_DOCUMENT'){
    const value=raw.replace(/[\s.-]/g,'').toUpperCase();
    return /^[A-Z0-9]{8,12}$/.test(value)&&/[0-9]{6}/.test(value);
  }
  if(stage==='NEED_NAME')return !/[?¿]/.test(raw)&&raw.length>=5&&raw.split(/\s+/).filter(Boolean).length>=2&&/^[\p{L}\s.'-]+$/u.test(raw);
  if(stage==='NEED_ADDRESS')return raw.length>=6&&/\p{L}/u.test(raw)&&(/\d/u.test(raw)||/\b(?:av|avenida|jr|jiron|calle|mz|manzana|lote|urbanizacion|distrito)\b/i.test(fold(raw)));
  return false;
}
function reservationOwnsTurn(state:ConversationState,message:string):boolean{
  if(!state.reservationStage)return false;
  if(isReservationAbandonment(message)||isExplicitReservationOperation(message))return true;
  const bundle=extractReservationBundle(message);
  if(bundle.document||bundle.name||bundle.address)return true;
  if(!reservationFieldCompatible(state.reservationStage,message))return false;
  if(state.reservationStage==='NEED_ADDRESS'&&!/[?¿]/.test(message)&&/\b(?:av|avenida|jr|jiron|calle|mz|manzana|lote|urbanizacion|distrito)\b/i.test(fold(message)))return true;
  return fallbackDecision(message,state).primaryIntent==='OTHER';
}
function reservationAdvance(state:ConversationState,message:string):ReservationAdvance|null{
  const stage=state.reservationStage;
  if(!stage)return null;
  const raw=message.trim();
  if(isReservationAbandonment(message))return{stage:null,document:null,name:null,address:null,cancelled:true,answer:'Entendido, detuve la captura de datos para la reserva. La reserva no llegó a confirmarse.',nba:'ANSWER_ONLY',route:'RESERVATION_CANCELLED'};

  const incoming=extractReservationBundle(raw);
  if(incoming.document||incoming.name||incoming.address){
    const merged=mergeReservationBundle({document:state.reservationDocument??null,name:state.reservationCustomerName??null,address:state.reservationAddress??null},incoming);
    const missing=reservationBundleMissing(merged);
    const nextStage=reservationBundleStage(merged);
    if(missing.length)return{stage:nextStage,document:merged.document,name:merged.name,address:merged.address,answer:reservationMissingPrompt(missing),nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
    return{stage:'READY',document:merged.document,name:merged.name,address:merged.address,answer:'Ya tengo los datos necesarios. La reserva todavía no está confirmada; falta registrar la operación autorizada.',nba:'EXECUTE_RESERVATION',route:'RESERVATION_READY'};
  }

  if(stage==='NEED_DOCUMENT'){
    const value=raw.replace(/[\s.-]/g,'').toUpperCase();
    if(!/^[A-Z0-9]{8,12}$/.test(value)||!/[0-9]{6}/.test(value))return{stage,answer:'Necesito un DNI o Carné de Extranjería válido para continuar la reserva.',nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
    const merged=mergeReservationBundle({document:value,name:state.reservationCustomerName??null,address:state.reservationAddress??null},{});
    const missing=reservationBundleMissing(merged);
    return{stage:reservationBundleStage(merged),document:value,answer:reservationMissingPrompt(missing),nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
  }
  if(stage==='NEED_NAME'){
    const words=raw.split(/\s+/).filter(Boolean);
    if(words.length<2||raw.length<5||!/^[\p{L}\s.'-]+$/u.test(raw))return{stage,answer:'Indícame tus nombres y apellidos completos para continuar.',nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
    const merged=mergeReservationBundle({document:state.reservationDocument??null,name:raw,address:state.reservationAddress??null},{});
    const missing=reservationBundleMissing(merged);
    return{stage:reservationBundleStage(merged),name:raw,answer:reservationMissingPrompt(missing),nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
  }
  if(stage==='NEED_ADDRESS'){
    if(raw.length<6||!/\p{L}|\d/u.test(raw))return{stage,answer:'Necesito una dirección válida para continuar.',nba:'COLLECT_RESERVATION_DATA',route:'RESERVATION_DATA'};
    return{stage:'READY',address:raw,answer:'Ya tengo los datos necesarios. La reserva todavía no está confirmada; falta registrar la operación autorizada.',nba:'EXECUTE_RESERVATION',route:'RESERVATION_READY'};
  }
  if(stage==='READY')return{stage,answer:'La reserva aún no está confirmada. No voy a afirmar que existe hasta que la operación autorizada termine correctamente.',nba:'EXECUTE_RESERVATION',route:'RESERVATION_READY'};
  return{stage,answer:'La reserva ya quedó registrada previamente.',nba:'ANSWER_ONLY',route:'RESERVATION_CONFIRMED'};
}

export class HybridConversationEngine {
  readonly #deps: Dependencies;
  constructor(deps: Dependencies) { this.#deps = deps; }

  async #quote(name: string | null, candidates: ProductQuote[] = [], diagnostics?:ErpAuthorityDiagnostics): Promise<ProductQuote | null> {
    if (!name) return null;
    const local = candidates.find(q => same(productName(q), name));
    if (local) return local;
    try { return await this.#deps.erp.getProductQuote(name); }
    catch(error) { diagnostics?.errors.push(safeError(error)); return null; }
  }

  async #searchCandidates(message: string, target: string | null, diagnostics?:ErpAuthorityDiagnostics): Promise<ProductQuote[]> {
    if (!this.#deps.erp.searchProducts) return [];
    const rows: ProductQuote[] = [];
    try { rows.push(...await this.#deps.erp.searchProducts(message, 10)); }
    catch(error) { diagnostics?.errors.push(safeError(error)); }
    if (target && !rows.some(q => same(productName(q), target))) {
      try { rows.push(...await this.#deps.erp.searchProducts(target, 10)); }
      catch(error) { diagnostics?.errors.push(safeError(error)); }
    }
    const seen = new Set<string>();
    return rows.filter(row => {
      const key = fold(productName(row) ?? row.product);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async #productEvidence(query:string, quote:ProductQuote|null, sections:string[], limit=8):Promise<RagEvidence[]> {
    const name=productName(quote);
    if (quote?.productRagId && this.#deps.rag.searchProduct) {
      return this.#deps.rag.searchProduct(query,quote.productRagId,sections,limit);
    }
    return name ? this.#deps.rag.search(query,name) : [];
  }

  async #rankCandidates(state:ConversationState, query:string, maxBudget:number, exclude:string|null, max=2):Promise<RankCandidatesResult> {
    let options:ProductQuote[]=[];
    try {
      options=this.#deps.erp.listCatalog
        ? await this.#deps.erp.listCatalog({onlyWithStock:false})
        : await this.#deps.erp.listProductsWithinBudget(maxBudget);
    } catch {
      try { options=await this.#deps.erp.listProductsWithinBudget(maxBudget); }
      catch { return {ranks:[],trace:{catalogCandidates:[],availableCandidates:[],eligibleCandidates:[],discardedCandidates:[],sectionsRequested:[],sectionsRecovered:[],rankedCandidates:[],winner:null}}; }
    }
    const pool=partitionRecommendationCandidates(options,{maxBudget,exclude});
    const catalogCandidates=unique(pool.catalog.map(productName));
    const availableCandidates=unique(pool.available.map(productName));
    const discardedCandidates:RecommendationDecisionTrace['discardedCandidates']=pool.discarded;
    const eligible:ProductQuote[]=pool.eligible;
    const sections=recommendationSections(state);
    const candidates:Array<{quote:ProductQuote;evidence:RagEvidence[]}>=[];
    for(const quote of eligible.slice(0,20)){
      const evidence=await this.#productEvidence(query,quote,sections,Math.max(6,sections.length)).catch(()=>[]);
      candidates.push({quote,evidence});
    }
    const rankedAll=rankRecommendations(candidates,{
      priorities:state.priorities??[],
      useCase:state.useCase??null,
      problem:state.problem??null,
      maxBudget,
      priceIsCriterion:state.budget!=null||(state.priorities??[]).some(value=>fold(value)==='precio'),
    });
    const toTrace=(x:typeof rankedAll[number])=>({product:productName(x.quote)??x.quote.product,productId:x.quote.productRagId??null,score:x.score,confidence:x.confidence,criteria:x.criteria,criterionScores:x.criterionScores,reasons:x.reasons,tradeoffs:x.tradeoffs});
    const ranks:CandidateRank[]=rankedAll.slice(0,max).map(x=>({quote:x.quote,evidence:x.evidence,score:x.score,reasons:x.reasons,criteria:x.criteria,criterionScores:x.criterionScores,tradeoffs:x.tradeoffs,confidence:x.confidence,winnerStatus:x.winnerStatus}));
    const winnerReason=rankedAll[0]?.winnerStatus==='NOT_TOP'?'NO_CANDIDATES':rankedAll[0]?.winnerStatus??'NO_CANDIDATES';
    return {
      ranks,
      trace:{
        catalogCandidates,
        availableCandidates,
        eligibleCandidates:eligible.slice(0,20).map(q=>({product:productName(q)??q.product,productId:q.productRagId??null})),
        discardedCandidates,
        sectionsRequested:sections,
        sectionsRecovered:unique(candidates.flatMap(c=>c.evidence.map(e=>e.section))),
        rankedCandidates:rankedAll.slice(0,10).map(toTrace),
        winner:winnerReason==='WINNER'?productName(rankedAll[0]?.quote)??null:null,
        winnerReason,
      },
    };
  }

  async #recordUsage(sessionId:string,turn:number,route:string,messageId:string|null,result:{model:string;usage:any;durationMs:number}|null):Promise<{delivered:boolean;error?:string}>{
    if(!result)return{delivered:true};
    try{
      await this.#deps.telemetry.recordLlmUsage({sessionId,turn,route,model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens,cachedTokens:result.usage.cachedInputTokens,durationMs:result.durationMs,messageId});
      return{delivered:true};
    }catch(error){return{delivered:false,error:error instanceof Error?error.message:String(error)};}
  }

  async processTurn(input:ChatInput):Promise<ChatTurnResult>{
    const started=performance.now();
    if(!input.sessionId?.trim())throw new Error('sessionId is required');
    if(!input.message?.trim())throw new Error('message is required');

    const messageId=input.messageId?.trim()||`backend:${crypto.randomUUID()}`;
    const requestId=messageId;
    const atomic=Boolean(this.#deps.conversations.beginTurn&&this.#deps.conversations.completeTurn);
    let leaseAcquired=false;
    if(atomic){await this.#deps.conversations.beginTurn!(input.sessionId,messageId,requestId);leaseAcquired=true;}

    try {
      const previous=await this.#deps.conversations.getState(input.sessionId);
      const turn=(previous.turnCount??0)+1;

      const reservation=reservationOwnsTurn(previous,input.message)?reservationAdvance(previous,input.message):null;
      if(reservation){
        const reservationIntent=reservation.cancelled?'POLICY':'PURCHASE';
        const decisionTrace:TurnDecisionTrace={deterministicIntent:reservationIntent,plannerIntent:null,finalIntent:reservationIntent,route:reservation.route,nextBestAction:reservation.nba,targetProduct:previous.selectedProduct??previous.queryTarget??previous.recommendedProduct??previous.activeProduct??null,recommendation:null};
        const nextState=reduceState(previous,{
          contextVersion:previous.contextVersion??0,reservationStage:reservation.stage,reservationDocument:reservation.document!==undefined?reservation.document:previous.reservationDocument??null,reservationCustomerName:reservation.name!==undefined?reservation.name:previous.reservationCustomerName??null,reservationAddress:reservation.address!==undefined?reservation.address:previous.reservationAddress??null,
          purchaseSignal:!reservation.cancelled,lastIntent:reservationIntent,lastRoute:reservation.route,lastNba:reservation.nba,pendingCommercialAction:reservation.cancelled?null:reservation.nba,commercialStage:reservation.cancelled?'CONSIDERACION':'CIERRE',commercialStrategy:reservation.cancelled?'RESPUESTA_DIRECTA':'CIERRE_PROGRESIVO',handoffActive:false,blockAutomaticReply:false,handoffReason:null,lastDecisionTrace:decisionTrace,lastUserMessage:input.message,lastAssistantMessage:reservation.answer,
        });
        const completionMeta={messageId,requestId,conversationType:input.sessionId.startsWith('qa-')?'QA_LIVE':null,model:'stech-reservation-deterministic',inputTokens:null,outputTokens:null,totalTokens:null,cachedInputTokens:null,totalPrompts:0};
        if(atomic){await this.#deps.conversations.completeTurn!(input.sessionId,input.message,reservation.answer,nextState,completionMeta);leaseAcquired=false;}
        else{await this.#deps.conversations.appendMessage(input.sessionId,'user',input.message,completionMeta);await this.#deps.conversations.saveState(input.sessionId,nextState);await this.#deps.conversations.appendMessage(input.sessionId,'assistant',reservation.answer,completionMeta);}
        console.log(JSON.stringify({event:'STECH_TURN_TRACE',sessionId:input.sessionId,messageId,finalIntent:reservationIntent,route:reservation.route,nextBestAction:reservation.nba,target:decisionTrace.targetProduct}));
        let automation:{delivered:boolean;error?:string}={delivered:true};
        try{automation=await this.#deps.automation.publish({type:'conversation.turn.completed',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{intent:reservationIntent,route:reservation.route,product:decisionTrace.targetProduct,nextBestAction:reservation.nba}});}catch(error){automation={delivered:false,error:error instanceof Error?error.message:String(error)};}
        return{sessionId:input.sessionId,answer:reservation.answer,state:{...nextState,contextVersion:(previous.contextVersion??0)+1},debug:{intent:reservationIntent,route:reservation.route,sqlTools:[],queryTarget:decisionTrace.targetProduct??null,explicitSwitch:false,budget:previous.budget??null,priceObjection:false,ragSources:[],nextBestAction:reservation.nba,handoff:false,handoffReason:null,decisionTrace,telemetry:{delivered:true},automation,durationMs:Math.max(0,Math.round(performance.now()-started))}};
      }

      const facts=extractCommercialFacts(input.message,previous);
      const budgetTurn=classifyBudgetTurn(input.message,{prevBudget:previous.budget??null});
      const resolvedObjection=budgetTurn.priceObjection?'precio':(budgetTurn.budget||facts.purchaseSignal)?null:facts.objection;
      const baseState:ConversationState={...previous,budget:budgetTurn.budget?.max??previous.budget??null,customerType:facts.customerType,sector:facts.sector,useCase:facts.useCase,problem:facts.problem,priorities:facts.priorities,quantity:facts.quantity,invoiceRequired:facts.invoiceRequired,objection:resolvedObjection,interestSignal:facts.interestSignal,purchaseSignal:facts.purchaseSignal,spinFacts:facts.spinFacts};

      let deterministicDecision=fallbackDecision(input.message,baseState);
      if(budgetTurn.budget&&!budgetTurn.priceObjection){
        const hasDecisionContext=Boolean(baseState.useCase||baseState.problem||(baseState.priorities?.length??0)>0);
        const budgetIntent=hasDecisionContext?'RECOMMEND_WITHIN_BUDGET':'BUDGET_CONSTRAINT';
        deterministicDecision={...deterministicDecision,primaryIntent:budgetIntent,nextBestAction:nextBestAction(budgetIntent,baseState),needsSql:budgetIntent==='RECOMMEND_WITHIN_BUDGET',needsProductRag:budgetIntent==='RECOMMEND_WITHIN_BUDGET',confidence:0.99};
      }
      if(isComparisonFollowup(input.message,baseState,deterministicDecision))deterministicDecision={...deterministicDecision,primaryIntent:'COMPARE',comparisonProducts:(baseState.comparisonProducts??[]).slice(0,2),nextBestAction:nextBestAction('COMPARE',baseState),needsSql:true,needsProductRag:true,confidence:0.99};

      let planner:LlmDecisionResult|null=null;let plannerFailure:string|undefined;
      try{if(this.#deps.llm.decide)planner=await this.#deps.llm.decide({message:input.message,state:baseState});}catch(error){plannerFailure=error instanceof Error?error.message:String(error);}

      const rawDecision=planner?.decision??deterministicDecision;
      const deterministicOverride=['POLICY','WARRANTY','PRICE','STOCK','CAPABILITY','IMAGE','PURCHASE','BUDGET_CONSTRAINT','RECOMMEND_WITHIN_BUDGET'].includes(deterministicDecision.primaryIntent);
      const cameraImageConflict=['IMAGE','IMAGES'].includes(String(rawDecision.primaryIntent).toUpperCase())&&deterministicDecision.primaryIntent!=='IMAGE'&&deterministicDecision.attributes.includes('CAMARA');
      const strongReference=['COMPARISON_ALTERNATIVE','RECOMMENDED_REFERENT','SELECTION_REFERENT'].includes(String(deterministicDecision.referenceType??'').toUpperCase())&&['PRICE','STOCK','CAPABILITY','IMAGE','PURCHASE'].includes(deterministicDecision.primaryIntent);
      const strongRecommendation=['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(deterministicDecision.primaryIntent)&&/\b(mejor|mas|conviene|recomiend|alternativa|presupuesto)\b/.test(fold(input.message));
      const budgetAuthority=['BUDGET_CONSTRAINT','RECOMMEND_WITHIN_BUDGET'].includes(deterministicDecision.primaryIntent)&&!['PURCHASE','HUMAN','QUOTE'].includes(rawDecision.primaryIntent);
      const comparisonAuthority=deterministicDecision.primaryIntent==='COMPARE'&&(baseState.comparisonProducts?.length??0)>=2;
      const needTargetConflict=['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(deterministicDecision.primaryIntent)&&!deterministicDecision.targetProduct&&Boolean(rawDecision.targetProduct)&&!explicitUnknownTarget(input.message,rawDecision);
      const forceDeterministic=(rawDecision.primaryIntent==='OTHER'&&deterministicOverride)||cameraImageConflict||strongReference||strongRecommendation||budgetAuthority||comparisonAuthority||needTargetConflict;
      const guardedDecision=forceDeterministic?{...rawDecision,primaryIntent:deterministicDecision.primaryIntent,targetProduct:deterministicDecision.targetProduct,referenceType:deterministicDecision.referenceType,selectedProduct:deterministicDecision.selectedProduct,mentionedProducts:deterministicDecision.mentionedProducts,comparisonProducts:deterministicDecision.comparisonProducts,attributes:deterministicDecision.attributes,nextBestAction:deterministicDecision.nextBestAction}:rawDecision;
      const erpDiagnostics:ErpAuthorityDiagnostics={errors:[]};
      const initialCandidates=await this.#searchCandidates(input.message,guardedDecision.targetProduct,erpDiagnostics);
      const candidateNames=unique(initialCandidates.map(productName));
      const currentReference=resolveReference(input.message,baseState,{knownProducts:candidateNames});
      if(currentReference.mentionedProducts.length){
        deterministicDecision={...deterministicDecision,targetProduct:currentReference.queryTarget,mentionedProducts:currentReference.mentionedProducts,referenceType:currentReference.reason,explicitSwitch:currentReference.explicitSwitch,selectedProduct:currentReference.selectedProduct};
      }
      let decision=validateTurnDecision(guardedDecision,baseState,candidateNames,deterministicDecision);
      let intent=normalizeIntent(decision.primaryIntent,baseState.budget??null);

      const currentNamedProduct=String(decision.referenceType??'').toUpperCase()==='NAMED_QUERY_TARGET'&&Boolean(decision.targetProduct)&&decision.mentionedProducts.some(product=>same(product,decision.targetProduct));
      const supersedesRecommendation=currentNamedProduct&&Boolean(baseState.recommendedProduct)&&!same(baseState.recommendedProduct,decision.targetProduct)&&!['RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent);
      const decisionUseCase=normalizeGenuineUseCase(decision.customerNeed);
      const decisionSpin=normalizeUseCaseSpinFact(decision.spinContribution);
      const commercialState:ConversationState={...baseState,recommendedProduct:supersedesRecommendation?null:baseState.recommendedProduct,useCase:normalizeGenuineUseCase(baseState.useCase)??decisionUseCase,problem:baseState.problem??decision.customerProblem??null,priorities:unique([...(baseState.priorities??[]),...(decision.priorities??[])]),objection:baseState.objection??decision.objection??null,spinFacts:unique([...(baseState.spinFacts??[]),decisionSpin])};
      const hasKnownProduct=Boolean(decision.targetProduct||commercialState.selectedProduct||commercialState.recommendedProduct||commercialState.activeProduct);
      const hasSolutionContext=Boolean(commercialState.useCase||commercialState.problem||(commercialState.priorities?.length??0)>=2);
      const recommendationCue=/\b(cual|que)\b[^?.!]{0,60}\b(conviene|recomiend|mejor)\b|\bpara\s+(?:mi|este|ese)\s+uso\b/.test(fold(input.message));
      if(intent==='CAPABILITY'&&!hasKnownProduct&&hasSolutionContext){
        intent=commercialState.budget!=null?'RECOMMEND_WITHIN_BUDGET':'RECOMMEND';
        decision={...decision,primaryIntent:intent,nextBestAction:'RECOMMEND',needsSql:true,needsProductRag:true};
      }else if(['OTHER','EVALUATE_USE'].includes(intent)&&!hasKnownProduct&&hasSolutionContext&&recommendationCue){
        intent=commercialState.budget!=null?'RECOMMEND_WITHIN_BUDGET':'RECOMMEND';
        decision={...decision,primaryIntent:intent,nextBestAction:'RECOMMEND',needsSql:true,needsProductRag:true};
      }

      const target=decision.targetProduct??commercialState.selectedProduct??commercialState.recommendedProduct??commercialState.activeProduct??null;
      const interest=updateInterestLevel({message:input.message,intent,attributes:decision.attributes,product:decision.selectedProduct??target,previous,current:{...commercialState,queryTarget:target,comparisonProducts:decision.comparisonProducts}});
      commercialState.levelOfInterest=interest.levelOfInterest;
      commercialState.interestEvents=interest.interestEvents;
      let quote=await this.#quote(target,initialCandidates,erpDiagnostics);
      const erpError=quote?null:(erpDiagnostics.errors[0]??null);
      const erpUnavailable=Boolean(target&&!quote&&erpError&&decision.needsSql);
      const requestedUnknown=Boolean(target&&!quote&&!erpUnavailable);
      let recommendedProduct=commercialState.recommendedProduct??null;let rag:RagEvidence[]=[];let images:ProductImage[]=[];let nba=decision.nextBestAction??nextBestAction(intent,commercialState);let progressionTrace:ReturnType<typeof evaluatePostAnswerCommercialProgression>|null=null;let answer='';let writerResult:Awaited<ReturnType<typeof safeWrite>>|null=null;
      let handoff=intent==='HUMAN'||nba==='ASSISTED_HANDOFF'||(intent==='PURCHASE'&&(commercialState.quantity??1)>=2);let handoffReason=handoff?(intent==='HUMAN'?'SOLICITUD_HUMANO':'CONTINUAR_VENTA'):null;const sqlTools:string[]=[];let route='HYBRID';
      let recommendationReasons:string[]=[];let recommendationCriteria:string[]=[];let recommendationTradeoffs:string[]=[];let recommendationAlternatives:string[]=[];let recommendationTrace:RecommendationDecisionTrace|null=null;
      let reservationStage=commercialState.reservationStage??null;let reservationDocument=commercialState.reservationDocument??null;let reservationCustomerName=commercialState.reservationCustomerName??null;let reservationAddress=commercialState.reservationAddress??null;
      const writerProducts=(extra:Array<string|null|undefined>=[])=>unique([...initialCandidates.map(productName),commercialState.activeProduct,commercialState.selectedProduct,commercialState.recommendedProduct,recommendedProduct,productName(quote),target,...extra]);

      if(erpUnavailable&&intent!=='IMAGE'){
        route='ERP_UNAVAILABLE';nba='ANSWER_ONLY';
        answer=target?`Temporalmente no puedo consultar el ERP para confirmar ese dato de ${target}. Prefiero no inventarte el precio, stock o disponibilidad.`:'Temporalmente no puedo consultar el ERP para confirmar ese dato. Prefiero no inventarlo.';
      }else if(requestedUnknown&&intent!=='IMAGE'){
        const query=`${input.message} ${(commercialState.priorities??[]).join(' ')} ${commercialState.problem??''} ${commercialState.useCase??''}`;
        const ranked=await this.#rankCandidates(commercialState,query,commercialState.budget??99999999,target,2);const alternatives=ranked.ranks;recommendationTrace=ranked.trace;
        const winner=alternatives[0]?.winnerStatus==='WINNER'?alternatives[0]:null;if(winner)recommendedProduct=productName(winner.quote);rag=alternatives.flatMap(x=>x.evidence.slice(0,3));recommendationReasons=winner?.reasons??[];recommendationCriteria=alternatives[0]?.criteria??[];recommendationTradeoffs=winner?.tradeoffs??[];
        nba=alternatives.length?'OFFER_ALTERNATIVE':'ASK_MISSING_FACT';route=alternatives.length?'UNKNOWN_TO_ALTERNATIVES':'UNKNOWN_NO_ALTERNATIVE';if(alternatives.length)sqlTools.push('dbo.sp_ListarCatalogoVenta');
        const alternativeNames=alternatives.map(x=>productName(x.quote)).filter((x):x is string=>Boolean(x));const names=alternativeNames.join(' y ');const reasonText=recommendationReasons.length?` Prioriza la alternativa que mejor encaja por: ${recommendationReasons.join('; ')}.`:'';
        const recoveryPlan=alternatives.length?(winner?`Ese modelo no figura disponible ahora. Presenta solamente estas alternativas reales: ${names}. Relaciónalas con la necesidad conocida y explica por qué pueden encajar.${reasonText} No menciones precio salvo que el cliente lo haya pedido.`:`Ese modelo no figura disponible ahora. Presenta ${names} como alternativas reales y neutrales. No declares una ganadora: falta evidencia diferenciadora. Pide un criterio útil para decidir.`):'No hay suficiente información para confirmar ese modelo o una alternativa adecuada. No inventes; ofrece revisar opciones reales o pasar con un asesor si corresponde.';
        const fallback=alternatives.length?`Ese modelo no figura disponible ahora. Sí tenemos ${names} como alternativas.`:noEvidenceResponse();
        writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:{...commercialState,recommendedProduct},rag,deterministicAnswer:recoveryPlan,decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts(alternativeNames),alternatives:alternativeNames}),fallback);answer=writerResult.answer;nba=writerResult.nextBestAction??nba;
      }else if(intent==='PRICE'){
        sqlTools.push('dbo.sp_BuscarProductosVenta');route='SQL_PRICE';
        progressionTrace=evaluatePostAnswerCommercialProgression({intent,currentNba:nba,state:commercialState,resolvedProduct:productName(quote)??target,verifiedCurrentAnswer:quote?.price!=null,relatedValueAvailable:quote?.stock!=null});
        const prepared=prepareCommercialWriteInput({message:input.message,intent,state:commercialState,quote,decision:{...decision,nextBestAction:progressionTrace.candidateNba},allowedProducts:writerProducts()});
        nba=prepared.nextBestAction??'ANSWER_ONLY';answer=target?priceResponse(quote,nba==='SOFT_CLOSE',nba==='RELATED_VALUE'?prepared.commercialMove??null:null):'¿Qué modelo quieres consultar?';
      }else if(intent==='STOCK'){
        sqlTools.push('dbo.sp_BuscarProductosVenta');route='SQL_STOCK';
        progressionTrace=evaluatePostAnswerCommercialProgression({intent,currentNba:nba,state:commercialState,resolvedProduct:productName(quote)??target,verifiedCurrentAnswer:quote?.stock!=null,relatedValueAvailable:Boolean(quote?.stock!=null&&quote.stock>0)});
        const prepared=prepareCommercialWriteInput({message:input.message,intent,state:commercialState,quote,decision:{...decision,nextBestAction:progressionTrace.candidateNba},allowedProducts:writerProducts()});
        nba=prepared.nextBestAction??'ANSWER_ONLY';answer=target?stockResponse(quote,facts.quantity,nba==='SOFT_CLOSE',nba==='RELATED_VALUE'?prepared.commercialMove??null:null):'¿Qué modelo quieres consultar?';
      }else if(intent==='IMAGE'){sqlTools.push('dbo.sp_BuscarImagenesProductoVenta');route='SQL_IMAGES';images=target&&this.#deps.erp.getProductImages?await this.#deps.erp.getProductImages(target,10).catch(()=>[]):[];answer=imageResponse(images)||noEvidenceResponse();
      }else if(intent==='POLICY'||intent==='WARRANTY'){
        route='RAG_INSTITUTIONAL';try{rag=this.#deps.rag.searchInstitutional?await this.#deps.rag.searchInstitutional(input.message,4):await this.#deps.rag.search(input.message,null);}catch{rag=[];}
        const fallback=institutionalResponse(rag)??noEvidenceResponse();writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:commercialState,rag,deterministicAnswer:'Responde primero la política consultada de forma clara y breve.',decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts()}),fallback);answer=writerResult.answer;nba=writerResult.nextBestAction??nba;
      }else if(intent==='COMPARE'){
        route='RAG_COMPARISON';const pair=unique([...(decision.comparisonProducts??[]),...(commercialState.comparisonProducts??[]),...(decision.mentionedProducts??[])]).slice(0,2);
        if(pair.length<2){answer='¿Qué dos modelos quieres comparar?';route='CLARIFICATION';}
        else{
          const sections=productEvidenceSections({primary:'COMPARE',attributes:decision.attributes},{...commercialState,comparisonProducts:pair});
          const compared:Array<{quote:ProductQuote;evidence:RagEvidence[]}>=[];
          for(const name of pair){const q=await this.#quote(name,initialCandidates);const evidence=await this.#productEvidence(input.message,q,sections,5).catch(()=>[]);rag.push(...evidence);if(q)compared.push({quote:q,evidence});}
          if(nba==='RECOMMEND'){
            const ranked=rankRecommendations(compared,{priorities:decision.attributes?.length?decision.attributes:commercialState.priorities,useCase:commercialState.useCase,problem:commercialState.problem,maxBudget:commercialState.budget,priceIsCriterion:(commercialState.priorities??[]).some(x=>fold(x)==='precio')});
            const winner=ranked[0]?.winnerStatus==='WINNER'?ranked[0]:null;
            if(winner){recommendedProduct=productName(winner.quote);recommendationReasons=winner.reasons;recommendationCriteria=winner.criteria;recommendationTradeoffs=winner.tradeoffs;}
          }
          const recommendationLine=recommendedProduct?` Recomienda claramente ${recommendedProduct} con las diferencias que lo sustentan.`:'';
          const plan=`Compara ${pair[0]} y ${pair[1]} de forma simétrica usando solo hechos entregados. Da una conclusión breve y hasta 3 diferencias útiles. No infieras desempeño no medido ni inventes trade-offs.${recommendationLine}`;
          const fallback=recommendedProduct?`Te recomiendo ${recommendedProduct} por la diferencia que muestra en el criterio consultado.`:rag.length?`Estas son las diferencias entre ${pair[0]} y ${pair[1]}.`:noEvidenceResponse();
          writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:{...commercialState,comparisonProducts:pair,recommendedProduct},rag,deterministicAnswer:plan,decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts(pair),alternatives:pair}),fallback);answer=writerResult.answer;nba=writerResult.nextBestAction??nba;
        }
      }else if(['PRODUCT_INFO','CAPABILITY','EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)){
        const hasDecisionContext=Boolean(commercialState.useCase||commercialState.problem||(commercialState.priorities?.length??0)>0);
        const recommendationTurn=['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)||(intent==='EVALUATE_USE'&&!target&&hasDecisionContext);
        if(recommendationTurn){
          const maxBudget=commercialState.budget??(intent==='HANDLE_PRICE_OBJECTION'&&quote?.price!=null?Math.max(0,quote.price-0.01):99999999);const query=`${input.message} ${(commercialState.priorities??[]).join(' ')} ${commercialState.problem??''} ${commercialState.useCase??''}`;
          const ranked=await this.#rankCandidates(commercialState,query,maxBudget,intent==='HANDLE_PRICE_OBJECTION'?target:null,3);const ranks=ranked.ranks;recommendationTrace=ranked.trace;
          const winner=ranks[0]?.winnerStatus==='WINNER'?ranks[0]:null;
          if(winner){quote=winner.quote;recommendedProduct=productName(quote);rag=winner.evidence;recommendationReasons=winner.reasons;recommendationCriteria=winner.criteria;recommendationTradeoffs=winner.tradeoffs;if(intent==='EVALUATE_USE')nba='RECOMMEND';}
          else if(ranks.length){rag=ranks.flatMap(item=>item.evidence.slice(0,3));recommendationCriteria=ranks[0].criteria;recommendationAlternatives=ranks.map(item=>productName(item.quote)).filter((name):name is string=>Boolean(name));nba='ASK_MISSING_FACT';}
        }else if(quote){const primary=intent==='CAPABILITY'?'ATTRIBUTE':semanticIntent(intent);const sections=productEvidenceSections({primary,attributes:decision.attributes},commercialState);rag=await this.#productEvidence(input.message,quote,sections,8).catch(()=>[]);}
        const subject=recommendedProduct??productName(quote)??target;const recommendationGuidance=recommendationReasons.length?` La recomendación se sostiene en: ${recommendationReasons.join('; ')}.${recommendationTradeoffs.length?` Trade-offs demostrados: ${recommendationTradeoffs.join('; ')}.`:''}`:'';
        const noWinner=Boolean(recommendationTurn&&recommendationTrace&&recommendationTrace.winner===null&&recommendationAlternatives.length);
        const plan=noWinner?`Presenta ${recommendationAlternatives.join(', ')} como alternativas neutrales. No declares una ganadora porque ${recommendationTrace?.winnerReason??'falta evidencia diferenciadora'}. Pide un solo criterio útil para decidir. No menciones precio si no fue solicitado.`:subject?`Responde lo actual sobre ${subject} usando únicamente los hechos entregados. Conserva las cifras técnicas exactamente como aparecen; no redondees. Sé corto y humano; si es recomendación, conclusión primero y hasta 3 puntos útiles.${recommendationGuidance} No repitas discovery, no especules y no menciones precio si no fue solicitado.`:`No repitas prioridades ya conocidas. Si existe contexto suficiente, recomienda solo con hechos entregados; si no, responde de forma natural y breve.`;
        const factUnknown=Boolean(subject&&decision.attributes?.length&&!rag.length&&!['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent));
        const fallback=noWinner?`${recommendationAlternatives.join(', ')} quedan como alternativas parejas. ¿Qué criterio pesa más para ti?`
          :nba==='ASK_MISSING_FACT'?''
          :nba==='SOFT_CLOSE'?'Listo, tomo esa información como referencia.'
          :factUnknown?`Sobre ${subject}, ese detalle no está especificado.`
          :subject?'Esa opción encaja con los criterios indicados.'
          :(hasDecisionContext?'Aún no hay una opción que destaque con claridad.':'¿Para qué uso principal necesitas el equipo?');
        const previousRecommendedProduct=previous.customerVisibleRecommendedProduct??previous.recommendedProduct??null;
        const recommendationChanged=Boolean(previousRecommendedProduct&&recommendedProduct&&!same(previousRecommendedProduct,recommendedProduct)&&decision.explicitSwitch!==true);
        const recommendationChangeReason=recommendationChanged?verifiedRecommendationChangeReason(recommendationTrace,previousRecommendedProduct,recommendedProduct,recommendationReasons):null;
        progressionTrace=evaluatePostAnswerCommercialProgression({intent,currentNba:nba,state:{...commercialState,recommendedProduct},resolvedProduct:subject,verifiedCurrentAnswer:rag.length>0,verifiedAlternatives:recommendationAlternatives.length,relatedValueAvailable:rag.length>0});
        nba=progressionTrace.candidateNba;
        writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:{...commercialState,recommendedProduct},quote,rag,deterministicAnswer:plan,decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts(recommendationAlternatives),alternatives:recommendationAlternatives,previousRecommendedProduct,recommendationChanged,recommendationChangeReason}),fallback);answer=writerResult.answer;nba=writerResult.nextBestAction??nba;
        if(writerResult.recommendationContinuity?.changed&&!writerResult.recommendationContinuity.allowed)recommendedProduct=writerResult.recommendationContinuity.effectiveRecommendedProduct;
        route=noWinner?'RAG_RECOMMENDATION_NO_WINNER':recommendationTurn&&recommendedProduct?'RAG_RECOMMENDATION':rag.length?'RAG_PRODUCT':'COMMERCIAL_REASONING';
      }else if(intent==='PURCHASE'){
        const selected=decision.selectedProduct??commercialState.selectedProduct??target??recommendedProduct??commercialState.activeProduct??null;quote=await this.#quote(selected,initialCandidates);
        if((commercialState.quantity??1)>=2){answer=purchaseResponse({...commercialState,selectedProduct:selected,queryTarget:selected,recommendedProduct},quote);handoff=true;handoffReason='CONTINUAR_VENTA';nba='ASSISTED_HANDOFF';route='ASSISTED_HANDOFF';}
        else if(!selected){answer='Claro. ¿Qué modelo quieres comprar?';handoff=false;handoffReason=null;nba='ASK_MISSING_FACT';route='CLARIFICATION';}
        else if(quote?.stock!=null&&quote.stock<=0){answer=`Ahora ${selected} no está disponible. Puedo ayudarte a revisar una alternativa disponible.`;handoff=false;handoffReason=null;nba='OFFER_ALTERNATIVE';route='PURCHASE_NO_STOCK';}
        else{answer=reservationBundlePrompt(selected);handoff=false;handoffReason=null;nba='COLLECT_RESERVATION_DATA';route='RESERVATION_DATA';reservationStage='NEED_DOCUMENT';}
      }else if(intent==='HUMAN'){
        const selected=decision.selectedProduct??commercialState.selectedProduct??null;const handoffFocus=selected??decision.targetProduct??recommendedProduct??commercialState.activeProduct??null;quote=await this.#quote(handoffFocus,initialCandidates);answer=purchaseResponse({...commercialState,selectedProduct:selected,queryTarget:handoffFocus,recommendedProduct},quote);handoff=true;handoffReason='SOLICITUD_HUMANO';nba='ASSISTED_HANDOFF';route='ASSISTED_HANDOFF';
      }else if(intent==='QUOTE'){
        answer=quoteRequestResponse({...commercialState,queryTarget:target,recommendedProduct});route='QUOTE_DISCOVERY';if(target&&facts.quantity){handoff=true;handoffReason='COTIZACION_LISTA_PARA_ASESOR';nba='ASSISTED_HANDOFF';route='ASSISTED_HANDOFF';}
      }else if(intent==='ORDER_STATUS'){
        route='SQL_ORDER';sqlTools.push('dbo.sp_ConsultarPedido');const {orderNumber,email}=extractOrderCredentials(input.message);
        if(!orderNumber||!email||!this.#deps.erp.consultOrder){answer='Para revisar el pedido necesito el número de orden y el correo usado en la compra.';route='CLARIFICATION';}
        else{const order=await this.#deps.erp.consultOrder(orderNumber,email).catch(()=>null);if(!order)answer='No pude confirmar ese pedido con los datos indicados.';else{rag=[{text:JSON.stringify(order),source:'SQL_ORDER_VERIFIED',score:100}];writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:commercialState,rag,deterministicAnswer:'Resume únicamente el estado confirmado del pedido; no agregues datos que no estén en la información recibida.',decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts()}),'Encontré el pedido, pero no puedo resumir su estado con seguridad ahora.');answer=writerResult.answer;nba=writerResult.nextBestAction??nba;}}
      }else if(intent==='BUDGET_CONSTRAINT'&&commercialState.budget!=null){answer=`Listo, tomo S/ ${commercialState.budget} como tu tope.`;route='MEMORY_BUDGET';}
      else if(intent==='GREETING'){answer='Hola, cuéntame qué equipo buscas o para qué lo necesitas.';route='GREETING';}
      else if(intent==='CATEGORIES'&&this.#deps.erp.listCategories){const rows=await this.#deps.erp.listCategories().catch(()=>[]);answer=rows.slice(0,8).map(x=>x.name).join('\n')||noEvidenceResponse();sqlTools.push('dbo.sp_ListarCategoriasVenta');route='SQL_CATEGORIES';}
      else if(intent==='SUBCATEGORIES'&&this.#deps.erp.listSubcategories){const rows=await this.#deps.erp.listSubcategories().catch(()=>[]);answer=rows.slice(0,8).map(x=>x.name).join('\n')||noEvidenceResponse();sqlTools.push('dbo.sp_ListarSubcategoriasVenta');route='SQL_SUBCATEGORIES';}
      else if(intent==='CATALOG'&&this.#deps.erp.listCatalog){const rows=await this.#deps.erp.listCatalog({onlyWithStock:true}).catch(()=>[]);answer=rows.slice(0,6).map(x=>productName(x)).filter(Boolean).join('\n')||noEvidenceResponse();sqlTools.push('dbo.sp_ListarCatalogoVenta');route='SQL_CATALOG';}
      else{writerResult=await safeWrite(this.#deps.llm,prepareCommercialWriteInput({message:input.message,intent,state:commercialState,rag:[],deterministicAnswer:'Responde lo actual sin inventar ni repetir preguntas conocidas.',decision:{...decision,nextBestAction:nba},allowedProducts:writerProducts()}),'Puedo ayudarte con productos, comparaciones, características, políticas o una compra.');answer=writerResult.answer;nba=writerResult.nextBestAction??nba;route='GENERAL_COMMERCIAL';}

      const recommendationContinuity=writerResult?.recommendationContinuity;
      const continuityBlocked=Boolean(recommendationContinuity?.changed&&!recommendationContinuity.allowed);
      const selectedProduct=String(decision.referenceType??'').toUpperCase()==='SELECTION_REFERENT'?(decision.selectedProduct??commercialState.selectedProduct??commercialState.salientProduct??target):(decision.selectedProduct??commercialState.selectedProduct??null);
      const explicitSwitch=decision.explicitSwitch&&Boolean(selectedProduct);let activeProduct=commercialState.activeProduct??null;if(!activeProduct&&quote)activeProduct=productName(quote);if(explicitSwitch&&selectedProduct)activeProduct=selectedProduct;
      if(continuityBlocked)activeProduct=previous.activeProduct??previous.customerVisibleRecommendedProduct??previous.recommendedProduct??null;
      const salientProduct=continuityBlocked?(previous.salientProduct??previous.customerVisibleRecommendedProduct??previous.recommendedProduct??activeProduct):(productName(quote)??decision.targetProduct??recommendedProduct??commercialState.salientProduct??activeProduct);const comparisonProducts=unique([...(decision.comparisonProducts??[]),...(commercialState.comparisonProducts??[])]).slice(0,2);
      const stateQueryTarget=continuityBlocked?(previous.queryTarget??previous.customerVisibleRecommendedProduct??previous.recommendedProduct??activeProduct):(decision.targetProduct??productName(quote)??commercialState.queryTarget??null);
      const targetResolvedQuote=continuityBlocked?await this.#quote(activeProduct,initialCandidates):quote;const activeQuote=await this.#quote(activeProduct,initialCandidates);const activeId=activeQuote?.productRagId??(same(activeProduct,previous.activeProduct)?previous.activeProductId:null)??null;const activeCode=activeQuote?.productCode??(same(activeProduct,previous.activeProduct)?previous.activeProductCode:null)??null;const origin=resolutionOrigin(decision.referenceType,explicitSwitch,Boolean(targetResolvedQuote?.productRagId),target,previous);

      const continuityTarget=recommendationContinuity?.changed&&recommendationContinuity.allowed?recommendedProduct:stateQueryTarget;
      const decisionTrace:TurnDecisionTrace={deterministicIntent:deterministicDecision.primaryIntent,plannerIntent:planner?.decision?.primaryIntent??null,finalIntent:intent,route,nextBestAction:nba??null,referenceType:decision.referenceType??null,targetProduct:continuityTarget,writerFallback:writerResult?.fallback?.error??null,commercialMoveKind:writerResult?.commercialMoveKind??null,recommendation:recommendationTrace,progression:progressionTrace};
      const pendingMissingFact=nba==='ASK_MISSING_FACT'?(writerResult?.missingFact??(!target?'modelo de interés':null)):null;
      const nextState=reduceState(previous,{
        contextVersion:previous.contextVersion??0,activeProduct,activeProductId:activeId,activeProductCode:activeCode,queryTarget:stateQueryTarget,salientProduct,selectedProduct,recommendedProduct,comparisonProducts,explicitSwitch,
        recommendationChanged:recommendationContinuity?.changed??false,recommendationChangeFrom:recommendationContinuity?.from??null,recommendationChangeReason:recommendationContinuity?.reason??null,recommendationChangeCommunicated:recommendationContinuity?.communicated??false,
        budget:commercialState.budget??null,lastIntent:intent,secondaryIntents:decision.secondaryIntents,lastRoute:route,lastSqlTools:sqlTools,requiresSql:decision.needsSql||sqlTools.length>0,requiresRag:decision.needsProductRag||decision.needsInstitutionalRag||rag.length>0,
        spinFacts:unique([...(commercialState.spinFacts??[]),decisionSpin]),lastSpinContribution:spinContributionCode(previous,commercialState,{...decision,spinContribution:decisionSpin}),lastNba:nba??null,pendingCommercialAction:nba??null,pendingMissingFact,currentAttributes:decision.attributes,customerType:commercialState.customerType,sector:commercialState.sector,useCase:commercialState.useCase,problem:commercialState.problem,priorities:commercialState.priorities,quantity:commercialState.quantity,invoiceRequired:commercialState.invoiceRequired,objection:commercialState.objection,interestSignal:facts.interestSignal,purchaseSignal:facts.purchaseSignal||intent==='PURCHASE',levelOfInterest:interest.levelOfInterest,interestEvents:interest.interestEvents,
        commercialStage:stageFor(intent,decision.commercialStage),commercialStrategy:strategyFor(intent),reservationStage,reservationDocument,reservationCustomerName,reservationAddress,handoffActive:handoff,blockAutomaticReply:handoff,handoffReason,lastResolvedProductId:targetResolvedQuote?.productRagId??null,lastResolvedProductCode:targetResolvedQuote?.productCode??null,lastProductResolutionConfidence:targetResolvedQuote?.productRagId?decision.confidence:0,lastProductResolutionOrigin:origin,lastDecisionTrace:decisionTrace,lastUserMessage:input.message,lastAssistantMessage:answer,
      });

      const model=writerResult?.model??planner?.model??'stech-hybrid-deterministic';const pUsage=planner?.usage;const wUsage=writerResult?.llmResult?.usage;const completionMeta={messageId,requestId,conversationType:input.sessionId.startsWith('qa-')?'QA_LIVE':null,model,inputTokens:tokenSum([pUsage?.inputTokens,wUsage?.inputTokens]),outputTokens:tokenSum([pUsage?.outputTokens,wUsage?.outputTokens]),totalTokens:tokenSum([pUsage?.totalTokens,wUsage?.totalTokens]),cachedInputTokens:tokenSum([pUsage?.cachedInputTokens,wUsage?.cachedInputTokens]),totalPrompts:(planner?1:0)+(writerResult?.llmResult?1:0)};
      if(atomic){await this.#deps.conversations.completeTurn!(input.sessionId,input.message,answer,nextState,completionMeta);leaseAcquired=false;}else{await this.#deps.conversations.appendMessage(input.sessionId,'user',input.message,completionMeta);await this.#deps.conversations.saveState(input.sessionId,nextState);await this.#deps.conversations.appendMessage(input.sessionId,'assistant',answer,completionMeta);}

      console.log(JSON.stringify({event:'STECH_TURN_TRACE',sessionId:input.sessionId,messageId,deterministicIntent:decisionTrace.deterministicIntent,plannerIntent:decisionTrace.plannerIntent,finalIntent:intent,route,nextBestAction:nba??null,target:decisionTrace.targetProduct??null,recommendedProduct:recommendedProduct??null,winner:recommendationTrace?.winner??null,winnerReason:recommendationTrace?.winnerReason??null,sectionsRequested:recommendationTrace?.sectionsRequested??[],rankedCandidates:(recommendationTrace?.rankedCandidates??[]).slice(0,5).map(x=>({product:x.product,score:x.score,confidence:x.confidence,criteria:x.criteria,criterionScores:x.criterionScores})),writerFallback:decisionTrace.writerFallback??null,erpError}));

      const plannerTelemetry=await this.#recordUsage(input.sessionId,turn,'SEMANTIC_PLAN',messageId,planner);const writerTelemetry=await this.#recordUsage(input.sessionId,turn,'COMMERCIAL_WRITE',messageId,writerResult?.llmResult??null);const telemetry=!plannerTelemetry.delivered?plannerTelemetry:writerTelemetry;let automation:{delivered:boolean;error?:string}={delivered:false};
      try{const handoffProduct=selectedProduct??(intent==='QUOTE'?target:null);automation=handoff?await this.#deps.automation.publish({type:'handoff.requested',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{product:handoffProduct,selectedProduct:selectedProduct??null,activeProduct:activeProduct??null,recommendedProduct:recommendedProduct??null,comparisonProducts,quantity:nextState.quantity??null,invoiceRequired:nextState.invoiceRequired??null,reason:handoffReason,context:nextState}}):await this.#deps.automation.publish({type:'conversation.turn.completed',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{intent,route,product:activeProduct,nextBestAction:nba}});}catch(error){automation={delivered:false,error:error instanceof Error?error.message:String(error)};}

      return{sessionId:input.sessionId,answer,state:{...nextState,contextVersion:(previous.contextVersion??0)+1},debug:{intent,secondaryIntents:decision.secondaryIntents,route,sqlTools,queryTarget:nextState.queryTarget??null,activeProduct:nextState.activeProduct??null,salientProduct:nextState.salientProduct??null,selectedProduct:nextState.selectedProduct??null,recommendedProduct:nextState.recommendedProduct??null,comparisonProducts,explicitSwitch,budget:commercialState.budget??null,priceObjection:budgetTurn.priceObjection,erp:quote,erpError,images,requestedUnknown,ragSources:unique(rag.map(x=>x.source)),ragCount:rag.length,imageCount:images.length,nextBestAction:nextState.lastNba??nba,handoff,handoffReason,recommendationCriteria,recommendationReasons,recommendationTradeoffs,decisionTrace,planner:plannerDebug(planner),plannerFailure,writer:writerResult?{model:writerResult.model,fallback:writerResult.fallback,recommendationContinuity:writerResult.recommendationContinuity}:undefined,telemetry,automation,durationMs:Math.max(0,Math.round(performance.now()-started))}};
    } catch(error) {
      console.error(JSON.stringify({event:'STECH_TURN_ERROR',sessionId:input.sessionId,messageId,error:safeError(error)}));
      if(leaseAcquired&&this.#deps.conversations.failTurn){try{await this.#deps.conversations.failTurn(input.sessionId,messageId,error instanceof Error?error.message:String(error));}catch{}}
      throw error;
    }
  }
}

import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmDecisionResult, LlmProvider, TurnDecision } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ConversationState, ProductImage, ProductQuote, RagEvidence } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { extractCommercialFacts } from './commercial/CommercialFacts.ts';
import { productEvidenceSections } from './commercial/ProductEvidencePolicy.ts';
import { imageResponse, institutionalResponse, noEvidenceResponse, priceResponse, purchaseResponse, quoteRequestResponse, stockResponse } from './commercial/ResponsePolicy.ts';
import { validateTurnDecision } from './decision/DecisionValidator.ts';
import { resolveIntentPlan } from './intent/IntentPlan.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
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

type PlannerDebug = { model:string; inputTokens:number|null; outputTokens:number|null; totalTokens:number|null; cachedInputTokens:number|null; durationMs:number };
type CandidateRank = { quote: ProductQuote; evidence: RagEvidence[]; score: number };

function unique(values: Array<string | null | undefined>): string[] { return [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))]; }
function productName(q: ProductQuote | null | undefined): string | null { return q ? String(q.shortName ?? q.product).trim() || null : null; }
function same(a: string | null | undefined, b: string | null | undefined): boolean { return Boolean(a && b && fold(a) === fold(b)); }
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
function stage(intent: string, proposed: string | null): string {
  if (proposed) return proposed;
  if (['PURCHASE','HUMAN','QUOTE'].includes(intent)) return 'CIERRE_ASISTIDO';
  if (intent === 'HANDLE_PRICE_OBJECTION') return 'OBJECION';
  if (['RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent)) return 'EVALUACION';
  if (['PRICE','STOCK'].includes(intent)) return 'CONSIDERACION';
  return 'DESCUBRIMIENTO';
}
function strategy(intent: string): string {
  if (['PURCHASE','HUMAN','QUOTE'].includes(intent)) return 'CIERRE_PROGRESIVO';
  if (intent === 'HANDLE_PRICE_OBJECTION') return 'LAER';
  if (intent === 'COMPARE') return 'ELECCION_GUIADA';
  if (['PRODUCT_INFO','CAPABILITY','RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE'].includes(intent)) return 'FAB_SPIN';
  return 'RESPUESTA_DIRECTA';
}
function plannerDebug(result: LlmDecisionResult | null): PlannerDebug | undefined {
  if (!result) return undefined;
  return { model:result.model, inputTokens:result.usage.inputTokens, outputTokens:result.usage.outputTokens, totalTokens:result.usage.totalTokens, cachedInputTokens:result.usage.cachedInputTokens, durationMs:result.durationMs };
}
function fallbackDecision(message: string, state: ConversationState, budget: number | null): TurnDecision {
  const plan = resolveIntentPlan(message);
  const ref = resolveReference(message, state);
  const intent = normalizeIntent(plan.primary, budget);
  return {
    primaryIntent:intent,
    secondaryIntents:plan.secondary.map(x => normalizeIntent(x, budget)),
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
    needsSql:['PRICE','STOCK','IMAGE','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent),
    needsProductRag:['PRODUCT_INFO','CAPABILITY','COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','EVALUATE_USE','HANDLE_PRICE_OBJECTION'].includes(intent),
    needsInstitutionalRag:['POLICY','WARRANTY'].includes(intent),
    confidence:plan.confidence,
  };
}

export class HybridConversationEngine {
  readonly #deps: Dependencies;
  constructor(deps: Dependencies) { this.#deps = deps; }

  async #quote(name: string | null, candidates: ProductQuote[] = []): Promise<ProductQuote | null> {
    if (!name) return null;
    const local = candidates.find(q => same(productName(q), name));
    if (local) return local;
    try { return await this.#deps.erp.getProductQuote(name); } catch { return null; }
  }

  async #searchCandidates(message: string, target: string | null): Promise<ProductQuote[]> {
    if (!this.#deps.erp.searchProducts) return [];
    const rows: ProductQuote[] = [];
    try { rows.push(...await this.#deps.erp.searchProducts(message, 10)); } catch {}
    if (target && !rows.some(q => same(productName(q), target))) {
      try { rows.push(...await this.#deps.erp.searchProducts(target, 10)); } catch {}
    }
    const seen = new Set<string>();
    return rows.filter(row => { const k = fold(productName(row) ?? row.product); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async #productEvidence(query: string, quote: ProductQuote | null, sections: string[], limit = 8): Promise<RagEvidence[]> {
    const name = productName(quote);
    if (quote?.productRagId && this.#deps.rag.searchProduct) return this.#deps.rag.searchProduct(query, quote.productRagId, sections, limit);
    return name ? this.#deps.rag.search(query, name) : [];
  }

  async #rankAlternatives(state: ConversationState, query: string, exclude: string | null, max = 2): Promise<CandidateRank[]> {
    const budget = state.budget ?? 99999999;
    let options: ProductQuote[] = [];
    try {
      options = this.#deps.erp.listCatalog ? await this.#deps.erp.listCatalog({ onlyWithStock:true }) : await this.#deps.erp.listProductsWithinBudget(budget);
    } catch {
      try { options = await this.#deps.erp.listProductsWithinBudget(budget); } catch { return []; }
    }
    options = options.filter(q => q.price == null || q.price <= budget).filter(q => q.stock == null || q.stock > 0).filter(q => !same(productName(q), exclude));
    const sections = productEvidenceSections({ primary:'RECOMMEND' }, state);
    const ranked: CandidateRank[] = [];
    for (const quote of options.slice(0, 20)) {
      const evidence = await this.#productEvidence(query, quote, sections, 5).catch(() => []);
      const score = evidence.reduce((n,e) => n + Number(e.score ?? 0), 0);
      ranked.push({ quote, evidence, score });
    }
    ranked.sort((a,b) => b.score - a.score || Number(a.quote.price ?? Infinity) - Number(b.quote.price ?? Infinity));
    return ranked.slice(0, max);
  }

  async #recordUsage(sessionId:string, turn:number, route:string, messageId:string|null, result:LlmDecisionResult | {model:string;usage:any;durationMs:number} | null): Promise<{delivered:boolean;error?:string}> {
    if (!result) return { delivered:true };
    try {
      await this.#deps.telemetry.recordLlmUsage({ sessionId, turn, route, model:result.model, inputTokens:result.usage.inputTokens, outputTokens:result.usage.outputTokens, cachedTokens:result.usage.cachedInputTokens, durationMs:result.durationMs, messageId });
      return { delivered:true };
    } catch (error) { return { delivered:false, error:error instanceof Error ? error.message : String(error) }; }
  }

  async processTurn(input: ChatInput): Promise<ChatTurnResult> {
    const started = performance.now();
    if (!input.sessionId?.trim()) throw new Error('sessionId is required');
    if (!input.message?.trim()) throw new Error('message is required');

    const previous = await this.#deps.conversations.getState(input.sessionId);
    const turn = (previous.turnCount ?? 0) + 1;
    await this.#deps.conversations.appendMessage(input.sessionId,'user',input.message,{ messageId:input.messageId ?? null, requestId:input.messageId ?? null, conversationType:input.sessionId.startsWith('qa-')?'QA_LIVE':null });

    const facts = extractCommercialFacts(input.message, previous);
    const budgetTurn = classifyBudgetTurn(input.message,{prevBudget:previous.budget ?? null});
    const baseState: ConversationState = {
      ...previous,
      budget:budgetTurn.budget?.max ?? previous.budget ?? null,
      customerType:facts.customerType,
      sector:facts.sector,
      useCase:facts.useCase,
      problem:facts.problem,
      priorities:facts.priorities,
      quantity:facts.quantity,
      invoiceRequired:facts.invoiceRequired,
      objection:budgetTurn.priceObjection ? 'precio' : facts.objection,
      purchaseSignal:facts.purchaseSignal,
      spinFacts:facts.spinFacts,
    };

    let planner: LlmDecisionResult | null = null;
    let plannerFailure: string | undefined;
    try { if (this.#deps.llm.decide) planner = await this.#deps.llm.decide({message:input.message,state:baseState}); }
    catch (error) { plannerFailure = error instanceof Error ? error.message : String(error); }

    const rawDecision = planner?.decision ?? fallbackDecision(input.message, baseState, baseState.budget ?? null);
    const initialCandidates = await this.#searchCandidates(input.message, rawDecision.targetProduct);
    const candidateNames = unique(initialCandidates.map(productName));
    const decision = validateTurnDecision(rawDecision, baseState, candidateNames);
    const intent = normalizeIntent(decision.primaryIntent, baseState.budget ?? null);
    const target = decision.targetProduct ?? baseState.selectedProduct ?? baseState.recommendedProduct ?? baseState.activeProduct ?? null;
    let quote = await this.#quote(target, initialCandidates);
    const requestedUnknown = Boolean(target && !quote);
    let recommendedProduct = baseState.recommendedProduct ?? null;
    let rag: RagEvidence[] = [];
    let images: ProductImage[] = [];
    let answerPlan = decision.nextBestAction ?? nextBestAction(intent, baseState, decision);
    let answer = '';
    let writerResult: Awaited<ReturnType<typeof safeWrite>> | null = null;
    let handoff = ['PURCHASE','HUMAN'].includes(intent) || answerPlan === 'ASSISTED_HANDOFF';
    let handoffReason = handoff ? (intent === 'HUMAN' ? 'SOLICITUD_HUMANO' : 'CONTINUAR_VENTA') : null;
    const sqlTools: string[] = [];
    let route = 'HYBRID';

    if (requestedUnknown && intent !== 'IMAGE') {
      const query = `${input.message} ${(baseState.priorities ?? []).join(' ')} ${baseState.problem ?? ''} ${baseState.useCase ?? ''}`;
      const alternatives = await this.#rankAlternatives(baseState, query, target, 2);
      recommendedProduct = productName(alternatives[0]?.quote) ?? null;
      rag = alternatives.flatMap(x => x.evidence.slice(0,3));
      answerPlan = alternatives.length ? `El modelo solicitado ${target} no fue encontrado en el catalogo verificado. Ofrece como alternativas reales solamente: ${alternatives.map(x=>productName(x.quote)).filter(Boolean).join(' y ')}. Relacionalas con la necesidad conocida. No menciones precio salvo que lo pidan.` : noEvidenceResponse();
      route = alternatives.length ? 'UNKNOWN_TO_ALTERNATIVES' : 'UNKNOWN_NO_ALTERNATIVE';
      if (alternatives.length) sqlTools.push('dbo.sp_ListarCatalogoVenta');
      const fallback = alternatives.length ? `No encuentro ${target} en el catálogo actual. Sí puedo ayudarte con ${alternatives.map(x=>productName(x.quote)).filter(Boolean).join(' o ')}.` : noEvidenceResponse();
      writerResult = await safeWrite(this.#deps.llm,{message:input.message,intent,state:{...baseState,recommendedProduct},rag,deterministicAnswer:String(answerPlan),decision},fallback);
      answer = writerResult.answer;
    } else if (intent === 'PRICE') {
      sqlTools.push('dbo.sp_BuscarProductosVenta');
      answer = priceResponse(quote);
      route = 'SQL_PRICE';
    } else if (intent === 'STOCK') {
      sqlTools.push('dbo.sp_BuscarProductosVenta');
      answer = stockResponse(quote, facts.quantity);
      route = 'SQL_STOCK';
    } else if (intent === 'IMAGE') {
      sqlTools.push('dbo.sp_BuscarImagenesProductoVenta');
      images = target && this.#deps.erp.getProductImages ? await this.#deps.erp.getProductImages(target,10).catch(()=>[]) : [];
      answer = imageResponse(images);
      if (!answer) answer = '';
      route = 'SQL_IMAGES';
    } else if (intent === 'POLICY' || intent === 'WARRANTY') {
      rag = this.#deps.rag.searchInstitutional ? await this.#deps.rag.searchInstitutional(input.message,4) : await this.#deps.rag.search(input.message,null);
      const fallback = institutionalResponse(rag) ?? noEvidenceResponse();
      writerResult = await safeWrite(this.#deps.llm,{message:input.message,intent,state:baseState,rag,deterministicAnswer:answerPlan,decision},fallback);
      answer = writerResult.answer;
      route = 'RAG_INSTITUTIONAL';
    } else if (intent === 'COMPARE') {
      const pair = unique([...(decision.comparisonProducts ?? []),...(baseState.comparisonProducts ?? []),...(decision.mentionedProducts ?? [])]).slice(0,2);
      if (pair.length < 2) answer = '¿Qué dos modelos quieres comparar?';
      else {
        const sections = productEvidenceSections({primary:'COMPARE',attributes:decision.attributes},{...baseState,comparisonProducts:pair});
        for (const name of pair) {
          const q = await this.#quote(name,initialCandidates);
          rag.push(...await this.#productEvidence(input.message,q,sections,4).catch(()=>[]));
        }
        const plan = `Compara ${pair[0]} y ${pair[1]} en 2 a 4 diferencias relevantes usando la misma cobertura. Explica el trade-off y recomienda solo si el contexto lo justifica. N+1: ${answerPlan ?? 'ayudar a decidir'}.`;
        writerResult = await safeWrite(this.#deps.llm,{message:input.message,intent,state:{...baseState,comparisonProducts:pair},rag,deterministicAnswer:plan,decision},rag.length?plan:noEvidenceResponse());
        answer = writerResult.answer;
      }
      route = 'RAG_COMPARISON';
    } else if (['PRODUCT_INFO','CAPABILITY','EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent)) {
      if (['RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent) && (!quote || intent !== 'CAPABILITY')) {
        const maxBudget = baseState.budget ?? (intent === 'HANDLE_PRICE_OBJECTION' && quote?.price != null ? Math.max(0,quote.price-0.01) : 99999999);
        const candidates = await this.#deps.erp.listProductsWithinBudget(maxBudget).catch(()=>[]);
        const ranks: CandidateRank[] = [];
        const sections = productEvidenceSections({primary:intent === 'HANDLE_PRICE_OBJECTION'?'OBJECTION':'RECOMMEND'},baseState);
        for (const q of candidates.slice(0,20)) {
          if (intent === 'HANDLE_PRICE_OBJECTION' && target && same(productName(q),target)) continue;
          const ev = await this.#productEvidence(input.message,q,sections,5).catch(()=>[]);
          ranks.push({quote:q,evidence:ev,score:ev.reduce((n,e)=>n+Number(e.score??0),0)});
        }
        ranks.sort((a,b)=>b.score-a.score || Number(a.quote.price??Infinity)-Number(b.quote.price??Infinity));
        if (ranks[0]) { quote=ranks[0].quote; recommendedProduct=productName(quote); rag=ranks[0].evidence; }
      } else if (quote) {
        const primary = intent === 'CAPABILITY' ? 'ATTRIBUTE' : semanticIntent(intent);
        const sections = productEvidenceSections({primary,attributes:decision.attributes},baseState);
        rag = await this.#productEvidence(input.message,quote,sections,8).catch(()=>[]);
      }
      const subject = recommendedProduct ?? productName(quote) ?? target;
      const plan = subject
        ? `Responde la necesidad actual usando solo evidencia verificada sobre ${subject}. Aplica criterio comercial y N+1=${answerPlan ?? 'NINGUNO'}. No repitas discovery conocido y no menciones precio si no fue solicitado.`
        : `Responde de forma breve. Si falta un dato que realmente cambia la recomendacion, pregunta solo ese dato. N+1=${answerPlan ?? 'NINGUNO'}.`;
      const fallback = subject ? `Puedo ayudarte a evaluar ${subject}, pero no voy a afirmar características que no tenga verificadas.` : '¿Qué aspecto es más importante para ti en el equipo?';
      writerResult = await safeWrite(this.#deps.llm,{message:input.message,intent,state:{...baseState,recommendedProduct},quote,rag,deterministicAnswer:plan,decision},fallback);
      answer = writerResult.answer;
      route = rag.length ? 'RAG_PRODUCT' : 'COMMERCIAL_REASONING';
    } else if (intent === 'PURCHASE' || intent === 'HUMAN') {
      const selected = decision.selectedProduct ?? target ?? baseState.selectedProduct ?? recommendedProduct ?? baseState.activeProduct ?? null;
      quote = await this.#quote(selected,initialCandidates);
      answer = purchaseResponse({...baseState,selectedProduct:selected,queryTarget:selected,recommendedProduct},quote);
      handoff = true;
      handoffReason = intent === 'HUMAN' ? 'SOLICITUD_HUMANO' : 'CONTINUAR_VENTA';
      answerPlan = 'ASSISTED_HANDOFF';
      route = 'ASSISTED_HANDOFF';
    } else if (intent === 'QUOTE') {
      answer = quoteRequestResponse({...baseState,queryTarget:target,recommendedProduct});
      if (target && facts.quantity) { handoff=true; handoffReason='COTIZACION_LISTA_PARA_ASESOR'; answerPlan='ASSISTED_HANDOFF'; }
      route = handoff ? 'ASSISTED_HANDOFF' : 'QUOTE_DISCOVERY';
    } else if (intent === 'BUDGET_CONSTRAINT' && baseState.budget != null) {
      answer = `Listo, tomo S/ ${baseState.budget} como tu tope.`;
      route = 'MEMORY_BUDGET';
    } else if (intent === 'GREETING') {
      answer = 'Hola, ¿qué equipo estás buscando o para qué lo necesitas?';
      route = 'GREETING';
    } else if (intent === 'CATEGORIES' && this.#deps.erp.listCategories) {
      const rows = await this.#deps.erp.listCategories().catch(()=>[]); answer = rows.slice(0,8).map(x=>x.name).join('\n') || noEvidenceResponse(); sqlTools.push('dbo.sp_ListarCategoriasVenta'); route='SQL_CATEGORIES';
    } else if (intent === 'SUBCATEGORIES' && this.#deps.erp.listSubcategories) {
      const rows = await this.#deps.erp.listSubcategories().catch(()=>[]); answer = rows.slice(0,8).map(x=>x.name).join('\n') || noEvidenceResponse(); sqlTools.push('dbo.sp_ListarSubcategoriasVenta'); route='SQL_SUBCATEGORIES';
    } else if (intent === 'CATALOG' && this.#deps.erp.listCatalog) {
      const rows = await this.#deps.erp.listCatalog({onlyWithStock:true}).catch(()=>[]); answer = rows.slice(0,6).map(x=>productName(x)).filter(Boolean).join('\n') || noEvidenceResponse(); sqlTools.push('dbo.sp_ListarCatalogoVenta'); route='SQL_CATALOG';
    } else {
      const fallback = 'Puedo ayudarte con productos, comparaciones, características, políticas o una compra.';
      writerResult = await safeWrite(this.#deps.llm,{message:input.message,intent,state:baseState,rag:[],deterministicAnswer:answerPlan,decision},fallback);
      answer = writerResult.answer;
      route = 'GENERAL_COMMERCIAL';
    }

    if (intent === 'IMAGE' && !answer) answer = noEvidenceResponse();

    const selectedProduct = decision.referenceType?.toUpperCase() === 'SELECTION'
      ? (decision.selectedProduct ?? baseState.selectedProduct ?? baseState.salientProduct ?? target)
      : (decision.selectedProduct ?? baseState.selectedProduct ?? null);
    const explicitSwitch = decision.explicitSwitch && Boolean(selectedProduct);
    let activeProduct = baseState.activeProduct ?? null;
    if (!activeProduct && quote) activeProduct = productName(quote);
    if (explicitSwitch && selectedProduct) activeProduct = selectedProduct;
    const salientProduct = productName(quote) ?? decision.targetProduct ?? recommendedProduct ?? baseState.salientProduct ?? activeProduct;
    const comparisonProducts = unique([...(decision.comparisonProducts ?? []),...(baseState.comparisonProducts ?? [])]).slice(0,2);
    const resolvedQuote = quote ?? await this.#quote(activeProduct,initialCandidates);

    const nextState = reduceState(previous,{
      activeProduct,
      activeProductId: resolvedQuote?.productRagId ?? previous.activeProductId ?? null,
      activeProductCode: resolvedQuote?.productCode ?? previous.activeProductCode ?? null,
      queryTarget:requestedUnknown ? null : (productName(quote) ?? decision.targetProduct ?? baseState.queryTarget ?? null),
      salientProduct,
      selectedProduct,
      recommendedProduct,
      comparisonProducts,
      explicitSwitch,
      budget:baseState.budget ?? null,
      lastIntent:intent,
      secondaryIntents:decision.secondaryIntents,
      lastRoute:route,
      lastSqlTools:sqlTools,
      requiresSql:decision.needsSql,
      requiresRag:decision.needsProductRag || decision.needsInstitutionalRag,
      spinFacts:facts.spinFacts,
      lastNba:answerPlan ?? null,
      customerType:facts.customerType,
      sector:facts.sector,
      useCase:facts.useCase,
      problem:facts.problem,
      priorities:facts.priorities,
      quantity:facts.quantity,
      invoiceRequired:facts.invoiceRequired,
      objection:budgetTurn.priceObjection ? 'precio' : facts.objection,
      purchaseSignal:facts.purchaseSignal || intent === 'PURCHASE',
      commercialStage:stage(intent,decision.commercialStage),
      commercialStrategy:strategy(intent),
      handoffActive:handoff,
      blockAutomaticReply:handoff,
      handoffReason,
      lastResolvedProductId:resolvedQuote?.productRagId ?? null,
      lastResolvedProductCode:resolvedQuote?.productCode ?? null,
      lastProductResolutionConfidence:decision.confidence,
      lastProductResolutionOrigin:planner ? 'GPT5_MINI_VALIDATED_SQL' : 'DETERMINISTIC_FALLBACK',
      lastUserMessage:input.message,
      lastAssistantMessage:answer,
    });

    await this.#deps.conversations.saveState(input.sessionId,nextState);
    await this.#deps.conversations.appendMessage(input.sessionId,'assistant',answer,{ messageId:input.messageId ?? null, requestId:input.messageId ?? null, conversationType:input.sessionId.startsWith('qa-')?'QA_LIVE':null, model:writerResult?.model ?? planner?.model ?? 'stech-hybrid-deterministic' });

    const plannerTelemetry = await this.#recordUsage(input.sessionId,turn,'SEMANTIC_PLAN',input.messageId ?? null,planner);
    const writerTelemetry = await this.#recordUsage(input.sessionId,turn,'COMMERCIAL_WRITE',input.messageId ?? null,writerResult?.llmResult ?? null);
    const telemetry = !plannerTelemetry.delivered ? plannerTelemetry : writerTelemetry;

    let automation: {delivered:boolean;error?:string} = {delivered:false};
    try {
      if (handoff) automation = await this.#deps.automation.publish({type:'handoff.requested',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{product:selectedProduct ?? activeProduct,reason:handoffReason,context:nextState}});
      else automation = await this.#deps.automation.publish({type:'conversation.turn.completed',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{intent,route,product:activeProduct,nextBestAction:answerPlan}});
    } catch (error) { automation={delivered:false,error:error instanceof Error?error.message:String(error)}; }

    return {
      sessionId:input.sessionId,
      answer,
      state:nextState,
      debug:{
        intent,
        secondaryIntents:decision.secondaryIntents,
        route,
        sqlTools,
        queryTarget:nextState.queryTarget ?? null,
        explicitSwitch,
        budget:nextState.budget ?? null,
        priceObjection:budgetTurn.priceObjection,
        erp:quote,
        images,
        ragSources:rag.map(x=>x.source),
        planner:plannerDebug(planner),
        llm:writerResult?.llmResult ? { model:writerResult.llmResult.model,inputTokens:writerResult.llmResult.usage.inputTokens,outputTokens:writerResult.llmResult.usage.outputTokens,totalTokens:writerResult.llmResult.usage.totalTokens,cachedInputTokens:writerResult.llmResult.usage.cachedInputTokens,durationMs:writerResult.llmResult.durationMs } : undefined,
        writerFallback:writerResult?.fallback,
        totalDurationMs:Math.max(0,Math.round(performance.now()-started)),
        telemetry,
        automation,
        ...(plannerFailure ? { plannerFallback:{delivered:false,error:plannerFailure} } : {}),
      } as any,
    };
  }
}

import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmProvider } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ConversationState, ProductImage, ProductQuote, RagEvidence } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { extractCommercialFacts } from './commercial/CommercialFacts.ts';
import { productEvidenceSections } from './commercial/ProductEvidencePolicy.ts';
import {
  ambiguousReferenceResponse,
  imageResponse,
  institutionalResponse,
  noEvidenceResponse,
  priceResponse,
  purchaseResponse,
  quoteRequestResponse,
  stockResponse,
} from './commercial/ResponsePolicy.ts';
import { resolveIntentPlan, type IntentPlan, type SemanticIntent } from './intent/IntentPlan.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
import { canonicalProductName, resolveReference } from './reference/ReferenceResolver.ts';
import { planRoute } from './router/RoutePlanner.ts';
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

type CandidateSearch = { rows: ProductQuote[]; names: string[]; unknownNamedProduct: boolean; error?: string };
type RankedRecommendation = { best: ProductQuote | null; evidence: RagEvidence[] };

const PRODUCT_SEARCH_INTENTS = new Set<SemanticIntent>(['PRODUCT_INFO','ATTRIBUTE','PRICE_AVAILABILITY','STOCK','IMAGES','COMPARE']);
const NO_LLM_INTENTS = new Set(['PRICE','STOCK','IMAGE','POLICY','WARRANTY','PURCHASE','HUMAN','QUOTE','BUDGET_CONSTRAINT','GREETING','CATALOG','CATEGORIES','SUBCATEGORIES','ORDER_STATUS']);

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function productName(quote: ProductQuote | null | undefined): string | null { return quote ? String(quote.shortName ?? quote.product).trim() || null : null; }
function sameProduct(a: string | null | undefined, b: string | null | undefined): boolean { return Boolean(a && b && fold(a) === fold(b)); }
function hasExplicitAlternativeRequest(message: string): boolean { return /\b(otra\s+opcion|otra\s+alternativa|alternativa|mas\s+economica|mas\s+barata|sin\s+perder)\b/.test(fold(message)); }
function looksLikeNamedModel(message: string): boolean {
  const words = message.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]+/g) ?? [];
  const stop = new Set(['para','tengo','tenemos','somos','necesito','necesitamos','hasta','maximo','máximo']);
  for (let i = 0; i < words.length - 1; i++) {
    const a = fold(words[i]);
    const b = words[i + 1];
    if (!stop.has(a) && /^[a-z]/.test(a) && /\d/.test(b) && b.length <= 16) return true;
  }
  return /\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/.test(message);
}
function stageFor(intent: string): string {
  if (['PURCHASE','HUMAN','QUOTE'].includes(intent)) return 'CIERRE_ASISTIDO';
  if (['HANDLE_PRICE_OBJECTION','OBJECTION'].includes(intent)) return 'OBJECION';
  if (['RECOMMEND','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(intent)) return 'EVALUACION';
  if (['PRICE','STOCK'].includes(intent)) return 'CONSIDERACION';
  if (['PRODUCT_INFO','CAPABILITY','EVALUATE_USE','BUDGET_CONSTRAINT'].includes(intent)) return 'DESCUBRIMIENTO';
  return 'INICIAL';
}
function strategyFor(intent: string): string {
  if (['PURCHASE','HUMAN','QUOTE'].includes(intent)) return 'CIERRE_PROGRESIVO';
  if (['HANDLE_PRICE_OBJECTION','OBJECTION'].includes(intent)) return 'LAER';
  if (intent === 'COMPARE') return 'ELECCION_GUIADA';
  if (['RECOMMEND','RECOMMEND_WITHIN_BUDGET','CAPABILITY','PRODUCT_INFO'].includes(intent)) return 'FAB';
  if (intent === 'EVALUATE_USE') return 'SPIN_MINIMO';
  return 'RESPUESTA_DIRECTA';
}
function legacyIntent(plan: IntentPlan, budget: ReturnType<typeof classifyBudgetTurn>): string {
  if (budget.budgetConstraint && ['OTHER','EVALUATE_USE'].includes(plan.primary)) return 'BUDGET_CONSTRAINT';
  if (plan.primary === 'PRICE_AVAILABILITY') return 'PRICE';
  if (plan.primary === 'IMAGES') return 'IMAGE';
  if (plan.primary === 'ATTRIBUTE') return 'CAPABILITY';
  if (plan.primary === 'OBJECTION') return 'HANDLE_PRICE_OBJECTION';
  if (plan.primary === 'RECOMMEND') return budget.effectiveBudget ? 'RECOMMEND_WITHIN_BUDGET' : 'RECOMMEND';
  if (plan.primary === 'EVALUATE_USE') return 'EVALUATE_USE';
  return plan.primary;
}

export class ConversationEngine {
  private readonly deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; }

  async #findMentionCandidates(message: string, plan: IntentPlan): Promise<CandidateSearch> {
    if (!this.deps.erp.searchProducts) return { rows: [], names: [], unknownNamedProduct: false };
    const modelish = looksLikeNamedModel(message);
    if (!modelish && !PRODUCT_SEARCH_INTENTS.has(plan.primary)) return { rows: [], names: [], unknownNamedProduct: false };
    try {
      const rows = await this.deps.erp.searchProducts(message, 8);
      const t = fold(message);
      const exact = rows.filter(row => [row.shortName,row.product,row.productCode,row.sku,row.partNumber,row.ean]
        .some(value => value && fold(value).length >= 3 && t.includes(fold(value))));
      const names = unique(exact.map(row => productName(row)).filter((x): x is string => Boolean(x)));
      const canDeclareUnknown = modelish && PRODUCT_SEARCH_INTENTS.has(plan.primary);
      return { rows: exact, names, unknownNamedProduct: canDeclareUnknown && exact.length === 0 };
    } catch (error) {
      return { rows: [], names: [], unknownNamedProduct: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async #identityFor(name: string | null, candidates: ProductQuote[] = []): Promise<ProductQuote | null> {
    if (!name) return null;
    const fromCandidates = candidates.find(row => sameProduct(productName(row), name));
    if (fromCandidates) return fromCandidates;
    try { return await this.deps.erp.getProductQuote(name); }
    catch { return null; }
  }

  async #productEvidence(query: string, quote: ProductQuote | null, fallbackName: string | null, sections: string[], limit = 8): Promise<RagEvidence[]> {
    if (quote?.productRagId && this.deps.rag.searchProduct) {
      return this.deps.rag.searchProduct(query, quote.productRagId, sections, limit);
    }
    if (fallbackName) return this.deps.rag.search(query, fallbackName);
    return [];
  }

  async #rankRecommendation(maxBudget: number, query: string, state: ConversationState): Promise<RankedRecommendation> {
    const options = await this.deps.erp.listProductsWithinBudget(maxBudget);
    const sections = productEvidenceSections({ primary:'RECOMMEND' }, state);
    let best: ProductQuote | null = null;
    let bestEvidence: RagEvidence[] = [];
    let bestScore = -1;
    let bestPrice = Number.POSITIVE_INFINITY;

    for (const candidate of options.slice(0, 40)) {
      const name = productName(candidate) ?? candidate.product;
      const evidence = await this.#productEvidence(query, candidate, name, sections, 6);
      if (!evidence.length) continue;
      const score = evidence.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
      const price = Number(candidate.price ?? Number.POSITIVE_INFINITY);
      if (score > bestScore || (score === bestScore && price < bestPrice)) {
        best = candidate;
        bestEvidence = evidence;
        bestScore = score;
        bestPrice = price;
      }
    }
    return { best, evidence: bestEvidence };
  }

  async processTurn(input: ChatInput): Promise<ChatTurnResult> {
    const turnStarted = performance.now();
    if (!input.sessionId?.trim()) throw new Error('sessionId is required');
    if (!input.message?.trim()) throw new Error('message is required');

    const previous = await this.deps.conversations.getState(input.sessionId);
    const turnNumber = (previous.turnCount ?? 0) + 1;
    await this.deps.conversations.appendMessage(input.sessionId, 'user', input.message, {
      messageId: input.messageId ?? null,
      requestId: input.messageId ?? null,
      conversationType: input.sessionId.startsWith('qa-') ? 'QA_LIVE' : null,
    });

    const commercial = extractCommercialFacts(input.message, previous);
    const budget = classifyBudgetTurn(input.message, { prevBudget: previous.budget ?? null });
    let intentPlan = resolveIntentPlan(input.message);

    if (budget.preferredIntent === 'RECOMMEND' && ['OTHER','EVALUATE_USE'].includes(intentPlan.primary)) {
      intentPlan = { ...intentPlan, primary:'RECOMMEND', secondary:unique([intentPlan.primary, ...intentPlan.secondary].filter(x => x !== 'RECOMMEND') as SemanticIntent[]) };
    }
    if (intentPlan.secondary.includes('OBJECTION') && /\botra\s+tienda\b|\bdescuento\b/.test(fold(input.message))) {
      intentPlan = { ...intentPlan, primary:'OBJECTION', secondary:unique([intentPlan.primary, ...intentPlan.secondary].filter(x => x !== 'OBJECTION') as SemanticIntent[]) };
    }
    if ((previous.comparisonProducts?.length ?? 0) >= 2 && ['ATTRIBUTE','RECOMMEND'].includes(intentPlan.primary) && /\b(los\s+dos|ambos|cual|cuál|mejor|conviene\s+mas|conviene\s+más)\b/.test(fold(input.message))) {
      intentPlan = { ...intentPlan, primary:'COMPARE', secondary:unique([intentPlan.primary, ...intentPlan.secondary].filter(x => x !== 'COMPARE') as SemanticIntent[]) };
    }

    const candidateSearch = await this.#findMentionCandidates(input.message, intentPlan);
    const reference = resolveReference(input.message, previous, {
      knownProducts: candidateSearch.names,
      unknownNamedProduct: candidateSearch.unknownNamedProduct,
    });

    let comparisonProducts = [...(previous.comparisonProducts ?? [])];
    if (reference.mentionedProducts.length >= 2) {
      comparisonProducts = reference.mentionedProducts.slice(0, 2);
    } else if (reference.mentionedProducts.length === 1 && previous.activeProduct && !sameProduct(previous.activeProduct, reference.mentionedProducts[0])) {
      if (intentPlan.primary === 'COMPARE' || /\b(tambien|también|entre|compar|versus|vs)\b/.test(fold(input.message))) {
        comparisonProducts = unique([previous.activeProduct, reference.mentionedProducts[0]]).slice(0, 2);
      }
    }

    const planningState: ConversationState = {
      ...previous,
      budget: budget.budget?.max ?? previous.budget ?? null,
      customerType: commercial.customerType,
      sector: commercial.sector,
      useCase: commercial.useCase,
      problem: commercial.problem,
      priorities: commercial.priorities,
      quantity: commercial.quantity,
      invoiceRequired: commercial.invoiceRequired,
      objection: budget.priceObjection ? 'precio' : commercial.objection,
      purchaseSignal: commercial.purchaseSignal,
      comparisonProducts,
    };

    const intent = legacyIntent(intentPlan, budget);
    const hasProduct = Boolean(reference.queryTarget ?? previous.activeProduct ?? previous.recommendedProduct);
    const route = planRoute(intentPlan, { hasProduct });

    let quote: ProductQuote | null = null;
    let identityQuote: ProductQuote | null = null;
    let recommendedProduct = canonicalProductName(previous.recommendedProduct) ?? previous.recommendedProduct ?? null;
    let deterministicAnswer: string | null = null;
    let rag: RagEvidence[] = [];
    let images: ProductImage[] = [];
    let forceNoLlm = reference.unknownNamedProduct;
    let handoffRequested = false;
    let handoffReason: string | null = null;

    if (reference.unknownNamedProduct) {
      deterministicAnswer = noEvidenceResponse();
    } else if (!reference.queryTarget && ['PRICE','STOCK'].includes(intent)) {
      deterministicAnswer = '¿Qué modelo quieres consultar?';
      forceNoLlm = true;
    } else if (!reference.queryTarget && intent === 'IMAGE') {
      deterministicAnswer = '¿De qué modelo quieres las imágenes?';
      forceNoLlm = true;
    } else if (intent === 'PRICE' || intent === 'STOCK') {
      identityQuote = quote = await this.#identityFor(reference.queryTarget, candidateSearch.rows);
      deterministicAnswer = intent === 'PRICE' ? priceResponse(quote) : stockResponse(quote, commercial.quantity);
      forceNoLlm = true;
    } else if (intent === 'IMAGE') {
      if (!reference.queryTarget) deterministicAnswer = '¿De qué modelo quieres las imágenes?';
      else {
        images = this.deps.erp.getProductImages ? await this.deps.erp.getProductImages(reference.queryTarget, 10).catch(() => []) : [];
        deterministicAnswer = imageResponse(images) || noEvidenceResponse();
      }
      forceNoLlm = true;
    } else if (intent === 'BUDGET_CONSTRAINT' && budget.effectiveBudget) {
      deterministicAnswer = `Listo, tomo S/ ${budget.effectiveBudget.max} como tu tope.`;
      forceNoLlm = true;
    } else if (intentPlan.primary === 'POLICY' || intentPlan.primary === 'WARRANTY') {
      rag = this.deps.rag.searchInstitutional ? await this.deps.rag.searchInstitutional(input.message, 3) : await this.deps.rag.search(input.message, null);
      deterministicAnswer = institutionalResponse(rag) ?? noEvidenceResponse();
      forceNoLlm = true;
    } else if (intentPlan.primary === 'PRODUCT_INFO' || intentPlan.primary === 'ATTRIBUTE') {
      if (!reference.queryTarget) {
        deterministicAnswer = '¿Qué modelo quieres revisar?';
        forceNoLlm = true;
      } else {
        identityQuote = await this.#identityFor(reference.queryTarget, candidateSearch.rows);
        const sections = productEvidenceSections(intentPlan, planningState);
        rag = await this.#productEvidence(input.message, identityQuote, reference.queryTarget, sections, 7);
        deterministicAnswer = rag.length
          ? intentPlan.primary === 'PRODUCT_INFO'
            ? 'Da una ficha breve con 5 a 7 puntos útiles. No menciones precio ni stock salvo que el cliente lo haya pedido.'
            : 'Responde el atributo solicitado, explica el efecto práctico y relaciónalo con la necesidad conocida si aplica.'
          : noEvidenceResponse();
        if (!rag.length) forceNoLlm = true;
      }
    } else if (intentPlan.primary === 'COMPARE') {
      const pair = comparisonProducts.length >= 2 ? comparisonProducts : reference.mentionedProducts;
      if (pair.length < 2) {
        deterministicAnswer = '¿Qué dos modelos quieres comparar?';
        forceNoLlm = true;
      } else {
        const sections = productEvidenceSections({ primary:'COMPARE', attributes:intentPlan.attributes }, planningState);
        for (const name of pair.slice(0, 2)) {
          const product = await this.#identityFor(name, candidateSearch.rows);
          rag.push(...await this.#productEvidence(input.message, product, name, sections, 4));
        }
        deterministicAnswer = rag.length
          ? `Compara ${pair[0]} y ${pair[1]} de forma simétrica en 2 a 4 diferencias relevantes; explica el trade-off y concluye según la necesidad conocida. No cambies de producto por una simple mención.`
          : noEvidenceResponse();
        if (!rag.length) forceNoLlm = true;
      }
    } else if (intentPlan.primary === 'EVALUATE_USE') {
      const priorities = commercial.priorities ?? [];
      if (planningState.budget == null) {
        const focus = priorities.length ? priorities.slice(0, 2).join(' y ') : 'lo que realmente necesitas';
        deterministicAnswer = `Para ese uso priorizaría ${focus}. ¿Qué presupuesto máximo manejas?`;
        forceNoLlm = true;
      } else {
        const query = `${input.message} ${priorities.join(' ')} ${commercial.problem ?? ''} ${commercial.useCase ?? ''}`;
        const ranked = await this.#rankRecommendation(planningState.budget, query, planningState);
        recommendedProduct = productName(ranked.best) ?? null;
        identityQuote = ranked.best;
        rag = ranked.evidence;
        deterministicAnswer = recommendedProduct ? `Candidato verificado por necesidad y presupuesto: ${recommendedProduct}. Explica por qué encaja sin mencionar precio salvo que lo pidan.` : noEvidenceResponse();
        if (!recommendedProduct) forceNoLlm = true;
      }
    } else if (intentPlan.primary === 'RECOMMEND') {
      const hasNeed = Boolean(commercial.problem || commercial.useCase || commercial.sector || (commercial.priorities?.length ?? 0) || previous.problem || previous.useCase || previous.sector || (previous.priorities?.length ?? 0));
      if (!hasNeed) {
        deterministicAnswer = 'Para recomendarte bien, dime solo qué priorizas más: resistencia, batería, cámara o rendimiento.';
        forceNoLlm = true;
      } else {
        const maxBudget = budget.effectiveBudget?.max ?? previous.budget ?? 99999999;
        const query = `${input.message} ${(commercial.priorities ?? previous.priorities ?? []).join(' ')} ${commercial.problem ?? previous.problem ?? ''} ${commercial.useCase ?? previous.useCase ?? ''}`;
        const ranked = await this.#rankRecommendation(maxBudget, query, planningState);
        recommendedProduct = productName(ranked.best) ?? null;
        identityQuote = ranked.best;
        rag = ranked.evidence;
        deterministicAnswer = recommendedProduct
          ? `Candidato verificado${budget.effectiveBudget || previous.budget ? ' dentro del presupuesto' : ''}: ${recommendedProduct}. Explica el encaje con la necesidad y el principal trade-off; no menciones precio si no lo pidieron.`
          : noEvidenceResponse();
        if (!recommendedProduct) forceNoLlm = true;
      }
    } else if (intentPlan.primary === 'OBJECTION') {
      const target = reference.queryTarget ?? previous.selectedProduct ?? previous.recommendedProduct ?? previous.activeProduct ?? null;
      identityQuote = await this.#identityFor(target, candidateSearch.rows);
      if (hasExplicitAlternativeRequest(input.message)) {
        const limit = identityQuote?.price != null ? Math.max(0, identityQuote.price - 0.01) : (planningState.budget ?? 99999999);
        const query = `${(commercial.priorities ?? previous.priorities ?? []).join(' ')} ${commercial.problem ?? previous.problem ?? ''} alternativa más económica`;
        const ranked = await this.#rankRecommendation(limit, query, planningState);
        const alternative = productName(ranked.best);
        if (alternative && !sameProduct(alternative, target)) {
          recommendedProduct = alternative;
          identityQuote = ranked.best;
          rag = ranked.evidence;
          deterministicAnswer = `Alternativa verificada: ${alternative}. Resuelve la objeción comparando solo lo relevante y sin inventar descuentos.`;
        }
      }
      if (!rag.length && target) {
        const sections = productEvidenceSections({ primary:'OBJECTION' }, planningState);
        rag = await this.#productEvidence(input.message, identityQuote, target, sections, 4);
      }
      deterministicAnswer ??= 'Resuelve la objeción con empatía pragmática. No cambies la recomendación automáticamente por una oferta externa y no prometas igualar precios.';
    } else if (intentPlan.primary === 'PURCHASE' || intentPlan.primary === 'HUMAN') {
      const target = reference.selectedProduct ?? reference.queryTarget ?? previous.selectedProduct ?? previous.recommendedProduct ?? previous.activeProduct ?? null;
      if (target) identityQuote = quote = await this.#identityFor(target, candidateSearch.rows);
      if (intentPlan.primary === 'HUMAN') {
        deterministicAnswer = target ? `Listo, te paso con un asesor para continuar contigo sobre ${target}.` : 'Listo, te paso con un asesor para que continúe contigo.';
        handoffRequested = true;
        handoffReason = 'SOLICITUD_HUMANO';
      } else {
        deterministicAnswer = purchaseResponse({ ...previous, selectedProduct:target, queryTarget:target }, quote);
        if (target && !(quote?.stock != null && quote.stock <= 0)) {
          handoffRequested = true;
          handoffReason = 'CONTINUAR_VENTA';
        }
      }
      forceNoLlm = true;
    } else if (intentPlan.primary === 'QUOTE') {
      const target = reference.queryTarget ?? previous.selectedProduct ?? previous.recommendedProduct ?? previous.activeProduct ?? null;
      deterministicAnswer = quoteRequestResponse({ ...planningState, queryTarget:target, selectedProduct:previous.selectedProduct ?? target });
      if (target && (commercial.quantity ?? previous.quantity ?? 0) > 0) {
        handoffRequested = true;
        handoffReason = 'COTIZACION';
      }
      forceNoLlm = true;
    } else if (intentPlan.primary === 'CATEGORIES') {
      const rows = this.deps.erp.listCategories ? await this.deps.erp.listCategories().catch(() => []) : [];
      deterministicAnswer = rows.length ? rows.slice(0, 12).map(x => x.name).join('\n') : noEvidenceResponse();
      forceNoLlm = true;
    } else if (intentPlan.primary === 'SUBCATEGORIES') {
      const rows = this.deps.erp.listSubcategories ? await this.deps.erp.listSubcategories(null).catch(() => []) : [];
      deterministicAnswer = rows.length ? rows.slice(0, 12).map(x => x.name).join('\n') : noEvidenceResponse();
      forceNoLlm = true;
    } else if (intentPlan.primary === 'CATALOG') {
      const rows = this.deps.erp.listCatalog ? await this.deps.erp.listCatalog({}).catch(() => []) : [];
      deterministicAnswer = rows.length ? rows.slice(0, 8).map(x => productName(x) ?? x.product).join('\n') : noEvidenceResponse();
      forceNoLlm = true;
    } else if (intentPlan.primary === 'ORDER_STATUS') {
      deterministicAnswer = 'Para consultar tu pedido necesito el número de pedido y el correo exacto usado en la compra.';
      forceNoLlm = true;
    } else if (intentPlan.primary === 'GREETING') {
      deterministicAnswer = 'Hola 👋 ¿Qué equipo estás buscando?';
      forceNoLlm = true;
    } else if (!reference.queryTarget && candidateSearch.error) {
      deterministicAnswer = 'No pude verificar el producto en este momento. Te puedo pasar con un asesor para continuar.';
      handoffRequested = true;
      handoffReason = 'FALLO_FUENTE_PRODUCTO';
      forceNoLlm = true;
    }

    if (reference.explicitSwitch && reference.selectedProduct) recommendedProduct = reference.selectedProduct;
    const finalSelectedProduct = intentPlan.primary === 'PURCHASE'
      ? (reference.selectedProduct ?? reference.queryTarget ?? previous.selectedProduct ?? recommendedProduct ?? previous.activeProduct ?? null)
      : (reference.selectedProduct ?? previous.selectedProduct ?? null);
    const finalSalientProduct = recommendedProduct && ['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent)
      ? recommendedProduct
      : (reference.queryTarget ?? previous.salientProduct ?? null);

    const resolvedName = productName(identityQuote);
    const nextActiveProduct = reference.nextActiveProduct;
    const activeProductId = nextActiveProduct && identityQuote && sameProduct(nextActiveProduct, resolvedName)
      ? identityQuote.productRagId ?? null
      : sameProduct(nextActiveProduct, previous.activeProduct) ? previous.activeProductId ?? null : null;
    const activeProductCode = nextActiveProduct && identityQuote && sameProduct(nextActiveProduct, resolvedName)
      ? identityQuote.productCode ?? null
      : sameProduct(nextActiveProduct, previous.activeProduct) ? previous.activeProductCode ?? null : null;

    let state = reduceState(previous, {
      activeProduct: nextActiveProduct,
      activeProductId,
      activeProductCode,
      salientProduct: finalSalientProduct,
      selectedProduct: finalSelectedProduct,
      recommendedProduct,
      comparisonProducts,
      queryTarget: reference.queryTarget,
      explicitSwitch: reference.explicitSwitch,
      budget: budget.budget?.max ?? previous.budget ?? null,
      lastIntent: intent,
      secondaryIntents: intentPlan.secondary,
      lastRoute: route.route,
      lastSqlTools: route.sqlTools,
      requiresSql: route.sqlTools.length > 0 || ['PRICE','STOCK','IMAGE'].includes(intent),
      requiresRag: rag.length > 0 || route.needsProductRag || route.needsInstitutionalRag,
      customerType: commercial.customerType,
      sector: commercial.sector,
      useCase: commercial.useCase,
      problem: commercial.problem,
      priorities: commercial.priorities,
      quantity: commercial.quantity,
      invoiceRequired: commercial.invoiceRequired,
      objection: budget.priceObjection ? 'precio' : commercial.objection,
      purchaseSignal: intentPlan.primary === 'PURCHASE' ? true : commercial.purchaseSignal,
      commercialStage: stageFor(intent),
      commercialStrategy: strategyFor(intent),
      handoffActive: handoffRequested,
      blockAutomaticReply: handoffRequested,
      handoffReason,
      lastResolvedProductId: identityQuote?.productRagId ?? null,
      lastResolvedProductCode: identityQuote?.productCode ?? null,
      lastProductResolutionConfidence: identityQuote ? (identityQuote.requiresClarification === true ? 0.6 : 1) : null,
      lastProductResolutionOrigin: identityQuote ? identityQuote.source : null,
      spinFacts: commercial.spinFacts,
      lastUserMessage: input.message,
      spinResidual: budget.budgetConstraint ? budget.spinResidual : undefined,
    });
    state = { ...state, lastNba: nextBestAction(intent === 'CAPABILITY' ? 'ATTRIBUTE' : intent, state) };

    let answer = deterministicAnswer ?? '';
    let llmDebug: ChatTurnResult['debug']['llm'];
    let telemetry: { delivered: boolean; error?: string } | undefined;
    let writerFallback: { delivered: boolean; error?: string } | undefined;
    let actualModel = 'deterministic-v0.4';

    const shouldUseLlm = !forceNoLlm && !NO_LLM_INTENTS.has(intent) && rag.length > 0;
    if (shouldUseLlm) {
      const guarded = await safeWrite(this.deps.llm, { message: input.message, intent, state, quote, rag, deterministicAnswer }, deterministicAnswer ?? noEvidenceResponse());
      answer = guarded.answer;
      actualModel = guarded.model;
      writerFallback = guarded.fallback;
      const llmResult = guarded.llmResult;
      if (llmResult) {
        llmDebug = {
          model: llmResult.model,
          inputTokens: llmResult.usage.inputTokens,
          outputTokens: llmResult.usage.outputTokens,
          totalTokens: llmResult.usage.totalTokens,
          cachedInputTokens: llmResult.usage.cachedInputTokens,
          durationMs: llmResult.durationMs,
        };
        telemetry = { delivered: true };
        try {
          await this.deps.telemetry.recordLlmUsage({
            sessionId: input.sessionId,
            turn: turnNumber,
            route: route.route,
            model: llmResult.model,
            inputTokens: llmResult.usage.inputTokens,
            outputTokens: llmResult.usage.outputTokens,
            cachedTokens: llmResult.usage.cachedInputTokens,
            durationMs: llmResult.durationMs,
            messageId: input.messageId ?? null,
          });
        } catch (error) {
          telemetry = { delivered: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    }

    if (!answer) answer = noEvidenceResponse();
    const finalState = { ...state, lastAssistantMessage: answer };
    await this.deps.conversations.saveState(input.sessionId, finalState);
    await this.deps.conversations.appendMessage(input.sessionId, 'assistant', answer, { model: actualModel });

    const automation = await this.deps.automation.publish({
      type: handoffRequested ? 'handoff.requested' : 'conversation.turn.completed',
      occurredAt: new Date().toISOString(),
      sessionId: input.sessionId,
      payload: { messageId: input.messageId ?? null, intent, route:route.route, queryTarget: reference.queryTarget, state: finalState, answer },
    });

    return {
      sessionId: input.sessionId,
      answer,
      state: finalState,
      debug: {
        intent,
        secondaryIntents: intentPlan.secondary,
        route: route.route,
        sqlTools: route.sqlTools,
        queryTarget: canonicalProductName(reference.queryTarget),
        explicitSwitch: reference.explicitSwitch,
        budget: finalState.budget ?? null,
        priceObjection: budget.priceObjection,
        erp: quote ?? identityQuote,
        images,
        ragSources: rag.map(x => x.source),
        llm: llmDebug,
        writerFallback,
        totalDurationMs: Math.max(0, Math.round(performance.now() - turnStarted)),
        telemetry,
        automation,
      },
    };
  }
}

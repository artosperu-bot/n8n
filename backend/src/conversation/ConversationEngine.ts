import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmProvider } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ProductImage, ProductQuote, RagEvidence } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { extractCommercialFacts } from './commercial/CommercialFacts.ts';
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
import { resolveIntent } from './intent/IntentResolver.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
import { canonicalProductName, resolveReference } from './reference/ReferenceResolver.ts';
import { reduceState } from './state/StateReducer.ts';

type Dependencies = {
  conversations: ConversationRepository;
  telemetry: TelemetryRepository;
  erp: ErpRepository;
  rag: RagRepository;
  llm: LlmProvider;
  automation: AutomationBus;
};

const DIRECT_INTENTS = new Set(['PRICE', 'STOCK', 'PURCHASE', 'IMAGE', 'COMPARE', 'CAPABILITY', 'WARRANTY', 'POLICY', 'QUOTE']);
const DETERMINISTIC_INTENTS = new Set(['PRICE', 'STOCK', 'IMAGE', 'POLICY', 'WARRANTY', 'PURCHASE', 'QUOTE', 'BUDGET_CONSTRAINT', 'GREETING']);
const REFERENT_REASONS = new Set(['SELECTION_REFERENT', 'RECOMMENDED_REFERENT', 'COMPARISON_ALTERNATIVE']);

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function canonical(value: string | null | undefined): string | null {
  return canonicalProductName(value) ?? (value ? String(value) : null);
}

export class ConversationEngine {
  private readonly deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; }

  async #rankRecommendation(maxBudget: number, query: string): Promise<{ best: ProductQuote | null; evidence: RagEvidence[] }> {
    const options = await this.deps.erp.listProductsWithinBudget(maxBudget);
    let best: ProductQuote | null = null;
    let bestEvidence: RagEvidence[] = [];
    let bestScore = -1;

    for (const candidate of options.slice(-8)) {
      const name = canonical(candidate.product) ?? candidate.product;
      const evidence = await this.deps.rag.search(query, name);
      const score = evidence.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
      const currentPrice = Number(candidate.price ?? 0);
      const bestPrice = Number(best?.price ?? -1);
      if (score > bestScore || (score === bestScore && currentPrice > bestPrice)) {
        best = candidate;
        bestEvidence = evidence;
        bestScore = score;
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
    const baseIntent = resolveIntent(input.message, { staleIntent: previous.lastIntent ?? null });

    let intent: string;
    if (budget.priceObjection && (baseIntent === 'OTHER' || baseIntent === 'RECOMMEND')) {
      intent = 'HANDLE_PRICE_OBJECTION';
    } else if (DIRECT_INTENTS.has(baseIntent)) {
      intent = baseIntent;
    } else {
      intent = budget.preferredIntent ?? baseIntent;
    }
    if (baseIntent === 'RECOMMEND' && !budget.priceObjection) {
      intent = budget.effectiveBudget ? 'RECOMMEND_WITHIN_BUDGET' : 'RECOMMEND';
    }
    if (
      baseIntent === 'CAPABILITY' &&
      (previous.comparisonProducts?.length ?? 0) >= 2 &&
      /\b(los\s+dos|ambos|cual\s+de\s+los\s+dos|conviene\s+mas)\b/.test(input.message.toLocaleLowerCase('es'))
    ) {
      intent = 'COMPARE';
    }

    const reference = resolveReference(input.message, previous);
    const unresolvedReference = !reference.queryTarget && REFERENT_REASONS.has(reference.reason);

    let comparisonProducts = [...(previous.comparisonProducts ?? [])];
    if (reference.mentionedProducts.length >= 2) {
      comparisonProducts = reference.mentionedProducts.slice(0, 2);
    } else if (
      intent === 'COMPARE' &&
      reference.mentionedProducts.length === 1 &&
      previous.activeProduct &&
      previous.activeProduct !== reference.mentionedProducts[0]
    ) {
      comparisonProducts = unique([previous.activeProduct, reference.mentionedProducts[0]]).slice(0, 2);
    }

    let quote: ProductQuote | null = null;
    let recommendedProduct = canonical(previous.recommendedProduct) ?? null;
    let deterministicAnswer: string | null = null;
    let rag: RagEvidence[] = [];
    let images: ProductImage[] = [];
    let forceNoLlm = reference.unknownNamedProduct || unresolvedReference;

    if (reference.unknownNamedProduct) {
      deterministicAnswer = noEvidenceResponse();
    } else if (unresolvedReference) {
      deterministicAnswer = ambiguousReferenceResponse();
    } else if ((intent === 'PRICE' || intent === 'STOCK') && !reference.queryTarget) {
      deterministicAnswer = '¿Qué modelo quieres consultar?';
      forceNoLlm = true;
    } else if (intent === 'IMAGE' && !reference.queryTarget) {
      deterministicAnswer = '¿De qué modelo quieres las imágenes?';
      forceNoLlm = true;
    } else if ((intent === 'CAPABILITY' || intent === 'WARRANTY') && !reference.queryTarget) {
      deterministicAnswer = '¿Qué modelo quieres revisar?';
      forceNoLlm = true;
    } else if ((intent === 'PRICE' || intent === 'STOCK') && reference.queryTarget) {
      quote = await this.deps.erp.getProductQuote(reference.queryTarget);
      deterministicAnswer = intent === 'PRICE'
        ? priceResponse(quote)
        : stockResponse(quote, commercial.quantity);
    } else if (intent === 'IMAGE' && reference.queryTarget) {
      images = this.deps.erp.getProductImages
        ? await this.deps.erp.getProductImages(reference.queryTarget, 10)
        : [];
      deterministicAnswer = imageResponse(images) || noEvidenceResponse();
    } else if (intent === 'BUDGET_CONSTRAINT' && budget.effectiveBudget) {
      deterministicAnswer = `Listo, tomo S/ ${budget.effectiveBudget.max} como tu tope.`;
    } else if (intent === 'RECOMMEND' || intent === 'RECOMMEND_WITHIN_BUDGET') {
      const hasNeed = Boolean(commercial.problem || commercial.useCase || commercial.sector || (commercial.priorities?.length ?? 0));
      if (!hasNeed) {
        deterministicAnswer = 'Para recomendarte bien, ¿qué priorizas más: resistencia, batería, cámara o rendimiento?';
        forceNoLlm = true;
      } else {
        const maxBudget = budget.effectiveBudget?.max ?? 99999999;
        const needQuery = `${input.message} ${(commercial.priorities ?? []).join(' ')} ${commercial.problem ?? ''} ${commercial.useCase ?? ''}`;
        const ranked = await this.#rankRecommendation(maxBudget, needQuery);
        recommendedProduct = canonical(ranked.best?.product) ?? ranked.best?.product ?? null;
        rag = ranked.evidence;
        deterministicAnswer = recommendedProduct
          ? `Candidato verificado${budget.effectiveBudget ? ' dentro del presupuesto' : ''}: ${recommendedProduct}.`
          : budget.effectiveBudget
            ? 'No encontré una opción con precio confirmado dentro de ese presupuesto.'
            : noEvidenceResponse();
        if (!recommendedProduct) forceNoLlm = true;
      }
    } else if (intent === 'HANDLE_PRICE_OBJECTION') {
      const target = canonical(reference.queryTarget ?? previous.recommendedProduct ?? previous.activeProduct);
      if (target) {
        quote = await this.deps.erp.getProductQuote(target);
        const alternativeLimit = quote?.price != null ? Math.max(0, quote.price - 0.01) : (budget.effectiveBudget?.max ?? null);
        if (alternativeLimit != null && alternativeLimit > 0) {
          const needQuery = `${(commercial.priorities ?? []).join(' ')} ${commercial.problem ?? ''} alternativa más económica`;
          const ranked = await this.#rankRecommendation(alternativeLimit, needQuery);
          const alternative = canonical(ranked.best?.product) ?? ranked.best?.product ?? null;
          if (alternative && alternative !== target) {
            recommendedProduct = alternative;
            rag = ranked.evidence;
            deterministicAnswer = `Objeción de precio. Alternativa verificada: ${alternative}.`;
          }
        }
        if (!rag.length) rag = await this.deps.rag.search(input.message, target);
      }
      deterministicAnswer ??= budget.effectiveBudget
        ? `El cliente percibe el precio como alto y mantiene un tope de S/ ${budget.effectiveBudget.max}. No inventes precios ni presupuesto.`
        : 'El cliente percibe el precio como alto. No asumas un presupuesto que no dio.';
    } else if (intent === 'PURCHASE') {
      const target = canonical(reference.queryTarget ?? previous.recommendedProduct ?? previous.activeProduct);
      if (target) quote = await this.deps.erp.getProductQuote(target);
      deterministicAnswer = purchaseResponse({ ...previous, queryTarget: target }, quote);
    } else if (intent === 'QUOTE') {
      deterministicAnswer = quoteRequestResponse({
        ...previous,
        queryTarget: canonical(reference.queryTarget),
        quantity: commercial.quantity,
      });
    } else if (intent === 'GREETING') {
      deterministicAnswer = 'Hola 👋 ¿Qué equipo estás buscando?';
    }

    if (!forceNoLlm && (intent === 'POLICY' || intent === 'WARRANTY')) {
      rag = await this.deps.rag.search(input.message, reference.queryTarget);
      deterministicAnswer = institutionalResponse(rag) ?? noEvidenceResponse();
    } else if (!forceNoLlm && intent === 'CAPABILITY') {
      rag = await this.deps.rag.search(input.message, reference.queryTarget);
      if (!rag.length) {
        deterministicAnswer = noEvidenceResponse();
        forceNoLlm = true;
      }
    } else if (!forceNoLlm && intent === 'COMPARE') {
      const pair = comparisonProducts.length >= 2 ? comparisonProducts : reference.mentionedProducts;
      if (pair.length < 2) {
        deterministicAnswer = '¿Qué dos modelos quieres comparar?';
        forceNoLlm = true;
      } else {
        const compareQuery = `${input.message} ${(commercial.priorities ?? []).join(' ')} ${commercial.problem ?? ''}`;
        for (const product of pair.slice(0, 2)) {
          rag.push(...(await this.deps.rag.search(compareQuery, product)).slice(0, 2));
        }
        if (!rag.length) {
          deterministicAnswer = noEvidenceResponse();
          forceNoLlm = true;
        }
      }
    }

    const state = reduceState(previous, {
      activeProduct: reference.nextActiveProduct,
      salientProduct: canonical(reference.queryTarget),
      recommendedProduct,
      comparisonProducts,
      queryTarget: canonical(reference.queryTarget),
      explicitSwitch: reference.explicitSwitch,
      budget: budget.budget?.max ?? previous.budget ?? null,
      lastIntent: intent,
      lastNba: nextBestAction(intent),
      customerType: commercial.customerType,
      sector: commercial.sector,
      useCase: commercial.useCase,
      problem: commercial.problem,
      priorities: commercial.priorities,
      quantity: commercial.quantity,
      invoiceRequired: commercial.invoiceRequired,
      objection: budget.priceObjection ? 'precio' : commercial.objection,
      purchaseSignal: intent === 'PURCHASE' ? true : commercial.purchaseSignal,
      spinFacts: commercial.spinFacts,
      lastUserMessage: input.message,
      spinResidual: budget.budgetConstraint ? budget.spinResidual : undefined,
    });

    let answer = deterministicAnswer ?? '';
    let llmDebug: ChatTurnResult['debug']['llm'];
    let telemetry: { delivered: boolean; error?: string } | undefined;
    let actualModel = 'deterministic-v0.3';

    const shouldUseLlm = !forceNoLlm && !DETERMINISTIC_INTENTS.has(intent);
    if (shouldUseLlm) {
      const llmResult = await this.deps.llm.write({ message: input.message, intent, state, quote, rag, deterministicAnswer });
      answer = llmResult.text;
      actualModel = llmResult.model;
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
          route: intent,
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

    if (!answer) answer = noEvidenceResponse();
    const finalState = { ...state, lastAssistantMessage: answer };
    await this.deps.conversations.saveState(input.sessionId, finalState);
    await this.deps.conversations.appendMessage(input.sessionId, 'assistant', answer, { model: actualModel });

    const automation = await this.deps.automation.publish({
      type: intent === 'PURCHASE' ? 'purchase.intent' : 'conversation.turn.completed',
      occurredAt: new Date().toISOString(),
      sessionId: input.sessionId,
      payload: { messageId: input.messageId ?? null, intent, queryTarget: reference.queryTarget, state: finalState, answer },
    });

    return {
      sessionId: input.sessionId,
      answer,
      state: finalState,
      debug: {
        intent,
        queryTarget: canonical(reference.queryTarget),
        explicitSwitch: reference.explicitSwitch,
        budget: finalState.budget ?? null,
        priceObjection: budget.priceObjection,
        erp: quote,
        images,
        ragSources: rag.map(x => x.source),
        llm: llmDebug,
        totalDurationMs: Math.max(0, Math.round(performance.now() - turnStarted)),
        telemetry,
        automation,
      },
    };
  }
}

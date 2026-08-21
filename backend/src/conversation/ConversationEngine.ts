import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmProvider } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ProductQuote } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { resolveIntent } from './intent/IntentResolver.ts';
import { resolveReference } from './reference/ReferenceResolver.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
import { reduceState } from './state/StateReducer.ts';

type Dependencies = {
  conversations: ConversationRepository;
  telemetry: TelemetryRepository;
  erp: ErpRepository;
  rag: RagRepository;
  llm: LlmProvider;
  automation: AutomationBus;
};

function money(value: number | null): string { return value == null ? 'UNKNOWN' : `S/ ${value}`; }
function quoteAnswer(intent: string, quote: ProductQuote | null): string | null {
  if (!quote) return null;
  const test = quote.source === 'FAKE_TEST_DATA' ? '[MODO PRUEBA — DATOS SIMULADOS] ' : '';
  if (intent === 'PRICE') return `${test}${quote.product}: ${money(quote.price)}.`;
  if (intent === 'STOCK') return `${test}${quote.product}: stock ${quote.stock == null ? 'UNKNOWN' : `${quote.stock} unidad(es)`}.`;
  return null;
}

export class ConversationEngine {
  private readonly deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; }

  async processTurn(input: ChatInput): Promise<ChatTurnResult> {
    const turnStarted = performance.now();
    if (!input.sessionId?.trim()) throw new Error('sessionId is required');
    if (!input.message?.trim()) throw new Error('message is required');

    const previous = await this.deps.conversations.getState(input.sessionId);
    const turnNumber = (previous.turnCount ?? 0) + 1;
    const requestId = input.messageId?.includes(':') ? input.messageId.split(':')[0] : null;
    await this.deps.conversations.appendMessage(input.sessionId, 'user', input.message, {
      messageId: input.messageId ?? null,
      requestId,
      conversationType: input.sessionId.startsWith('qa-') ? 'QA_LIVE' : null,
    });

    const budget = classifyBudgetTurn(input.message, { prevBudget: previous.budget ?? null });
    const baseIntent = resolveIntent(input.message, { staleIntent: previous.lastIntent ?? null });
    const intent = budget.preferredIntent ?? baseIntent;
    const reference = resolveReference(input.message, previous);

    let quote: ProductQuote | null = null;
    let deterministicAnswer: string | null = null;
    let recommendedProduct = previous.recommendedProduct ?? null;

    if ((intent === 'PRICE' || intent === 'STOCK') && reference.queryTarget) {
      quote = await this.deps.erp.getProductQuote(reference.queryTarget);
      deterministicAnswer = quoteAnswer(intent, quote) ?? `No tengo un dato autoritativo disponible para ${reference.queryTarget}.`;
    } else if (intent === 'BUDGET_CONSTRAINT' && budget.effectiveBudget) {
      deterministicAnswer = `He registrado un presupuesto máximo de ${money(budget.effectiveBudget.max)}.`;
    } else if (intent === 'HANDLE_PRICE_OBJECTION') {
      deterministicAnswer = budget.effectiveBudget
        ? `El precio te resulta alto. Mantengo tu tope de ${money(budget.effectiveBudget.max)} para buscar una alternativa que sí encaje.`
        : 'El precio te resulta alto. Puedo buscar una alternativa sin inventar un presupuesto.';
    } else if (intent === 'RECOMMEND_WITHIN_BUDGET' && budget.effectiveBudget) {
      const options = await this.deps.erp.listProductsWithinBudget(budget.effectiveBudget.max);
      const best = options[0] ?? null;
      recommendedProduct = best?.product ?? null;
      deterministicAnswer = best
        ? `${best.source === 'FAKE_TEST_DATA' ? '[MODO PRUEBA — DATOS SIMULADOS] ' : ''}Dentro de ${money(budget.effectiveBudget.max)}, ${best.product} figura en ${money(best.price)}.`
        : `No encontré una opción con precio autoritativo dentro de ${money(budget.effectiveBudget.max)}.`;
    } else if (intent === 'PURCHASE') {
      deterministicAnswer = `Perfecto. Mantengo ${reference.queryTarget ?? 'el producto seleccionado'} como objetivo de compra y puedo continuar con el proceso.`;
    } else if (intent === 'GREETING') {
      deterministicAnswer = reference.queryTarget ? `Hola. Tengo ${reference.queryTarget} como producto de consulta.` : 'Hola. ¿Qué producto estás evaluando?';
    }

    const rag = (intent === 'CAPABILITY' || intent === 'WARRANTY')
      ? await this.deps.rag.search(input.message, reference.queryTarget)
      : [];

    if (!deterministicAnswer && rag.length) deterministicAnswer = rag[0].text;
    if (!deterministicAnswer && reference.queryTarget) deterministicAnswer = `Mantengo ${reference.queryTarget} como producto de consulta.`;

    const state = reduceState(previous, {
      activeProduct: reference.nextActiveProduct,
      recommendedProduct,
      queryTarget: reference.queryTarget,
      explicitSwitch: reference.explicitSwitch,
      budget: budget.budget?.max ?? previous.budget ?? null,
      lastIntent: intent,
      lastNba: nextBestAction(intent),
      spinResidual: budget.budgetConstraint ? budget.spinResidual : undefined
    });

    const llmResult = await this.deps.llm.write({ message: input.message, intent, state, quote, rag, deterministicAnswer });
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

    await this.deps.conversations.saveState(input.sessionId, state);
    await this.deps.conversations.appendMessage(input.sessionId, 'assistant', llmResult.text, { model: llmResult.model });

    const automation = await this.deps.automation.publish({
      type: intent === 'PURCHASE' ? 'purchase.intent' : 'conversation.turn.completed',
      occurredAt: new Date().toISOString(),
      sessionId: input.sessionId,
      payload: { messageId: input.messageId ?? null, intent, queryTarget: reference.queryTarget, state, answer: llmResult.text }
    });

    return {
      sessionId: input.sessionId,
      answer: llmResult.text,
      state,
      debug: {
        intent,
        queryTarget: reference.queryTarget,
        explicitSwitch: reference.explicitSwitch,
        budget: state.budget ?? null,
        priceObjection: budget.priceObjection,
        llm: {
          model: llmResult.model,
          inputTokens: llmResult.usage.inputTokens,
          outputTokens: llmResult.usage.outputTokens,
          totalTokens: llmResult.usage.totalTokens,
          cachedInputTokens: llmResult.usage.cachedInputTokens,
          durationMs: llmResult.durationMs,
        },
        totalDurationMs: Math.max(0, Math.round(performance.now() - turnStarted)),
        automation
      }
    };
  }
}

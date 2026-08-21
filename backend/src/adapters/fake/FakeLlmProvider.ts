import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';
import { resolveIntentPlan } from '../../conversation/intent/IntentPlan.ts';
import { resolveReference } from '../../conversation/reference/ReferenceResolver.ts';
import { nextBestAction } from '../../conversation/nba/NextBestAction.ts';

export class FakeLlmProvider implements LlmProvider {
  async decide(input: LlmDecisionInput): Promise<LlmDecisionResult> {
    const plan = resolveIntentPlan(input.message);
    const ref = resolveReference(input.message, input.state);
    const primary = plan.primary === 'PRICE_AVAILABILITY' ? 'PRICE' : plan.primary === 'IMAGES' ? 'IMAGE' : plan.primary === 'ATTRIBUTE' ? 'CAPABILITY' : plan.primary === 'OBJECTION' ? 'HANDLE_PRICE_OBJECTION' : plan.primary === 'RECOMMEND' ? 'RECOMMEND_WITHIN_BUDGET' : plan.primary;
    const state = {
      ...input.state,
      queryTarget: ref.queryTarget ?? input.state.queryTarget ?? null,
      selectedProduct: ref.selectedProduct ?? input.state.selectedProduct ?? null,
      salientProduct: ref.salientProduct ?? input.state.salientProduct ?? null,
      comparisonProducts: ref.comparisonProducts?.length ? ref.comparisonProducts : input.state.comparisonProducts ?? [],
    };
    return {
      decision: {
        primaryIntent: primary,
        secondaryIntents: plan.secondary,
        targetProduct: ref.queryTarget ?? input.state.queryTarget ?? input.state.activeProduct ?? null,
        mentionedProducts: ref.mentionedProducts ?? [],
        referenceType: ref.referenceType ?? null,
        explicitSwitch: ref.explicitSwitch ?? false,
        selectedProduct: ref.selectedProduct ?? null,
        comparisonProducts: ref.comparisonProducts ?? input.state.comparisonProducts ?? [],
        attributes: plan.attributes,
        customerNeed: input.state.useCase ?? null,
        customerProblem: input.state.problem ?? null,
        priorities: input.state.priorities ?? [],
        objection: input.state.objection ?? null,
        commercialStage: input.state.commercialStage ?? null,
        spinContribution: null,
        nextBestAction: nextBestAction(primary, state),
        needsSql: ['PRICE','STOCK','IMAGE','RECOMMEND_WITHIN_BUDGET','COMPARE'].includes(primary),
        needsProductRag: ['CAPABILITY','PRODUCT_INFO','COMPARE','EVALUATE_USE','RECOMMEND_WITHIN_BUDGET'].includes(primary),
        needsInstitutionalRag: ['POLICY','WARRANTY'].includes(primary),
        confidence: plan.confidence,
      },
      model: 'fake-test-llm',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
      durationMs: 0,
    };
  }

  async write(input: LlmWriteInput): Promise<LlmResult> {
    return {
      text: input.deterministicAnswer ?? `[MODO PRUEBA] Recibí tu consulta sobre ${input.state.queryTarget ?? 'el producto'}.`,
      model: 'fake-test-llm',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
      durationMs: 0,
    };
  }
}

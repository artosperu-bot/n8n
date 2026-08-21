import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';

export class FakeLlmProvider implements LlmProvider {
  async write(input: LlmWriteInput): Promise<LlmResult> {
    return {
      text: input.deterministicAnswer ?? `[MODO PRUEBA] Recibí tu consulta sobre ${input.state.queryTarget ?? 'el producto'}.`,
      model: 'fake-test-llm',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
      durationMs: 0,
    };
  }
}

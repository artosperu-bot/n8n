import type { LlmProvider, LlmWriteInput } from '../../ports/LlmProvider.ts';

export class FakeLlmProvider implements LlmProvider {
  async write(input: LlmWriteInput): Promise<string> {
    if (input.deterministicAnswer) return input.deterministicAnswer;
    return `[MODO PRUEBA] Recibí tu consulta sobre ${input.state.queryTarget ?? 'el producto'}.`;
  }
}

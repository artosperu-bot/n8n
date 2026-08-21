import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';

export type WriterGuardResult = {
  answer: string;
  model: string;
  llmResult: LlmResult | null;
  fallback: { delivered: boolean; error?: string };
};

export async function safeWrite(llm: LlmProvider, input: LlmWriteInput, fallbackAnswer: string): Promise<WriterGuardResult> {
  try {
    const result = await llm.write(input);
    return { answer: result.text, model: result.model, llmResult: result, fallback: { delivered: true } };
  } catch (error) {
    return {
      answer: fallbackAnswer,
      model: 'deterministic-fallback-v0.4',
      llmResult: null,
      fallback: { delivered: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}

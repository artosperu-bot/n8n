import type { ConversationState, ProductQuote, RagEvidence } from '../domain/types.ts';

export type LlmWriteInput = {
  message: string;
  intent: string;
  state: ConversationState;
  quote?: ProductQuote | null;
  rag?: RagEvidence[];
  deterministicAnswer?: string | null;
};

export type LlmUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
};

export type LlmResult = {
  text: string;
  model: string;
  usage: LlmUsage;
  durationMs: number;
};

export interface LlmProvider {
  write(input: LlmWriteInput): Promise<LlmResult>;
}

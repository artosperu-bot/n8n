import type { ConversationState, ProductQuote, RagEvidence } from '../domain/types.ts';

export type LlmWriteInput = {
  message: string;
  intent: string;
  state: ConversationState;
  quote?: ProductQuote | null;
  rag?: RagEvidence[];
  deterministicAnswer?: string | null;
  decision?: TurnDecision | null;
};

export type LlmDecisionInput = {
  message: string;
  state: ConversationState;
};

export type TurnDecision = {
  primaryIntent: string;
  secondaryIntents: string[];
  targetProduct: string | null;
  mentionedProducts: string[];
  referenceType: string | null;
  explicitSwitch: boolean;
  selectedProduct: string | null;
  comparisonProducts: string[];
  attributes: string[];
  customerNeed: string | null;
  customerProblem: string | null;
  priorities: string[];
  objection: string | null;
  commercialStage: string | null;
  spinContribution: string | null;
  nextBestAction: string | null;
  needsSql: boolean;
  needsProductRag: boolean;
  needsInstitutionalRag: boolean;
  confidence: number;
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

export type LlmDecisionResult = {
  decision: TurnDecision;
  model: string;
  usage: LlmUsage;
  durationMs: number;
};

export interface LlmProvider {
  decide?(input: LlmDecisionInput): Promise<LlmDecisionResult>;
  write(input: LlmWriteInput): Promise<LlmResult>;
}

import type { ConversationState, ProductQuote, RagEvidence, VerifiedFact } from '../domain/types.ts';

export type RecentDialogueMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LlmWriteInput = {
  message: string;
  intent: string;
  state: ConversationState;
  quote?: ProductQuote | null;
  rag?: RagEvidence[];
  verifiedFacts?: VerifiedFact[];
  deterministicAnswer?: string | null;
  decision?: TurnDecision | null;
  /** Canonical products the writer is allowed to present as real in this turn. */
  allowedProducts?: string[];
};

export type LlmDecisionInput = {
  message: string;
  state: ConversationState;
  history?: RecentDialogueMessage[];
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

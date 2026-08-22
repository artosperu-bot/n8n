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
  /** Canonical, verified products that may be offered as alternatives this turn. */
  alternatives?: string[];
  /** Explicit commercial contract. These fields are derived once before the writer. */
  nextBestAction?: string | null;
  commercialStage?: string | null;
  knownFacts?: Record<string, unknown>;
  missingFacts?: string[];
  missingFact?: string | null;
  decisionImpact?: boolean;
  interestSignal?: boolean;
  purchaseSignal?: boolean;
  objection?: string | null;
  activeProduct?: string | null;
  selectedProduct?: string | null;
  recommendedProduct?: string | null;
  useCase?: string | null;
  problem?: string | null;
  priorities?: string[];
  budget?: number | null;
  verifiedFeatures?: VerifiedFact[];
  customerContext?: Record<string, unknown>;
  commercialGoal?: string | null;
  capabilityAction?: string | null;
  turnCapabilities?: Record<string, boolean>;
  imageUrls?: string[];
  /** Internal boundary marker: the engine prepared and validated the commercial contract. */
  commercialContractPrepared?: boolean;
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

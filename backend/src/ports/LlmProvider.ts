import type { ConversationState, ProductQuote, RagEvidence, VerifiedFact } from '../domain/types.ts';

export type RecentDialogueMessage = { role: 'user' | 'assistant'; content: string; };

export type ProductHighlight={
  family:'MEMORY'|'BATTERY'|'RESISTANCE'|'CAMERA'|'DISPLAY'|'PERFORMANCE'|'CONNECTIVITY'|'NETWORK'|'THERMAL'|'OTHER';
  label:string;
  facts:VerifiedFact[];
  summary:string;
};
export type RagPresentationMode='PRODUCT_OVERVIEW'|'ATTRIBUTE'|'INSTITUTIONAL'|'DEFAULT';

export type CommercialResponseMode =
  | 'FACTUAL_DIRECT'
  | 'DISCOVERY_SPIN'
  | 'CONTEXTUAL_FAB'
  | 'GUIDED_CHOICE'
  | 'OBJECTION_LAER'
  | 'SOFT_CLOSE'
  | 'PURCHASE_PROGRESS'
  | 'HANDOFF';

export type CommercialClosePurpose='FULFILLMENT'|'RESERVATION'|null;

export type CommercialResponsePlan = {
  mode: CommercialResponseMode;
  strategy: string | null;
  shouldUseLlm: boolean;
  acknowledgeContext: boolean;
  contextFocus: string[];
  factualCore: string;
  exactNba: string;
  closePurpose: CommercialClosePurpose;
  maxQuestions: 0 | 1;
  allowedActions: string[];
  forbiddenClaims: string[];
};

export type CommercialMove = {
  action:'RELATED_VALUE';
  kind:'STOCK_STATUS'|'CONTEXTUAL_BENEFIT'|'RELATED_VERIFIED_FACT';
  targetProduct:string;
  intensity:'LIGHT'|'MEDIUM'|'HIGH';
  reason:string;
  basis:Array<'SQL'|'VERIFIED_PRODUCT_FEATURE'|'CUSTOMER_CONTEXT'>;
  attribute:string|null;
  verifiedFacts:VerifiedFact[];
  relevantCustomerContext:{useCase:string|null;problem:string|null;priorities:string[];budget:number|null;objection:string|null;};
};

export type LlmWriteInput = {
  message: string; intent: string; state: ConversationState; quote?: ProductQuote | null; rag?: RagEvidence[]; verifiedFacts?: VerifiedFact[];
  deterministicAnswer?: string | null;
  directAnswer?: string | null;
  decision?: TurnDecision | null;
  allowedProducts?: string[]; alternatives?: string[]; candidateNba?: string | null; finalExecutableNba?: string | null; nextBestAction?: string | null;
  commercialStage?: string | null; knownFacts?: Record<string, unknown>; missingFacts?: string[]; missingFact?: string | null; decisionImpact?: boolean;
  interestSignal?: boolean; purchaseSignal?: boolean; objection?: string | null; activeProduct?: string | null; selectedProduct?: string | null; recommendedProduct?: string | null;
  previousRecommendedProduct?: string | null; recommendationChanged?: boolean; recommendationChangeReason?: string | null; useCase?: string | null; problem?: string | null; priorities?: string[]; budget?: number | null;
  verifiedFeatures?: VerifiedFact[]; productHighlights?:ProductHighlight[]; presentationMode?:RagPresentationMode;
  customerContext?: Record<string, unknown>; commercialGoal?: string | null; capabilityAction?: string | null; turnCapabilities?: Record<string, boolean>; resolvedCurrentIntent?: string;
  commercialSignals?: Record<string, unknown>; resolvedProduct?: string | null; supportedCapabilities?: string[]; executableNba?: string; levelOfInterest?: number; attribute?: string | null;
  implications?: string[]; pendingQuestion?: string | null; pendingAction?: string | null; commercialMove?: CommercialMove | null; imageUrls?: string[]; commercialContractPrepared?: boolean;
  commercialResponsePlan?: CommercialResponsePlan | null;
};

export type LlmDecisionInput = { message: string; state: ConversationState; history?: RecentDialogueMessage[]; };
export type TurnDecision = {
  primaryIntent: string; secondaryIntents: string[]; targetProduct: string | null; mentionedProducts: string[]; referenceType: string | null; explicitSwitch: boolean; selectedProduct: string | null;
  comparisonProducts: string[]; attributes: string[]; customerNeed: string | null; customerProblem: string | null; priorities: string[]; objection: string | null; commercialStage: string | null;
  spinContribution: string | null; nextBestAction: string | null; needsSql: boolean; needsProductRag: boolean; needsInstitutionalRag: boolean; confidence: number;
};
export type LlmUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cachedInputTokens: number | null; };
export type LlmResult = { text: string; model: string; usage: LlmUsage; durationMs: number; };
export type LlmDecisionResult = { decision: TurnDecision; model: string; usage: LlmUsage; durationMs: number; };
export interface LlmProvider { decide?(input: LlmDecisionInput): Promise<LlmDecisionResult>; write(input: LlmWriteInput): Promise<LlmResult>; }

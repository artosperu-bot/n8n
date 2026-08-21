import type { Intent } from '../conversation/intent/IntentResolver.ts';

export type ConversationState = {
  sessionId?: string;
  activeProduct?: string | null;
  recommendedProduct?: string | null;
  comparisonProducts?: string[];
  queryTarget?: string | null;
  explicitSwitch?: boolean;
  budget?: number | null;
  lastIntent?: Intent | string | null;
  spinFacts?: string[];
  lastNba?: string | null;
  turnCount?: number;
  updatedAt?: string;
};

export type ProductQuote = {
  product: string;
  productCode?: string | null;
  price: number | null;
  stock: number | null;
  currency: string;
  source: 'FAKE_TEST_DATA' | 'SQL_BRIDGE' | 'SQL_SERVER';
};

export type RagEvidence = { text: string; source: string; score?: number };
export type ChatInput = { sessionId: string; message: string; messageId?: string };

export type LlmDebug = {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  durationMs: number;
};

export type ChatTurnResult = {
  sessionId: string;
  answer: string;
  state: ConversationState;
  debug: {
    intent: string;
    queryTarget: string | null;
    explicitSwitch: boolean;
    budget: number | null;
    priceObjection: boolean;
    llm?: LlmDebug;
    totalDurationMs?: number;
    automation?: { delivered: boolean; error?: string };
  };
};

export type AutomationEvent = {
  type: 'conversation.turn.completed' | 'handoff.requested' | 'purchase.intent' | 'notification.requested';
  occurredAt: string;
  sessionId: string;
  payload: Record<string, unknown>;
};

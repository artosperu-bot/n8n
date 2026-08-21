import type { ConversationState } from '../domain/types.ts';

export type ConversationMessageMeta = {
  messageId?: string | null;
  requestId?: string | null;
  conversationType?: string | null;
  model?: string | null;
};

export type TurnCompletionMeta = ConversationMessageMeta & {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  totalPrompts?: number | null;
  cachedInputTokens?: number | null;
};

export interface ConversationRepository {
  getState(sessionId: string): Promise<ConversationState>;
  saveState(sessionId: string, state: ConversationState): Promise<void>;
  appendMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    meta?: ConversationMessageMeta,
  ): Promise<void>;
  beginTurn?(sessionId: string, messageId: string, requestId: string): Promise<void>;
  completeTurn?(
    sessionId: string,
    userContent: string,
    assistantContent: string,
    state: ConversationState,
    meta?: TurnCompletionMeta,
  ): Promise<void>;
  getMessages(sessionId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string; at: string }>>;
  reset(sessionId: string): Promise<void>;
}

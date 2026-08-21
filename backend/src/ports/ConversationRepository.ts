import type { ConversationState } from '../domain/types.ts';

export type ConversationMessageMeta = {
  messageId?: string | null;
  requestId?: string | null;
  conversationType?: string | null;
  model?: string | null;
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
  getMessages(sessionId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string; at: string }>>;
  reset(sessionId: string): Promise<void>;
}

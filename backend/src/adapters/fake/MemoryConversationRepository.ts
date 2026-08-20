import type { ConversationRepository } from '../../ports/ConversationRepository.ts';
import type { ConversationState } from '../../domain/types.ts';

export class MemoryConversationRepository implements ConversationRepository {
  #states = new Map<string, ConversationState>();
  #messages = new Map<string, Array<{ role: 'user' | 'assistant'; content: string; at: string }>>();
  async getState(sessionId: string): Promise<ConversationState> { return structuredClone(this.#states.get(sessionId) ?? { sessionId, turnCount: 0, comparisonProducts: [], spinFacts: [] }); }
  async saveState(sessionId: string, state: ConversationState): Promise<void> { this.#states.set(sessionId, structuredClone({ ...state, sessionId })); }
  async appendMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> { const list = this.#messages.get(sessionId) ?? []; list.push({ role, content, at: new Date().toISOString() }); this.#messages.set(sessionId, list); }
  async getMessages(sessionId: string) { return structuredClone(this.#messages.get(sessionId) ?? []); }
  async reset(sessionId: string): Promise<void> { this.#states.delete(sessionId); this.#messages.delete(sessionId); }
}

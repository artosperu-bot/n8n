import type { ConversationMessageMeta, ConversationRepository, TurnCompletionMeta } from '../../ports/ConversationRepository.ts';
import type { ConversationState } from '../../domain/types.ts';

export class MemoryConversationRepository implements ConversationRepository {
  #states = new Map<string, ConversationState>();
  #messages = new Map<string, Array<{ role: 'user' | 'assistant'; content: string; at: string; meta?: ConversationMessageMeta }>>();
  async getState(sessionId: string): Promise<ConversationState> { return structuredClone(this.#states.get(sessionId) ?? { sessionId, contextVersion:0, turnCount: 0, comparisonProducts: [], spinFacts: [] }); }
  async saveState(sessionId: string, state: ConversationState): Promise<void> { this.#states.set(sessionId, structuredClone({ ...state, sessionId })); }
  async appendMessage(sessionId: string, role: 'user' | 'assistant', content: string, meta?: ConversationMessageMeta): Promise<void> { const list = this.#messages.get(sessionId) ?? []; list.push({ role, content, at: new Date().toISOString(), meta }); this.#messages.set(sessionId, list); }
  async beginTurn(_sessionId:string,_messageId:string,_requestId:string):Promise<void> {}
  async completeTurn(sessionId:string,userContent:string,assistantContent:string,state:ConversationState,meta:TurnCompletionMeta={}):Promise<void> {
    await this.appendMessage(sessionId,'user',userContent,meta);
    const next = { ...state, sessionId, contextVersion:(state.contextVersion ?? 0) + 1 };
    await this.appendMessage(sessionId,'assistant',assistantContent,meta);
    await this.saveState(sessionId,next);
  }
  async getMessages(sessionId: string) { return structuredClone((this.#messages.get(sessionId) ?? []).map(({ role, content, at }) => ({ role, content, at }))); }
  async reset(sessionId: string): Promise<void> { this.#states.delete(sessionId); this.#messages.delete(sessionId); }
}

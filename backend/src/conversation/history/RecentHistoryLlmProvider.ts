import type { ConversationRepository } from '../../ports/ConversationRepository.ts';
import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';

export class RecentHistoryLlmProvider implements LlmProvider {
  readonly #inner: LlmProvider;
  readonly #conversations: ConversationRepository;
  readonly #maxMessages: number;

  constructor(inner: LlmProvider, conversations: ConversationRepository, maxMessages = 6) {
    this.#inner = inner;
    this.#conversations = conversations;
    this.#maxMessages = Math.max(2, maxMessages);
  }

  async decide(input: LlmDecisionInput): Promise<LlmDecisionResult> {
    if (!this.#inner.decide) throw new Error('Inner LLM does not support semantic decisions');
    const sessionId = String(input.state.sessionId ?? '').trim();
    let history = input.history ?? [];
    if (sessionId) {
      try {
        history = (await this.#conversations.getMessages(sessionId))
          .slice(-this.#maxMessages)
          .map(({ role, content }) => ({ role, content }));
      } catch {
        history = input.history ?? [];
      }
    }
    return this.#inner.decide({ ...input, history });
  }

  write(input: LlmWriteInput): Promise<LlmResult> {
    return this.#inner.write(input);
  }
}

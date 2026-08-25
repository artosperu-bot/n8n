import type { AutomationAttentionMode, AutomationEventType, AutomationRepository } from './types.ts';

type CustomerMessageEvent = {
  sessionId: string;
  messageId: string;
  recipient: string;
  sourceSentAt: string | null;
  duplicate?: boolean;
  attentionMode?: AutomationAttentionMode;
};

export class AutomationScheduler {
  readonly #repository: AutomationRepository;
  readonly #now: () => Date;

  constructor(repository: AutomationRepository, now: () => Date = () => new Date()) {
    this.#repository = repository;
    this.#now = now;
  }

  cancelSession(sessionId: string, reason: string): Promise<number> {
    return this.#repository.cancelPending(sessionId, reason);
  }

  async onCustomerMessage(input: CustomerMessageEvent): Promise<{cancelled: number; scheduled: number}> {
    if (input.duplicate) return {cancelled: 0, scheduled: 0};

    const cancelled = await this.#repository.cancelPending(input.sessionId, 'CUSTOMER_REPLIED');
    if (input.attentionMode && input.attentionMode !== 'BOT') return {cancelled, scheduled: 0};

    const eventType: AutomationEventType = 'CUSTOMER_MESSAGE_RECEIVED';
    const rules = await this.#repository.listActiveRules(eventType);
    const source = input.sourceSentAt ? new Date(input.sourceSentAt) : null;
    const basis = source && !Number.isNaN(source.getTime()) ? source : this.#now();
    let scheduled = 0;

    for (const rule of rules) {
      if (!rule.active || rule.eventType !== eventType) continue;
      const job = await this.#repository.scheduleJob({
        ruleId: rule.id,
        sessionId: input.sessionId,
        eventType,
        basisMessageId: input.messageId || null,
        recipient: input.recipient,
        executeAt: new Date(basis.getTime() + Math.max(0, rule.delaySeconds) * 1000).toISOString(),
      });
      if (job) scheduled += 1;
    }

    return {cancelled, scheduled};
  }
}

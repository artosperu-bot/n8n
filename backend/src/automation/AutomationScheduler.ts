import type { AutomationAttentionMode, AutomationEventType, AutomationMediaSnapshot, AutomationRepository } from './types.ts';

type CustomerMessageEvent = {
  sessionId: string;
  messageId: string;
  recipient: string;
  sourceSentAt: string | null;
  duplicate?: boolean;
  attentionMode?: AutomationAttentionMode;
};

type BotMessageEvent = {
  sessionId: string;
  customerMessageId: string;
  recipient: string;
  botSentAt: string;
  attentionMode: AutomationAttentionMode;
};

type MediaResolver={resolveForSession(sessionId:string):Promise<AutomationMediaSnapshot>};
const EMPTY_MEDIA:AutomationMediaSnapshot={mediaUrl:null,mediaType:null,mediaProductId:null,mediaSource:null};

export class AutomationScheduler {
  readonly #repository: AutomationRepository;
  readonly #now: () => Date;
  readonly #mediaResolver:MediaResolver|null;

  constructor(repository: AutomationRepository, now: () => Date = () => new Date(), mediaResolver:MediaResolver|null=null) {
    this.#repository = repository;
    this.#now = now;
    this.#mediaResolver=mediaResolver;
  }

  cancelSession(sessionId: string, reason: string): Promise<number> {
    return this.#repository.cancelPending(sessionId, reason);
  }

  async onCustomerMessage(input: CustomerMessageEvent): Promise<{cancelled: number; scheduled: number}> {
    if (input.duplicate) return {cancelled: 0, scheduled: 0};
    const cancelled = await this.#repository.cancelPending(input.sessionId, 'CUSTOMER_REPLIED');
    return {cancelled, scheduled: 0};
  }

  async onBotMessage(input: BotMessageEvent): Promise<{scheduled: number}> {
    if (input.attentionMode !== 'BOT') return {scheduled: 0};

    const eventType: AutomationEventType = 'BOT_MESSAGE_SENT';
    const rules = await this.#repository.listActiveRules(eventType);
    const sentAt = new Date(input.botSentAt);
    const basis = Number.isNaN(sentAt.getTime()) ? this.#now() : sentAt;
    let scheduled = 0;

    for (const rule of rules) {
      if (!rule.active || rule.eventType !== eventType) continue;
      let media:AutomationMediaSnapshot=EMPTY_MEDIA;
      if(rule.actionType==='SEND_IMAGE_CUSTOM_URL'){
        media={mediaUrl:rule.mediaUrl,mediaType:null,mediaProductId:null,mediaSource:'CUSTOM_URL'};
      }else if(rule.actionType==='SEND_IMAGE_PRODUCT_AUTO'&&this.#mediaResolver){
        media=await this.#mediaResolver.resolveForSession(input.sessionId).catch(()=>EMPTY_MEDIA);
      }
      const job = await this.#repository.scheduleJob({
        ruleId: rule.id,
        sessionId: input.sessionId,
        eventType,
        basisMessageId: input.customerMessageId || null,
        recipient: input.recipient,
        executeAt: new Date(basis.getTime() + Math.max(0, rule.delaySeconds) * 1000).toISOString(),
        actionType:rule.actionType,
        ...media,
      });
      if (job) scheduled += 1;
    }

    return {scheduled};
  }
}

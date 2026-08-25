import type { AutomationSender } from './types.ts';

export type AutomationActionResult =
  | {outcome: 'SENT'; providerMessageId: string; reason: null}
  | {outcome: 'FAILED' | 'AMBIGUOUS'; providerMessageId: null; reason: string};

function compactReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'AUTOMATION_SEND_FAILED';
}

export class ActionExecutor {
  readonly #sender: AutomationSender;

  constructor(sender: AutomationSender) {
    this.#sender = sender;
  }

  async sendText(recipient: string, content: string): Promise<AutomationActionResult> {
    try {
      const sent = await this.#sender.sendTextOnce(recipient, content);
      if (!sent.messageId) return {outcome: 'FAILED', providerMessageId: null, reason: 'WHATSAPP_MESSAGE_ID_REQUIRED'};
      return {outcome: 'SENT', providerMessageId: sent.messageId, reason: null};
    } catch (error) {
      const reason = compactReason(error);
      if (/WHATSAPP_AMBIGUOUS_SEND/i.test(reason)) {
        return {outcome: 'AMBIGUOUS', providerMessageId: null, reason: 'WHATSAPP_AMBIGUOUS_SEND'};
      }
      return {outcome: 'FAILED', providerMessageId: null, reason};
    }
  }
}

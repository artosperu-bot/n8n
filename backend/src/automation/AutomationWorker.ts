import { ActionExecutor } from './ActionExecutor.ts';
import { evaluateWhatsAppWindow } from './WhatsAppPolicy.ts';
import type { AutomationClaimedJob, AutomationCrmPort, AutomationRepository, AutomationSender } from './types.ts';

type Options = {
  repository: AutomationRepository;
  crm: AutomationCrmPort;
  sender: AutomationSender;
  workerId: string;
  now?: () => Date;
  windowHours?: number;
  batchSize?: number;
  leaseSeconds?: number;
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
};

export class AutomationWorker {
  private readonly executor: ActionExecutor;
  private readonly now: () => Date;
  private readonly windowHours: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly options: Options) {
    this.executor = new ActionExecutor(options.sender);
    this.now = options.now ?? (() => new Date());
    this.windowHours = options.windowHours ?? 24;
    this.batchSize = Math.max(1, options.batchSize ?? 20);
    this.leaseSeconds = Math.max(1, options.leaseSeconds ?? 60);
    this.pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? 5000);
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const jobs = await this.options.repository.claimDue(this.options.workerId, this.batchSize, this.leaseSeconds);
      for (const job of jobs) await this.processJob(job);
      return jobs.length;
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer) return;
    const tick = () => void this.runOnce().catch(error => this.options.onError?.(error));
    tick();
    this.timer = setInterval(tick, this.pollIntervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async terminal(job: AutomationClaimedJob, status: 'CANCELLED'|'SKIPPED'|'FAILED'|'AMBIGUOUS', reason: string): Promise<void> {
    await this.options.repository.recordExecution({jobId: job.id, sessionId: job.sessionId, outcome: status, providerMessageId: null, detail: {reason}}).catch(()=>undefined);
    await this.options.repository.markTerminal(job.id, status, reason);
  }

  private async processJob(job: AutomationClaimedJob): Promise<void> {
    const rule = await this.options.repository.getRule(job.ruleId);
    if (!rule || !rule.active) return this.terminal(job, 'CANCELLED', 'RULE_INACTIVE');

    const state = await this.options.crm.getAutomationState(job.sessionId);
    if (state.mode !== 'BOT') {
      const reason = state.mode === 'HUMANO' ? 'HUMAN_TAKEOVER' : state.mode === 'ESPERANDO_ASESOR' ? 'WAITING_ADVISOR' : 'SESSION_CLOSED';
      return this.terminal(job, 'CANCELLED', reason);
    }

    if (state.latestCustomerMessageId && job.basisMessageId && state.latestCustomerMessageId !== job.basisMessageId) {
      return this.terminal(job, 'CANCELLED', 'CUSTOMER_REPLIED');
    }

    const window = evaluateWhatsAppWindow(state.latestCustomerAt, this.now(), this.windowHours);
    if (!window.allowed) return this.terminal(job, 'SKIPPED', window.reason ?? 'WHATSAPP_WINDOW_CLOSED');

    const result = await this.executor.sendText(job.recipient, job.messageTemplate);
    if (result.outcome !== 'SENT') return this.terminal(job, result.outcome, result.reason);

    try {
      await this.options.crm.recordAutomationMessage({
        sessionId: job.sessionId,
        messageId: result.providerMessageId,
        content: job.messageTemplate,
        recipient: job.recipient,
        jobId: job.id,
      });
      await this.options.repository.recordExecution({
        jobId: job.id,
        sessionId: job.sessionId,
        outcome: 'SENT',
        providerMessageId: result.providerMessageId,
        detail: {},
      });
      await this.options.repository.markTerminal(job.id, 'SENT', null);
    } catch (error) {
      const reason = 'OUTBOUND_AUDIT_FAILED_AFTER_SEND';
      await this.options.repository.recordExecution({
        jobId: job.id,
        sessionId: job.sessionId,
        outcome: 'FAILED',
        providerMessageId: result.providerMessageId,
        detail: {reason, error: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180)},
      }).catch(()=>undefined);
      await this.options.repository.markTerminal(job.id, 'FAILED', reason);
    }
  }
}

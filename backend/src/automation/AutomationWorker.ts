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
  readonly #options: Options;
  readonly #executor: ActionExecutor;
  readonly #now: () => Date;
  readonly #windowHours: number;
  readonly #batchSize: number;
  readonly #leaseSeconds: number;
  readonly #pollIntervalMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;
  #running = false;

  constructor(options: Options) {
    this.#options = options;
    this.#executor = new ActionExecutor(options.sender);
    this.#now = options.now ?? (() => new Date());
    this.#windowHours = options.windowHours ?? 24;
    this.#batchSize = Math.max(1, options.batchSize ?? 20);
    this.#leaseSeconds = Math.max(1, options.leaseSeconds ?? 60);
    this.#pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? 5000);
  }

  async runOnce(): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    try {
      const jobs = await this.#options.repository.claimDue(this.#options.workerId, this.#batchSize, this.#leaseSeconds);
      for (const job of jobs) await this.#processJob(job);
      return jobs.length;
    } finally {
      this.#running = false;
    }
  }

  start(): void {
    if (this.#timer) return;
    const tick = () => void this.runOnce().catch(error => this.#options.onError?.(error));
    tick();
    this.#timer = setInterval(tick, this.#pollIntervalMs);
  }

  stop(): void {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  async #terminal(job: AutomationClaimedJob, status: 'CANCELLED'|'SKIPPED'|'FAILED'|'AMBIGUOUS', reason: string): Promise<void> {
    await this.#options.repository.recordExecution({jobId: job.id, sessionId: job.sessionId, outcome: status, providerMessageId: null, detail: {reason,actionType:job.actionType,mediaUrl:job.mediaUrl,mediaUrls:job.mediaUrls,mediaProductId:job.mediaProductId,mediaSource:job.mediaSource}}).catch(()=>undefined);
    await this.#options.repository.markTerminal(job.id, status, reason);
  }

  async #processJob(job: AutomationClaimedJob): Promise<void> {
    const rule = await this.#options.repository.getRule(job.ruleId);
    if (!rule || !rule.active) return this.#terminal(job, 'CANCELLED', 'RULE_INACTIVE');

    const state = await this.#options.crm.getAutomationState(job.sessionId);
    if (state.mode !== 'BOT') {
      const reason = state.mode === 'HUMANO' ? 'HUMAN_TAKEOVER' : state.mode === 'ESPERANDO_ASESOR' ? 'WAITING_ADVISOR' : 'SESSION_CLOSED';
      return this.#terminal(job, 'CANCELLED', reason);
    }

    if (state.latestCustomerMessageId && job.basisMessageId && state.latestCustomerMessageId !== job.basisMessageId) {
      return this.#terminal(job, 'CANCELLED', 'CUSTOMER_REPLIED');
    }

    const window = evaluateWhatsAppWindow(state.latestCustomerAt, this.#now(), this.#windowHours);
    if (!window.allowed) return this.#terminal(job, 'SKIPPED', window.reason ?? 'WHATSAPP_WINDOW_CLOSED');

    const result = await this.#executor.execute({recipient:job.recipient,content:job.messageTemplate,actionType:job.actionType,mediaUrl:job.mediaUrl,mediaUrls:job.mediaUrls});
    if (result.outcome !== 'SENT') {
      await this.#options.repository.recordExecution({
        jobId:job.id,sessionId:job.sessionId,outcome:result.outcome,providerMessageId:null,
        detail:{reason:result.reason,actionType:job.actionType,mediaUrl:job.mediaUrl,mediaUrls:job.mediaUrls,mediaProductId:job.mediaProductId,mediaSource:job.mediaSource,fallbackToText:Boolean(result.fallbackToText),imageError:result.imageError??null},
      }).catch(()=>undefined);
      return this.#options.repository.markTerminal(job.id,result.outcome,result.reason);
    }

    let auditWarning:string|null=result.warning??null;
    let auditError:string|null=null;
    try {
      await this.#options.crm.recordAutomationMessage({
        sessionId: job.sessionId,
        messageId: result.providerMessageId,
        content: job.messageTemplate,
        recipient: job.recipient,
        jobId: job.id,
        actionType:job.actionType,
        mediaUrl:job.mediaUrl,
        mediaUrls:job.mediaUrls,
        mediaProductId:job.mediaProductId,
        mediaSource:job.mediaSource,
        fallbackToText:Boolean(result.fallbackToText),
      });
    } catch (error) {
      auditWarning=auditWarning??'OUTBOUND_AUDIT_FAILED_AFTER_SEND';
      auditError=error instanceof Error?error.message.slice(0,180):String(error).slice(0,180);
    }

    await this.#options.repository.recordExecution({
      jobId: job.id,
      sessionId: job.sessionId,
      outcome: 'SENT',
      providerMessageId: result.providerMessageId,
      detail: {
        actionType:job.actionType,mediaUrl:job.mediaUrl,mediaUrls:job.mediaUrls,mediaProductId:job.mediaProductId,mediaSource:job.mediaSource,
        fallbackToText:Boolean(result.fallbackToText),imageError:result.imageError??null,providerMessageIds:result.providerMessageIds??[result.providerMessageId],
        mediaSentCount:result.mediaSentCount??(job.actionType==='SEND_TEXT'?0:1),warning:auditWarning,auditError,
      },
    }).catch(error=>this.#options.onError?.(error));

    await this.#options.repository.markTerminal(job.id, 'SENT', auditWarning);
  }
}

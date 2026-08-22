import type { AutomationBus, AutomationResult } from '../../ports/AutomationBus.ts';
import type { AutomationEvent } from '../../domain/types.ts';

type Options = { url: string; token?: string; strict?: boolean; fetcher?: typeof fetch };

export class N8nAutomationBus implements AutomationBus {
  readonly #url: string;
  readonly #token?: string;
  readonly #strict: boolean;
  readonly #fetcher: typeof fetch;
  constructor(options: Options) {
    this.#url = options.url;
    this.#token = options.token;
    this.#strict = options.strict ?? false;
    this.#fetcher = options.fetcher ?? fetch;
  }
  async publish(event: AutomationEvent): Promise<AutomationResult> {
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.#token) headers.authorization = `Bearer ${this.#token}`;
      const response = await this.#fetcher(this.#url, { method: 'POST', headers, body: JSON.stringify(event) });
      if (!response.ok) throw new Error(`n8n webhook HTTP ${response.status}`);
      return { delivered: true };
    } catch (error) {
      if (this.#strict) throw error;
      return { delivered: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

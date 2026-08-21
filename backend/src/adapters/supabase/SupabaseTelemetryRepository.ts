import type { LlmMetric, TelemetryRepository } from '../../ports/TelemetryRepository.ts';

type Options = {
  url: string;
  key: string;
  table?: string;
  fetcher?: typeof fetch;
};

export class SupabaseTelemetryRepository implements TelemetryRepository {
  readonly #url: string;
  readonly #key: string;
  readonly #table: string;
  readonly #fetcher: typeof fetch;

  constructor(options: Options) {
    this.#url = options.url.replace(/\/$/, '');
    this.#key = options.key;
    this.#table = options.table ?? 'ia_metricas_tokens';
    this.#fetcher = options.fetcher ?? fetch;
  }

  async recordLlmUsage(metric: LlmMetric): Promise<void> {
    const body = [{
      session_id: metric.sessionId,
      turno: metric.turn,
      nodo: 'OpenAIProvider',
      ruta: metric.route,
      modelo: metric.model,
      tokens_entrada: metric.inputTokens,
      tokens_salida: metric.outputTokens,
      tokens_cacheados: metric.cachedTokens,
      duracion_ms: metric.durationMs,
      message_id: metric.messageId,
    }];

    const response = await this.#fetcher(`${this.#url}/rest/v1/${this.#table}`, {
      method: 'POST',
      headers: {
        apikey: this.#key,
        authorization: `Bearer ${this.#key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Supabase telemetry write HTTP ${response.status}`);
  }
}

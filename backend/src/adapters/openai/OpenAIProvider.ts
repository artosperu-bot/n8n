import type { LlmProvider, LlmWriteInput } from '../../ports/LlmProvider.ts';

type Options = { apiKey: string; model: string; baseUrl?: string; fetcher?: typeof fetch };

export class OpenAIProvider implements LlmProvider {
  readonly #apiKey: string; readonly #model: string; readonly #baseUrl: string; readonly #fetcher: typeof fetch;
  constructor(options: Options) { this.#apiKey = options.apiKey; this.#model = options.model; this.#baseUrl = options.baseUrl ?? 'https://api.openai.com/v1'; this.#fetcher = options.fetcher ?? fetch; }
  async write(input: LlmWriteInput): Promise<string> {
    const instructions = [
      'Eres el redactor comercial de STECH.',
      'Responde en español natural de Perú.',
      'No inventes precio, stock, disponibilidad, garantía ni capacidades.',
      'La evidencia determinística suministrada es autoritativa; UNKNOWN permanece UNKNOWN.',
      'Responde primero la pregunta explícita y evita preguntas innecesarias.'
    ].join(' ');
    const body = {
      model: this.#model,
      instructions,
      input: `MENSAJE CLIENTE:\n${input.message}\n\nINTENT:${input.intent}\nPRODUCTO:${input.state.queryTarget ?? 'UNKNOWN'}\nEVIDENCIA DETERMINISTICA:\n${input.deterministicAnswer ?? 'NONE'}\nRAG:\n${(input.rag ?? []).map(x => x.text).join('\n') || 'NONE'}`
    };
    const response = await this.#fetcher(`${this.#baseUrl}/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#apiKey}` }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    const json: any = await response.json();
    if (typeof json.output_text === 'string' && json.output_text) return json.output_text;
    for (const item of json.output ?? []) for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) return String(c.text);
    throw new Error('OpenAI response contained no output text');
  }
}

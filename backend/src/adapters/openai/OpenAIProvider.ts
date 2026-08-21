import type { LlmProvider, LlmResult, LlmWriteInput } from '../../ports/LlmProvider.ts';

type Options = { apiKey: string; model: string; baseUrl?: string; fetcher?: typeof fetch };

export class OpenAIProvider implements LlmProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetcher: typeof fetch;

  constructor(options: Options) {
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.#fetcher = options.fetcher ?? fetch;
  }

  async write(input: LlmWriteInput): Promise<LlmResult> {
    const started = performance.now();
    const s = input.state;
    const compactState = {
      activeProduct: s.activeProduct ?? null,
      recommendedProduct: s.recommendedProduct ?? null,
      comparisonProducts: s.comparisonProducts ?? [],
      budget: s.budget ?? null,
      customerType: s.customerType ?? null,
      sector: s.sector ?? null,
      useCase: s.useCase ?? null,
      problem: s.problem ?? null,
      priorities: s.priorities ?? [],
      quantity: s.quantity ?? null,
      invoiceRequired: s.invoiceRequired ?? null,
      objection: s.objection ?? null,
      nextBestAction: s.lastNba ?? null,
    };
    const evidence = (input.rag ?? [])
      .slice(0, 4)
      .map(x => x.text.replace(/\s+/g, ' ').slice(0, 650))
      .join('\n');

    const instructions = [
      'Eres un vendedor consultivo de STECH PERÚ por chat, no un asistente genérico.',
      'Escribe español peruano natural, breve y comercial: normalmente 1 a 3 frases y máximo una pregunta útil.',
      'Primero responde lo que el cliente pidió; después, solo si aporta valor, avanza un paso comercial.',
      'Usa SPIN de forma natural: aprovecha situación, problema y prioridad ya conocidos; no repitas preguntas ya respondidas.',
      'Convierte características verificadas en beneficios ligados a la necesidad real del cliente.',
      'No inventes precio, disponibilidad, garantía, características, políticas, urgencia, escasez, testimonios ni acciones humanas.',
      'Nunca reveles cantidades de stock; solo habla de disponibilidad.',
      'Nunca ofrezcas ni menciones precio si el cliente no lo pidió explícitamente.',
      'No digas UNKNOWN, INTENT, queryTarget, RAG, sistema interno ni lenguaje técnico del backend.',
      'No prometas enviar cotizaciones, correos, llamadas, demos o reservas si la evidencia/acción no confirma que ocurrió.',
      'Evita listas largas, formularios y menús. En cierre pide un solo dato por turno.',
      'La evidencia suministrada es la única fuente factual.'
    ].join(' ');

    const body = {
      model: this.#model,
      max_output_tokens: 320,
      instructions,
      input: `CLIENTE:\n${input.message}\n\nINTENCION:${input.intent}\nCONTEXTO_COMERCIAL:${JSON.stringify(compactState)}\nEVIDENCIA_DETERMINISTICA:${input.deterministicAnswer ?? 'SIN_DATO'}\nEVIDENCIA_VERIFICADA:\n${evidence || 'SIN_DATO'}`,
    };

    const response = await this.#fetcher(`${this.#baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    const json: any = await response.json();

    let text: string | null = null;
    if (typeof json.output_text === 'string' && json.output_text) text = json.output_text;
    if (!text) {
      for (const item of json.output ?? []) {
        for (const c of item.content ?? []) {
          if (c.type === 'output_text' && c.text) { text = String(c.text); break; }
        }
        if (text) break;
      }
    }
    if (!text) throw new Error('OpenAI response contained no output text');

    return {
      text: text.trim(),
      model: String(json.model ?? this.#model),
      usage: {
        inputTokens: json.usage?.input_tokens == null ? null : Number(json.usage.input_tokens),
        outputTokens: json.usage?.output_tokens == null ? null : Number(json.usage.output_tokens),
        totalTokens: json.usage?.total_tokens == null ? null : Number(json.usage.total_tokens),
        cachedInputTokens: json.usage?.input_tokens_details?.cached_tokens == null ? null : Number(json.usage.input_tokens_details.cached_tokens),
      },
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  }
}

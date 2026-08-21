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
      .slice(0, 8)
      .map(x => x.text.replace(/\s+/g, ' ').slice(0, 700))
      .join('\n');

    const instructions = [
      'Eres el redactor closed-book de un vendedor consultivo de STECH PERÚ por chat.',
      'No decides intención, ruta, producto ni fuente: eso ya viene resuelto.',
      'Escribe español peruano natural, breve y comercial; normalmente 1 a 3 frases y máximo una pregunta útil.',
      'Para una ficha general autorizada puedes usar bloques breves con los hechos suministrados, sin convertirla en un manual.',
      'Primero responde lo que el cliente pidió; después, solo si aporta valor, avanza un paso comercial.',
      'Usa SPIN/FAB/LAER únicamente cuando el contexto lo justifique y no repitas datos ya conocidos.',
      'Convierte características verificadas en beneficios ligados a la necesidad real del cliente.',
      'No inventes precio, disponibilidad, garantía, características, políticas, urgencia, escasez, testimonios ni acciones humanas.',
      'Nunca reveles cantidades de stock; solo habla de disponibilidad.',
      'Nunca ofrezcas ni menciones precio si el cliente no lo pidió explícitamente.',
      'No digas UNKNOWN, INTENT, queryTarget, RAG, sistema interno ni lenguaje técnico del backend.',
      'No prometas cotizaciones, reservas, pedidos, correos o llamadas que no estén confirmados como ejecutados.',
      'La evidencia suministrada es la única fuente factual.'
    ].join(' ');

    const body: Record<string, unknown> = {
      model: this.#model,
      instructions,
      input: `CLIENTE:\n${input.message}\n\nINTENCION:${input.intent}\nCONTEXTO_COMERCIAL:${JSON.stringify(compactState)}\nPLAN_AUTORIZADO:${input.deterministicAnswer ?? 'SIN_PLAN'}\nEVIDENCIA_VERIFICADA:\n${evidence || 'SIN_DATO'}`,
    };
    if (/^gpt-5(?:$|[-.])/i.test(this.#model)) body.reasoning = { effort: 'minimal' };

    const response = await this.#fetcher(`${this.#baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    const json: any = await response.json();
    if (json.status === 'incomplete') {
      throw new Error(`OpenAI response incomplete: ${String(json.incomplete_details?.reason ?? 'unknown_reason')}`);
    }

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
    if (!text) throw new Error(`OpenAI response contained no output text (status=${String(json.status ?? 'unknown')})`);

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

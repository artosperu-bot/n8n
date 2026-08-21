import type {
  LlmDecisionInput,
  LlmDecisionResult,
  LlmProvider,
  LlmResult,
  LlmUsage,
  LlmWriteInput,
  TurnDecision,
} from '../../ports/LlmProvider.ts';

type Options = { apiKey: string; model: string; baseUrl?: string; fetcher?: typeof fetch };

function arr(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(v => String(v).trim()).filter(Boolean))] : [];
}
function nullable(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s && s.toLowerCase() !== 'null' ? s : null;
}
function clampConfidence(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}
function normalizeDecision(raw: any): TurnDecision {
  return {
    primaryIntent: nullable(raw?.primaryIntent) ?? 'OTHER',
    secondaryIntents: arr(raw?.secondaryIntents),
    targetProduct: nullable(raw?.targetProduct),
    mentionedProducts: arr(raw?.mentionedProducts),
    referenceType: nullable(raw?.referenceType),
    explicitSwitch: raw?.explicitSwitch === true,
    selectedProduct: nullable(raw?.selectedProduct),
    comparisonProducts: arr(raw?.comparisonProducts),
    attributes: arr(raw?.attributes).map(x => x.toUpperCase()),
    customerNeed: nullable(raw?.customerNeed),
    customerProblem: nullable(raw?.customerProblem),
    priorities: arr(raw?.priorities),
    objection: nullable(raw?.objection),
    commercialStage: nullable(raw?.commercialStage),
    spinContribution: nullable(raw?.spinContribution),
    nextBestAction: nullable(raw?.nextBestAction),
    needsSql: raw?.needsSql === true,
    needsProductRag: raw?.needsProductRag === true,
    needsInstitutionalRag: raw?.needsInstitutionalRag === true,
    confidence: clampConfidence(raw?.confidence),
  };
}

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

  #compactState(state: LlmDecisionInput['state']) {
    return {
      activeProduct: state.activeProduct ?? null,
      queryTarget: state.queryTarget ?? null,
      salientProduct: state.salientProduct ?? null,
      selectedProduct: state.selectedProduct ?? null,
      recommendedProduct: state.recommendedProduct ?? null,
      comparisonProducts: state.comparisonProducts ?? [],
      budget: state.budget ?? null,
      customerType: state.customerType ?? null,
      sector: state.sector ?? null,
      useCase: state.useCase ?? null,
      problem: state.problem ?? null,
      priorities: state.priorities ?? [],
      quantity: state.quantity ?? null,
      invoiceRequired: state.invoiceRequired ?? null,
      objection: state.objection ?? null,
      purchaseSignal: state.purchaseSignal ?? false,
      commercialStage: state.commercialStage ?? null,
      lastIntent: state.lastIntent ?? null,
      lastNba: state.lastNba ?? null,
      lastUserMessage: state.lastUserMessage ?? null,
    };
  }

  #extractText(json: any): string {
    if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();
    for (const item of json.output ?? []) {
      for (const c of item.content ?? []) {
        if (c.type === 'output_text' && c.text) return String(c.text).trim();
      }
    }
    throw new Error(`OpenAI response contained no output text (status=${String(json.status ?? 'unknown')})`);
  }

  #usage(json: any): LlmUsage {
    return {
      inputTokens: json.usage?.input_tokens == null ? null : Number(json.usage.input_tokens),
      outputTokens: json.usage?.output_tokens == null ? null : Number(json.usage.output_tokens),
      totalTokens: json.usage?.total_tokens == null ? null : Number(json.usage.total_tokens),
      cachedInputTokens: json.usage?.input_tokens_details?.cached_tokens == null ? null : Number(json.usage.input_tokens_details.cached_tokens),
    };
  }

  async #responses(body: Record<string, unknown>): Promise<any> {
    if (/^gpt-5(?:$|[-.])/i.test(this.#model)) body.reasoning = { effort: 'minimal' };
    const response = await this.#fetcher(`${this.#baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.#apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    const json: any = await response.json();
    if (json.status === 'incomplete') throw new Error(`OpenAI response incomplete: ${String(json.incomplete_details?.reason ?? 'unknown_reason')}`);
    return json;
  }

  async decide(input: LlmDecisionInput): Promise<LlmDecisionResult> {
    const started = performance.now();
    const instructions = [
      'Eres el analista semantico y comercial de STECH PERU.',
      'Tu tarea es comprender el turno actual usando la memoria resumida: intencion, referentes, necesidad, objecion, etapa comercial, SPIN invisible y mejor siguiente accion N+1.',
      'No inventes hechos de producto, precio, stock, garantia, politicas ni acciones ejecutadas; esos datos se verifican despues con SQL/RAG.',
      'Una mencion de otro producto no implica cambio. Una preferencia de atributo tampoco. Una seleccion explicita si puede cambiar el producto.',
      'Resuelve ese/el otro/el recomendado usando primero la seleccion y saliencia recientes; una recomendacion vieja no debe pisar una seleccion posterior.',
      'Si el producto pedido no existe, marca el producto objetivo pero permite que el sistema busque alternativas reales; el N+1 debe intentar ayudar en vez de terminar en un callejon sin salida.',
      'SPIN es invisible: pregunta solo un dato si realmente puede cambiar la recomendacion y nunca repitas lo ya conocido.',
      'Cuando hay señal fuerte de compra, el N+1 debe avanzar compra/handoff, no reiniciar discovery.',
      'Devuelve SOLO JSON valido, sin markdown ni explicaciones, con exactamente estas claves: primaryIntent, secondaryIntents, targetProduct, mentionedProducts, referenceType, explicitSwitch, selectedProduct, comparisonProducts, attributes, customerNeed, customerProblem, priorities, objection, commercialStage, spinContribution, nextBestAction, needsSql, needsProductRag, needsInstitutionalRag, confidence.'
    ].join(' ');
    const json = await this.#responses({
      model: this.#model,
      instructions,
      input: `CLIENTE:\n${input.message}\n\nMEMORIA_CANONICA:\n${JSON.stringify(this.#compactState(input.state))}`,
    });
    let rawText = this.#extractText(json).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first >= 0 && last > first) rawText = rawText.slice(first, last + 1);
    let parsed: any;
    try { parsed = JSON.parse(rawText); }
    catch { throw new Error('OpenAI semantic decision was not valid JSON'); }
    return {
      decision: normalizeDecision(parsed),
      model: String(json.model ?? this.#model),
      usage: this.#usage(json),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  }

  async write(input: LlmWriteInput): Promise<LlmResult> {
    const started = performance.now();
    const evidence = (input.rag ?? []).slice(0, 8).map(x => x.text.replace(/\s+/g, ' ').slice(0, 700)).join('\n');
    const instructions = [
      'Eres el vendedor consultivo de STECH PERU por chat.',
      'Puedes razonar comercialmente sobre la decision validada: prioriza necesidad real, explica trade-offs, resuelve objeciones, aplica SPIN/FAB/LAER de forma natural y elige una forma humana de avanzar el N+1.',
      'No puedes cambiar hechos ni inventar datos: precio, disponibilidad, garantia, caracteristicas, politicas y acciones solo pueden salir de la evidencia verificada.',
      'Si la evidencia no confirma un dato, dilo de forma breve y util; no completes huecos.',
      'Una respuesta normalmente tiene 1 a 3 frases y maximo una pregunta util. No hagas interrogatorios ni cierres siempre con pregunta.',
      'Demuestra empatia mediante criterio util, no repitiendo Entiendo/Perfecto constantemente.',
      'Convierte caracteristica verificada -> efecto practico -> beneficio solo cuando sea relevante para la necesidad.',
      'Nunca reveles cantidad cruda de stock. Nunca metas precio si no fue solicitado o autorizado por un flujo de cotizacion.',
      'No digas UNKNOWN, INTENT, queryTarget, RAG ni lenguaje interno.',
      'No prometas reservas, pedidos, cotizaciones, correos o llamadas que no esten confirmados como ejecutados.'
    ].join(' ');
    const json = await this.#responses({
      model: this.#model,
      instructions,
      input: `CLIENTE:\n${input.message}\n\nDECISION_VALIDADA:\n${JSON.stringify(input.decision ?? null)}\n\nCONTEXTO_COMERCIAL:\n${JSON.stringify(this.#compactState(input.state))}\n\nPLAN_N1:\n${input.deterministicAnswer ?? 'SIN_PLAN'}\n\nEVIDENCIA_VERIFICADA:\n${evidence || 'SIN_DATO'}`,
    });
    return {
      text: this.#extractText(json),
      model: String(json.model ?? this.#model),
      usage: this.#usage(json),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  }
}

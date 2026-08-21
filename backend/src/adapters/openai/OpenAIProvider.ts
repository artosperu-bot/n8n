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
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))];
}
function nullable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
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
      lastAssistantMessage: state.lastAssistantMessage ?? null,
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
      'Eres el analista conversacional de STECH PERU.',
      'Entiende qué quiere el cliente AHORA usando la historia reciente y la memoria conocida.',
      'No inventes hechos.',
      'Mencionar otro producto no significa cambiar; preferir un atributo tampoco; una selección explícita sí puede cambiar.',
      'No vuelvas a preguntar datos ya conocidos.',
      'Propón el siguiente paso comercial más útil; si el cliente quiere comprar, avanza.',
      'Devuelve SOLO JSON válido con estas claves: primaryIntent, secondaryIntents, targetProduct, mentionedProducts, referenceType, explicitSwitch, selectedProduct, comparisonProducts, attributes, customerNeed, customerProblem, priorities, objection, commercialStage, spinContribution, nextBestAction, needsSql, needsProductRag, needsInstitutionalRag, confidence.',
      'Texto: string o null. Arrays: solo strings. No devuelvas objetos dentro de campos de texto o arrays.'
    ].join(' ');
    const history = (input.history ?? []).slice(-6).map(x => ({ role:x.role, content:x.content }));
    const json = await this.#responses({
      model: this.#model,
      instructions,
      input: `CLIENTE:\n${input.message}\n\nHISTORIA_RECIENTE:\n${JSON.stringify(history)}\n\nMEMORIA_CANONICA:\n${JSON.stringify(this.#compactState(input.state))}`,
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
      'Resuelve primero lo que el cliente pregunta y usa la decisión validada para continuar la venta.',
      'Solo afirma hechos presentes en la evidencia verificada. Si falta un dato, dilo brevemente; no completes huecos.',
      'Responde normalmente en 1 a 3 frases y como máximo una pregunta útil.',
      'Usa SPIN, FAB o manejo de objeciones de forma natural, nunca como etiquetas.',
      'Nunca reveles cantidad cruda de stock ni inventes acciones realizadas.',
      'No uses lenguaje interno como UNKNOWN, INTENT, queryTarget o RAG.'
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

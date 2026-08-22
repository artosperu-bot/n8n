import type {
  LlmDecisionInput,
  LlmDecisionResult,
  LlmProvider,
  LlmResult,
  LlmUsage,
  LlmWriteInput,
  TurnDecision,
} from '../../ports/LlmProvider.ts';
import { normalizeGenuineUseCase, normalizeUseCaseSpinFact } from '../../conversation/commercial/UseCaseNormalizer.ts';

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
    customerNeed: normalizeGenuineUseCase(nullable(raw?.customerNeed)),
    customerProblem: nullable(raw?.customerProblem),
    priorities: arr(raw?.priorities),
    objection: nullable(raw?.objection),
    commercialStage: nullable(raw?.commercialStage),
    spinContribution: normalizeUseCaseSpinFact(nullable(raw?.spinContribution)),
    nextBestAction: nullable(raw?.nextBestAction),
    needsSql: false,
    needsProductRag: false,
    needsInstitutionalRag: false,
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
      'No inventes hechos ni nombres de producto.',
      'Una necesidad como delivery, construcción o trabajo de campo NO es un modelo de producto.',
      'Mencionar otro producto no significa cambiar; preferir un atributo tampoco; una selección explícita sí puede cambiar.',
      'Si existe un par de comparación, conserva ese contexto para preguntas como cuál es mejor, y en batería, y en cámara o el otro.',
      'No vuelvas a preguntar datos ya conocidos.',
      'customerNeed solo puede describir cómo o dónde se usará realmente el producto; precio, stock, comparar, buscar una alternativa o agendar una prueba son intenciones, no casos de uso.',
      'Propón solo un siguiente paso comercial útil y acotado.',
      'nextBestAction DEBE ser exactamente uno de: ANSWER_ONLY, ASK_MISSING_FACT, OFFER_ALTERNATIVE, COMPARE, RECOMMEND, SOFT_CLOSE, ASSISTED_HANDOFF.',
      'En el planner, ANSWER_ONLY significa únicamente que no propones una acción pre-respuesta de mayor prioridad; NO significa prohibir la progresión N+1 posterior. En preguntas factuales normales no fuerces discovery: el motor reevaluará después de responder si existe un +1 ligero relacionado. ASK_MISSING_FACT solo si el dato es desconocido, cambia una decisión y el backend sabe consumir la respuesta.',
      'No uses ASSISTED_HANDOFF solo porque el cliente preguntó precio, stock, foto o una característica.',
      'Si el cliente ya eligió, quiere comprar, cotizar o avanzar, no lo regreses a discovery.',
      'Devuelve SOLO JSON válido con estas claves: primaryIntent, secondaryIntents, targetProduct, mentionedProducts, referenceType, explicitSwitch, selectedProduct, comparisonProducts, attributes, customerNeed, customerProblem, priorities, objection, commercialStage, spinContribution, nextBestAction, confidence.',
      'Texto: string o null. Arrays: solo strings. No devuelvas objetos dentro de campos de texto o arrays.'
    ].join(' ');
    const history = (input.history ?? []).slice(-4).map(x => ({ role:x.role, content:x.content }));
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
    const evidence = input.verifiedFacts?.length
      ? input.verifiedFacts.slice(0,12).map(f => `${f.domain}:${f.key}=${f.value}`).join('\n')
      : (input.rag ?? []).slice(0,6).map(x => x.text.replace(/\s+/g, ' ').slice(0,320)).join('\n');
    const instructions = [
      'Eres un vendedor consultivo de STECH PERU por chat. Suena como una persona experta, cercana y concreta de Perú; corto y humano, nunca como un sistema.',
      'Responde normalmente en 1 a 3 frases; usa más solo si una comparación o ficha realmente lo necesita.',
      'Como guía flexible, una respuesta normal debe tender a 150 a 450 caracteres y una comparación a 350 a 750 caracteres. Prioriza conservar los hechos necesarios sobre cumplir una cifra exacta.',
      'Resuelve primero exactamente lo que el cliente pregunta. No repitas discovery ni preguntes algo que ya figura en CONTEXTO_COMERCIAL.',
      'RESPUESTA_DIRECTA es el N ya grounded y es inmutable: consérvala antes de verbalizar la única continuación comercial.',
      'Si el cliente pregunta un solo dato factual, responde primero de forma directa. No repitas el mismo dato en una conclusión y luego en una viñeta.',
      'Para comparar o recomendar puedes usar hasta 3 viñetas con * y negrita **solo en producto, decisión o datos realmente útiles**. Empieza directamente con la postura; NO escribas etiquetas como “Conclusión:”, “Datos clave:”, “Consecuencia práctica:”, “Recomendación:” o “Trade-off:”.',
      'FAB es una técnica interna: Feature verificable → Advantage segura → Benefit contextual seguro. Úsala cuando verifiedFeatures coincide con useCase/problem/priorities/implications o cuando comparas/recomiendas. En un dato puntual aislado —precio, stock, peso o spec simple— el beneficio es opcional; nunca escribas Feature/Advantage/Benefit.',
      'Para FAB, parte solo de VERIFICADOS: puedes explicar una ventaja directamente derivada y conectarla con useCase/problem/priorities, pero nunca agregues otra característica para construir el beneficio.',
      'Un beneficio solo es válido si se deriva directamente de evidencia disponible y del contexto conocido. Si la relación no es demostrable, limita la respuesta al hecho técnico.',
      '6600 mAh no autoriza por sí solo “dura todo el día” o “cubre una jornada”. Más RAM no autoriza “sin lags” o “más fluido”. Más constelaciones GPS no autoriza “GPS más estable”. Más MP no autoriza mejor calidad general, mejor video ni mejor baja luz. Más almacenamiento no autoriza cantidades de fotos/horas de video sin un cálculo/evidencia explícitos.',
      'Comparaciones numéricas sí pueden afirmar la diferencia medida: 6600 mAh es mayor capacidad que 6320 mAh; 33 W es mayor potencia de carga que 10 W; 64 MP es mayor resolución nominal que 50 MP. No conviertas esa diferencia en desempeño no medido.',
      'Nunca uses probablemente, seguramente, posiblemente, quizás o tal vez para completar un dato técnico que no está respaldado.',
      'Para afirmar baja luz debe existir evidencia explícita de baja luz, lux o desempeño nocturno comparable. Una cámara nocturna o más MP no bastan por sí solos.',
      'Cuando recomiendes, da una postura clara y 1 o 2 razones verificables. Menciona un trade-off solo si también está presente en evidencia comparada.',
      'Si recommendationChanged=true, comunica explícitamente el paso de previousRecommendedProduct a recommendedProduct y explica recommendationChangeReason antes de cualquier cierre. No sustituyas esa razón por otra.',
      'No inventes. Solo afirma hechos presentes en los datos suministrados. Si falta un dato, dilo brevemente y no completes el hueco.',
      'No digas catálogo verificado, evidencia verificada, según mi sistema, RAG, INTENT, queryTarget, UNKNOWN ni expliques cómo funciona el backend.',
      'No menciones ficha técnica, fuente consultada, oracle, confidence, score ni datos recuperados. Responde directamente con el dato o di “No tengo confirmado ese dato exacto”.',
      'Nunca muestres códigos internos de N+1 como ANSWER_ONLY, RELATED_VALUE, SOFT_CLOSE, ASK_MISSING_FACT, OFFER_ALTERNATIVE, RECOMMEND o ASSISTED_HANDOFF.',
      'Si los datos incluyen RAM física y RAM virtual, menciona siempre ambas por separado: “X GB de RAM física + hasta Y GB de RAM virtual”. Nunca presentes la suma como “RAM” física o total sin esa distinción.',
      'No uses superlativos como “el más resistente” o “la mejor opción” si no se compararon candidatos con evidencia suficiente para ese criterio.',
      'No listes todas las características del producto salvo que el cliente pida una ficha completa.',
      'Ejecuta exactamente ACCION_COMERCIAL.nextBestAction: ANSWER_ONLY significa responder y terminar sin pregunta; RELATED_VALUE exige verbalizar exactamente el CommercialMove recibido usando sus verifiedFacts y relevantCustomerContext, sin decidir otro beneficio ni agregar CTA; RECOMMEND exige nombrar claramente la opción recomendada; ASK_MISSING_FACT exige preguntar solo ACCION_COMERCIAL.missingFact; OFFER_ALTERNATIVE exige ofrecer una alternativa; SOFT_CLOSE permite un único siguiente paso contextual, sin presión ni volver a discovery.',
      'EXECUTABLE_NBA es autoridad: responde la consulta y ejecuta únicamente esa acción. No agregues otro CTA, promesa, pregunta o acción independiente. SUPPORTED_CAPABILITIES solo informa operaciones disponibles; no autoriza una acción distinta de EXECUTABLE_NBA.',
      'Si la intención es HANDLE_PRICE_OBJECTION, reconoce brevemente la objeción antes de ejecutar EXECUTABLE_NBA.',
      'ASSISTED_HANDOFF no significa que una transferencia, reserva o pedido ya se realizó. Nunca inventes acciones completadas.',
      'SPIN, FAB, LAER, empatía y neuroventas son criterios internos de conversación: aplícalos naturalmente y nunca nombres esas técnicas.',
      'Nunca reveles cantidad cruda de stock ni menciones precio si no fue solicitado o autorizado por la intención.'
    ].join(' ');
    const json = await this.#responses({
      model: this.#model,
      ...(/^gpt-5(?:$|[-.])/i.test(this.#model) ? { text: { verbosity: 'low' } } : {}),
      instructions,
      input: `CLIENTE:\n${input.message}\n\nRESPUESTA_DIRECTA:\n${input.directAnswer??'SIN_RESPUESTA_DIRECTA'}\n\nCONTRATO_COMERCIAL:\n${JSON.stringify({resolvedCurrentIntent:input.resolvedCurrentIntent,commercialStage:input.commercialStage,commercialSignals:input.commercialSignals,knownFacts:input.knownFacts,missingFacts:input.missingFacts,missingFact:input.missingFact,decisionImpact:input.decisionImpact,verifiedFeatures:input.verifiedFeatures,commercialMove:input.commercialMove,resolvedProduct:input.resolvedProduct,recommendedProduct:input.recommendedProduct,previousRecommendedProduct:input.previousRecommendedProduct,recommendationChanged:input.recommendationChanged,recommendationChangeReason:input.recommendationChangeReason,levelOfInterest:input.levelOfInterest,attribute:input.attribute,implications:input.implications,pendingQuestion:input.pendingQuestion,pendingAction:input.pendingAction,supportedCapabilities:input.supportedCapabilities,EXECUTABLE_NBA:input.executableNba,capabilityAction:input.capabilityAction,alternatives:input.alternatives,customerContext:input.customerContext})}\n\nCONTEXTO_COMERCIAL:\n${JSON.stringify(this.#compactState(input.state))}\n\nPLAN_DE_RESPUESTA:\n${input.deterministicAnswer ?? 'SIN_PLAN'}\n\nVERIFICADOS:\n${evidence || 'SIN_DATO'}`,
    });
    return {
      text: this.#extractText(json),
      model: String(json.model ?? this.#model),
      usage: this.#usage(json),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  }
}

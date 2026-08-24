import type { CommercialResponseMode, CommercialResponsePlan, LlmWriteInput } from '../../ports/LlmProvider.ts';

const FORBIDDEN_CLAIMS = [
  'UNVERIFIED_FACT',
  'FAKE_SCARCITY',
  'FAKE_URGENCY',
  'INVENTED_SOCIAL_PROOF',
  'UNSUPPORTED_PERFORMANCE',
  'UNAUTHORIZED_ACTION',
] as const;

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
}

function exactNba(input: LlmWriteInput): string {
  return String(input.finalExecutableNba ?? input.executableNba ?? input.nextBestAction ?? 'ANSWER_ONLY').toUpperCase();
}

function responseMode(input: LlmWriteInput, nba: string): CommercialResponseMode {
  const intent = String(input.resolvedCurrentIntent ?? input.intent ?? '').toUpperCase();
  const strategy = String(input.state?.commercialStrategy ?? '').toUpperCase();
  const hasGenuineContext = Boolean(
    input.useCase
    || input.problem
    || (input.priorities?.length ?? 0) >= 2
    || (input.implications?.length ?? 0) > 0
  );
  const hasContextualMove = input.commercialMove?.kind === 'CONTEXTUAL_BENEFIT';
  const hasVerifiedFeatures = (input.verifiedFeatures?.length ?? 0) > 0;

  if (nba === 'ASSISTED_HANDOFF') return 'HANDOFF';
  if (
    input.purchaseSignal === true
    || intent === 'PURCHASE'
    || nba === 'COLLECT_RESERVATION_DATA'
    || nba === 'EXECUTE_RESERVATION'
  ) return 'PURCHASE_PROGRESS';
  if (intent === 'HANDLE_PRICE_OBJECTION' || strategy === 'LAER' || Boolean(input.objection)) return 'OBJECTION_LAER';
  if (intent === 'COMPARE' || strategy === 'ELECCION_GUIADA') return 'GUIDED_CHOICE';
  if (nba === 'ASK_MISSING_FACT') return 'DISCOVERY_SPIN';
  if (nba === 'SOFT_CLOSE') return 'SOFT_CLOSE';
  if (hasContextualMove || (strategy === 'FAB_SPIN' && hasVerifiedFeatures && hasGenuineContext)) return 'CONTEXTUAL_FAB';
  return 'FACTUAL_DIRECT';
}

export function buildCommercialResponsePlan(input: LlmWriteInput, factualCore: string): CommercialResponsePlan {
  const nba = exactNba(input);
  const mode = responseMode(input, nba);
  const contextFocus = unique([
    input.useCase,
    input.problem,
    ...(input.priorities ?? []),
    input.objection,
  ]).slice(0, 5);
  const maxQuestions: 0 | 1 = ['ASK_MISSING_FACT', 'SOFT_CLOSE', 'COLLECT_RESERVATION_DATA'].includes(nba) ? 1 : 0;

  // prepareCommercialWriteInput() has already reduced the requested action to a
  // capability-compatible executable NBA. The response planner may expose that
  // exact action to the writer, but it never creates an additional action.
  const allowedActions = nba === 'ANSWER_ONLY' ? [] : [nba];

  return {
    mode,
    strategy: String(input.state?.commercialStrategy ?? '').trim() || null,
    shouldUseLlm: !['FACTUAL_DIRECT', 'HANDOFF'].includes(mode),
    acknowledgeContext: contextFocus.length > 0 && mode !== 'FACTUAL_DIRECT',
    contextFocus,
    factualCore: String(factualCore ?? '').trim(),
    exactNba: nba,
    maxQuestions,
    allowedActions,
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
  };
}

export function buildCommercialResponseInstruction(plan: CommercialResponsePlan): string {
  const context = plan.contextFocus.length ? plan.contextFocus.join('; ') : 'sin contexto adicional';
  const action = plan.exactNba === 'ANSWER_ONLY' ? 'termina después de responder' : `ejecuta únicamente ${plan.exactNba}`;
  const safety = 'No inventes escasez, urgencia, popularidad, prueba social, rendimiento, precio, stock ni capacidades.';

  if (plan.mode === 'DISCOVERY_SPIN') {
    return `Conserva RESPUESTA_DIRECTA. Pregunta solo el dato faltante autorizado y como máximo una pregunta; no repitas información ya conocida. ${action}. ${safety}`;
  }
  if (plan.mode === 'CONTEXTUAL_FAB') {
    return `Conserva RESPUESTA_DIRECTA sin cambiar sus hechos. Demuestra que el contexto conocido cambia el criterio relevante (${context}). Conecta únicamente el hecho verificado actual con un efecto práctico seguro y un beneficio ligado a esa necesidad; no agregues otra característica. ${action}. ${safety}`;
  }
  if (plan.mode === 'GUIDED_CHOICE') {
    return `Conserva los hechos de RESPUESTA_DIRECTA. Reduce el esfuerzo de decisión usando solo 2 a 4 diferencias verificadas y prioriza el contexto conocido (${context}). Recomienda solo si la evidencia sustenta una opción. ${action}. ${safety}`;
  }
  if (plan.mode === 'OBJECTION_LAER') {
    return `Conserva RESPUESTA_DIRECTA. Reconoce primero la objeción real sin repetir literalmente al cliente; responde con hechos verificados y contexto conocido (${context}), y luego ${action}. No seas defensivo ni presiones. ${safety}`;
  }
  if (plan.mode === 'SOFT_CLOSE') {
    return `Conserva RESPUESTA_DIRECTA. Usa el contexto conocido (${context}) para explicar brevemente por qué encaja y realiza solo un cierre suave autorizado; no vuelvas a discovery. ${action}. ${safety}`;
  }
  if (plan.mode === 'PURCHASE_PROGRESS') {
    return `Conserva RESPUESTA_DIRECTA y el producto ya elegido. Reduce fricción, no reinicies discovery y pide solo el dato indispensable que la acción autorizada requiera. ${action}. ${safety}`;
  }
  if (plan.mode === 'HANDOFF') {
    return `Conserva RESPUESTA_DIRECTA y deriva solo si la acción ya está autorizada; no afirmes que la transferencia o reserva ya ocurrió. ${action}. ${safety}`;
  }
  return `Conserva RESPUESTA_DIRECTA y termina sin discovery, recomendación ni CTA adicional. ${safety}`;
}

export function hasFabricatedCommercialPressure(text: string): boolean {
  const normalized = String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fakeScarcity = /\b(?:quedan?|hay)\s+(?:muy\s+)?(?:pocas?|poquisimas?|ultimas?)\s+(?:unidades?|equipos?)\b|\bultimas?\s+(?:unidades?|equipos?)\b/.test(normalized);
  const fakeUrgency = /\b(?:aprovecha|compra|decide|separa)\s+(?:hoy|ahora|ya)\b|\bsolo\s+por\s+hoy\b|\bultima\s+oportunidad\b|\bse\s+acaba\s+hoy\b/.test(normalized);
  const fakeSocialProof = /\b(?:todos?|muchos\s+clientes?)\s+(?:lo|la|los|las)?\s*(?:compran|estan\s+comprando|prefieren|eligen)\b|\b(?:el|la)\s+mas\s+vendid[oa]\b/.test(normalized);
  return fakeScarcity || fakeUrgency || fakeSocialProof;
}

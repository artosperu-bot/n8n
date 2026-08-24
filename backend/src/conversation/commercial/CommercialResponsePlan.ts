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

function authorizedActionInstruction(exactNba: string): string {
  if (exactNba === 'ANSWER_ONLY') return 'termina después de responder';
  if (exactNba === 'RELATED_VALUE') return 'añade solo el valor relacionado ya autorizado, sin CTA adicional';
  if (exactNba === 'ASK_MISSING_FACT') return 'formula únicamente la pregunta SPIN faltante ya autorizada';
  if (exactNba === 'OFFER_ALTERNATIVE') return 'ofrece solo la alternativa ya autorizada';
  if (exactNba === 'COMPARE') return 'presenta solo la comparación autorizada';
  if (exactNba === 'RECOMMEND') return 'verbaliza únicamente la recomendación ya autorizada';
  if (exactNba === 'SOFT_CLOSE') return 'haz una sola pregunta breve para revisar disponibilidad; no ofrezcas reserva, pago, color, envío ni otra acción en la misma pregunta';
  if (exactNba === 'COLLECT_RESERVATION_DATA') return 'solicita únicamente el dato de reserva que falta';
  if (exactNba === 'EXECUTE_RESERVATION') return 'continúa únicamente con el paso de reserva autorizado, sin afirmar éxito antes de confirmación';
  if (exactNba === 'ASSISTED_HANDOFF') return 'ofrece solo la derivación humana autorizada';
  return 'realiza únicamente la acción ya autorizada';
}

export function buildCommercialResponseInstruction(plan: CommercialResponsePlan): string {
  const context = plan.contextFocus.length ? plan.contextFocus.join('; ') : 'sin contexto adicional';
  const action = authorizedActionInstruction(plan.exactNba);
  const safety = 'No inventes escasez, urgencia, popularidad, prueba social, rendimiento, precio, stock ni capacidades.';

  if (plan.mode === 'DISCOVERY_SPIN') {
    return `Conserva RESPUESTA_DIRECTA. SPIN y N+1 son capas distintas: responde primero lo actual y luego formula solo la pregunta faltante autorizada, como máximo una. No preguntes presupuesto salvo que ese sea exactamente el dato faltante; no repitas situación, problema o prioridad ya conocidos. ${action}. ${safety}`;
  }
  if (plan.mode === 'CONTEXTUAL_FAB') {
    return `Conserva RESPUESTA_DIRECTA sin cambiar sus hechos. Demuestra que el contexto conocido cambia el criterio relevante (${context}). Conecta únicamente el hecho verificado actual con un efecto práctico seguro y un beneficio ligado a esa necesidad; no agregues otra característica ni un CTA si no está autorizado. ${action}. ${safety}`;
  }
  if (plan.mode === 'GUIDED_CHOICE') {
    return `Conserva los hechos de RESPUESTA_DIRECTA. Reduce el esfuerzo de decisión usando solo 2 a 4 diferencias verificadas y prioriza el contexto conocido (${context}). Recomienda solo si la evidencia sustenta una opción y no inventes trade-offs. ${action}. ${safety}`;
  }
  if (plan.mode === 'OBJECTION_LAER') {
    return `Conserva RESPUESTA_DIRECTA. Reconoce el precio de forma humana, por ejemplo que se sale de lo que esperaba, sin decir “entiendo la objeción” ni repetir literalmente al cliente. Responde con hechos verificados y contexto conocido (${context}), y luego ${action}. No mezcles alternativa y cierre en el mismo turno salvo que la acción lo autorice. No seas defensivo ni presiones. ${safety}`;
  }
  if (plan.mode === 'SOFT_CLOSE') {
    return `Conserva RESPUESTA_DIRECTA. Usa el contexto conocido (${context}) para explicar brevemente por qué encaja y ejecuta un solo +1: una pregunta breve de disponibilidad. No vuelvas a discovery y no combines stock con reserva, pago, color, envío u otra opción. ${action}. ${safety}`;
  }
  if (plan.mode === 'PURCHASE_PROGRESS') {
    return `Conserva RESPUESTA_DIRECTA y el producto ya elegido. Reduce fricción, no reinicies discovery y pide solo el dato indispensable que la acción autorizada requiera. Interés no equivale a compra; esta modalidad solo se usa cuando purchaseSignal ya fue autorizado. ${action}. ${safety}`;
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

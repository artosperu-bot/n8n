import type { CommercialResponseMode, CommercialResponsePlan, LlmWriteInput } from '../../ports/LlmProvider.ts';

const FORBIDDEN_CLAIMS = [
  'UNVERIFIED_FACT',
  'FAKE_SCARCITY',
  'FAKE_URGENCY',
  'INVENTED_SOCIAL_PROOF',
  'UNSUPPORTED_PERFORMANCE',
  'UNAUTHORIZED_ACTION',
] as const;

const SIMPLE_HUMAN_LANGUAGE = 'Usa lenguaje cotidiano y palabras simples que cualquier cliente entienda. Evita jerga interna o palabras técnicas si puedes decirlo de forma común: di batería en vez de autonomía cuando no haga falta el término técnico, quedarse sin celular o perder horas en vez de interrupción operativa, y golpes/agua/polvo antes que recitar certificaciones si el cliente no las pidió.';
const GROUNDED_PAIN_EMPATHY = 'Si el cliente contó un problema o una consecuencia real, háblale como una persona que aterriza la situación: no digas “te entiendo”, “ahí duele”, “y ahí está el verdadero problema”, “el verdadero problema es”, “lo siento, eso es frustrante” ni frases parecidas. Usa como máximo una mini-escena cotidiana breve basada solo en lo que ya contó: una caída en plena jornada, quedarse buscando cargador a media tarde, volver a pagar otra reparación o estar pendiente del agua/polvo. No inventes que te pasó a ti, a un amigo, a otros clientes ni digas “nos suele pasar” sin evidencia explícita.';
const NATURAL_NEUROSALES = 'Aplica persuasión de forma natural y sin nombrarla: haz fácil imaginar el problema cotidiano y el alivio de resolverlo, contrasta seguir con la misma molestia frente a usar un equipo adecuado y traduce cada hecho técnico elegido a una ventaja práctica. No uses miedo exagerado, urgencia falsa ni presión.';

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

function hasVerifiedPriceAndStock(input:LlmWriteInput):boolean{
  return input.quote?.price!=null&&input.quote?.stock!=null;
}

function closePurpose(input:LlmWriteInput,nba:string):CommercialResponsePlan['closePurpose']{
  if(nba!=='SOFT_CLOSE')return null;
  const intent=String(input.resolvedCurrentIntent??input.intent??'').toUpperCase();
  const priorClose=String(input.state?.pendingCommercialAction??input.state?.lastNba??'').toUpperCase()==='SOFT_CLOSE';
  if(intent==='FULFILLMENT_SELECTION'&&priorClose)return'RESERVATION';
  if(intent==='POLICY'&&priorClose)return'FULFILLMENT_RESUME';
  if(['PRICE','PRICE_AVAILABILITY','STOCK'].includes(intent))return'FULFILLMENT';
  if(['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent))return hasVerifiedPriceAndStock(input)?'FULFILLMENT':'PRICE_AVAILABILITY';
  return'FULFILLMENT';
}

export function buildCommercialResponsePlan(input: LlmWriteInput, factualCore: string): CommercialResponsePlan {
  const nba = exactNba(input);
  const mode = responseMode(input, nba);
  const intent = String(input.resolvedCurrentIntent ?? input.intent ?? '').toUpperCase();
  const contextFocus = unique([
    input.useCase,
    input.problem,
    ...(input.implications ?? []),
    ...(input.priorities ?? []),
    input.objection,
  ]).slice(0, 6);
  const maxQuestions: 0 | 1 = ['ASK_MISSING_FACT', 'SOFT_CLOSE', 'COLLECT_RESERVATION_DATA'].includes(nba) ? 1 : 0;
  const allowedActions = nba === 'ANSWER_ONLY' ? [] : [nba];
  const shouldUseLlm = mode !== 'HANDOFF'
    && (mode !== 'FACTUAL_DIRECT' || intent === 'PRODUCT_INFO');

  return {
    mode,
    strategy: String(input.state?.commercialStrategy ?? '').trim() || null,
    shouldUseLlm,
    acknowledgeContext: contextFocus.length > 0 && mode !== 'FACTUAL_DIRECT',
    contextFocus,
    factualCore: String(factualCore ?? '').trim(),
    exactNba: nba,
    closePurpose:closePurpose(input,nba),
    maxQuestions,
    allowedActions,
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
  };
}

function authorizedActionInstruction(plan:CommercialResponsePlan): string {
  const exactNba=plan.exactNba;
  if (exactNba === 'ANSWER_ONLY') return 'termina después de responder';
  if (exactNba === 'RELATED_VALUE') return 'añade solo el valor relacionado ya autorizado, sin CTA adicional';
  if (exactNba === 'ASK_MISSING_FACT') return 'formula únicamente la pregunta SPIN faltante ya autorizada';
  if (exactNba === 'OFFER_ALTERNATIVE') return 'ofrece solo la alternativa ya autorizada';
  if (exactNba === 'COMPARE') return 'presenta solo la comparación autorizada';
  if (exactNba === 'RECOMMEND') return 'verbaliza únicamente la recomendación ya autorizada';
  if (exactNba === 'SOFT_CLOSE'&&plan.closePurpose==='PRICE_AVAILABILITY') return 'haz una sola pregunta breve para confirmar si quiere que revises precio y disponibilidad';
  if (exactNba === 'SOFT_CLOSE'&&plan.closePurpose==='RESERVATION') return 'haz una sola pregunta breve para saber si quiere que le reserves el equipo';
  if (exactNba === 'SOFT_CLOSE'&&plan.closePurpose==='FULFILLMENT_RESUME') return 'vuelve a una sola pregunta breve para que elija entre envío y recogerlo en el local';
  if (exactNba === 'SOFT_CLOSE') return 'haz una sola pregunta breve para que elija entre envío y recogerlo en el local';
  if (exactNba === 'COLLECT_RESERVATION_DATA') return 'solicita únicamente el dato de reserva que falta';
  if (exactNba === 'EXECUTE_RESERVATION') return 'continúa únicamente con el paso de reserva autorizado, sin afirmar éxito antes de confirmación';
  if (exactNba === 'ASSISTED_HANDOFF') return 'ofrece solo la derivación humana autorizada';
  return 'realiza únicamente la acción ya autorizada';
}

export function buildCommercialResponseInstruction(plan: CommercialResponsePlan): string {
  const context = plan.contextFocus.length ? plan.contextFocus.join('; ') : 'sin contexto adicional';
  const action = authorizedActionInstruction(plan);
  const safety = 'No inventes escasez, urgencia, popularidad, prueba social, rendimiento, precio, stock ni capacidades.';

  if (plan.mode === 'DISCOVERY_SPIN') {
    return `Conserva los hechos de RESPUESTA_DIRECTA, pero no la conviertas en una ficha técnica. Responde primero lo actual y luego formula solo la pregunta faltante autorizada, como máximo una. No preguntes presupuesto salvo que ese sea exactamente el dato faltante; no repitas situación, problema, consecuencia o prioridad ya conocidos. Si ya existe una consecuencia en el contexto (${context}), no vuelvas a preguntarla. ${SIMPLE_HUMAN_LANGUAGE} ${GROUNDED_PAIN_EMPATHY} No completes por tu cuenta el dato que realmente falte. ${action}. ${safety}`;
  }
  if (plan.mode === 'CONTEXTUAL_FAB') {
    return `Usa RESPUESTA_DIRECTA solo como fuente de hechos: no necesitas repetirla completa. Elige como máximo 1 o 2 hechos verificados que realmente ayuden al caso (${context}). ${SIMPLE_HUMAN_LANGUAGE} ${GROUNDED_PAIN_EMPATHY} ${NATURAL_NEUROSALES} Primero aterriza la situación en una frase humana si aporta; después explica qué cambia en la vida real y por qué ese producto ayuda. No uses frases como “el verdadero problema”, “la necesidad principal” o “reduce el riesgo de interrupciones”; dilo como hablaría un vendedor normal. No agregues características que no tengan relación con lo que contó ni inventes un CTA. ${action}. ${safety}`;
  }
  if (plan.mode === 'GUIDED_CHOICE') {
    return `Conserva los hechos de RESPUESTA_DIRECTA. ${SIMPLE_HUMAN_LANGUAGE} Reduce el esfuerzo de decisión usando solo 2 a 4 diferencias verificadas y prioriza el contexto conocido (${context}). Explica qué cambia en la vida real, no solo qué especificación es mayor. Recomienda solo si la evidencia sustenta una opción y no inventes trade-offs. ${action}. ${safety}`;
  }
  if (plan.mode === 'OBJECTION_LAER') {
    return `Conserva RESPUESTA_DIRECTA. ${SIMPLE_HUMAN_LANGUAGE} Atiende exactamente la objeción, duda o preocupación que expresó el cliente; no la conviertas en objeción de precio si no habló de precio. Reconócela brevemente sin decir “te entiendo” ni “lo siento”, y responde primero con evidencia verificada relevante para esa preocupación. Si ayuda, usa una sola escena cotidiana basada en el contexto (${context}), sin inventar experiencias personales. Después ${action}. Si la acción es ANSWER_ONLY, termina ahí sin otra pregunta. No mezcles alternativa y cierre salvo autorización explícita, no seas defensivo ni presiones. ${safety}`;
  }
  if (plan.mode === 'SOFT_CLOSE') {
    if(plan.closePurpose==='PRICE_AVAILABILITY'){
      return `Usa RESPUESTA_DIRECTA solo como fuente de hechos, no como texto para recitar. Ya hay suficiente contexto para avanzar (${context}); no vuelvas a SPIN. ${SIMPLE_HUMAN_LANGUAGE} ${GROUNDED_PAIN_EMPATHY} ${NATURAL_NEUROSALES} Haz visible una mini-escena humana solo si existe dolor real, conecta como máximo 1 o 2 hechos verificados con lo que el cliente vive y explica el beneficio en palabras normales. No hagas una ficha técnica. Después ejecuta un solo +1: ${action}. Todavía no inventes ni muestres precio o stock si SQL no fue consultado. ${safety}`;
    }
    if(plan.closePurpose==='RESERVATION'){
      return `Confirma primero la modalidad de entrega o recojo que el cliente acaba de elegir. ${SIMPLE_HUMAN_LANGUAGE} No vuelvas a consultar política institucional, stock, disponibilidad, uso ni presupuesto. Después ejecuta un solo +1: ${action}. La pregunta debe sonar natural, por ejemplo “¿Quieres que te lo reserve?”. No pidas DNI, dirección de compra ni pago todavía. ${safety}`;
    }
    if(plan.closePurpose==='FULFILLMENT_RESUME'){
      return `Responde primero la política consultada con la evidencia institucional disponible. No cambies la etapa comercial y no conviertas la pregunta de política en una elección que el cliente no hizo. No repitas precio ni stock, no vuelvas a discovery y no preguntes datos que el cliente ya dio. Después ${action}. ${SIMPLE_HUMAN_LANGUAGE} ${safety}`;
    }
    return `Da el resultado comercial completo en este mismo mensaje. Si existe dolor/contexto (${context}), ${GROUNDED_PAIN_EMPATHY} ${NATURAL_NEUROSALES} Usa como máximo 1 o 2 hechos relevantes, no una ficha técnica. Incluye el precio y la disponibilidad/stock ya verificados juntos; no esperes a que el cliente los pregunte ni le preguntes si quiere conocerlos. ${SIMPLE_HUMAN_LANGUAGE} Después ejecuta un solo +1: ${action}. La pregunta debe sonar natural, por ejemplo “¿Prefieres envío o recogerlo en nuestro local?”. No ofrezcas reserva, pago ni pidas datos en este mismo turno. ${safety}`;
  }
  if (plan.mode === 'PURCHASE_PROGRESS') {
    return `Conserva RESPUESTA_DIRECTA y el producto ya elegido. ${SIMPLE_HUMAN_LANGUAGE} Reduce fricción, sé breve y natural, no reinicies discovery y pide solo el dato indispensable que la acción autorizada requiera. Interés no equivale a compra; esta modalidad solo se usa cuando purchaseSignal ya fue autorizado. ${action}. ${safety}`;
  }
  if (plan.mode === 'HANDOFF') {
    return `Conserva RESPUESTA_DIRECTA y deriva solo si la acción ya está autorizada; no afirmes que la transferencia o reserva ya ocurrió. ${action}. ${safety}`;
  }
  return `Conserva RESPUESTA_DIRECTA y termina sin discovery, recomendación ni CTA adicional. Responde con lenguaje cotidiano y directo; para una pregunta factual simple no inventes una historia emocional. ${safety}`;
}

export function hasFabricatedCommercialPressure(text: string): boolean {
  const normalized = String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fakeScarcity = /\b(?:quedan?|hay)\s+(?:muy\s+)?(?:pocas?|poquisimas?|ultimas?)\s+(?:unidades?|equipos?)\b|\bultimas?\s+(?:unidades?|equipos?)\b/.test(normalized);
  const fakeUrgency = /\b(?:aprovecha|compra|decide|separa)\s+(?:hoy|ahora|ya)\b|\bsolo\s+por\s+hoy\b|\bultima\s+oportunidad\b|\bse\s+acaba\s+hoy\b/.test(normalized);
  const fakeSocialProof = /\b(?:todos?|muchos\s+clientes?)\s+(?:lo|la|los|las)?\s*(?:compran|estan\s+comprando|prefieren|eligen)\b|\b(?:el|la)\s+mas\s+vendid[oa]\b/.test(normalized);
  const fakePersonalAnecdote = /\b(?:a\s+mi\s+me\s+paso|me\s+ha\s+pasado\s+lo\s+mismo|yo\s+tambien\s+(?:pase|tuve)|a\s+un\s+amigo\s+mio|un\s+amigo\s+mio|nos\s+suele\s+pasar|nos\s+pasa\s+mucho)\b/.test(normalized);
  return fakeScarcity || fakeUrgency || fakeSocialProof || fakePersonalAnecdote;
}

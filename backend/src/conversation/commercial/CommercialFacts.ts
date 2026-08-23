import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';
import { normalizeGenuineUseCase, normalizeUseCaseSpinFact } from './UseCaseNormalizer.ts';

export type CommercialFacts = Pick<ConversationState,
  'customerType' | 'sector' | 'useCase' | 'problem' | 'priorities' | 'quantity' | 'invoiceRequired' | 'objection' | 'interestSignal' | 'purchaseSignal' | 'spinFacts'
>;

const PRIORITIES: Array<[string, RegExp]> = [
  ['resistencia', /\b(resistente|resistencia|caida|caidas|golpe|golpes|ip68|ip69k|rugged)\b/],
  ['bateria', /\b(bateria|autonomia|cargar|carga)\b/],
  ['camara', /\b(camara|foto|fotos|video|vision\s+nocturna)\b/],
  ['rendimiento', /\b(rapido|rendimiento|procesador|ram|multitarea)\b/],
  ['conectividad', /\b(nfc|5g|4g|wifi|bluetooth|gps|datos)\b/],
  ['precio', /\b(precio|presupuesto|economico|barato|caro)\b/],
];

function unique(values: string[]): string[] { return [...new Set(values)]; }

function hasStrongPurchaseSignal(text: string): boolean {
  return /\bquiero\s+(?:avanzar(?:\s+con\s+la\s+compra)?|compr(?:ar|arlo|arla)?|ese|esa|este|esta)\b/.test(text)
    || /\b(?:ya\s+)?(?:ese|esa|este|esta)\s+quiero\b/.test(text)
    || /\bme\s+quedo\s+con\s+(?:ese|esa|este|esta)\b/.test(text)
    || /\bme\s+llevo(?:\s+(?:ese|esa|este|esta))?\b/.test(text)
    || /\bme\s+(?:he\s+)?decidi(?:\s+por\s+(?:ese|esa|este|esta))?\b/.test(text)
    || /\b(?:lo|la)\s+(?:quiero|compro)\b/.test(text)
    || /\bcomo\s+compro\b/.test(text)
    || /\b(?:separar|reservar)(?:lo|la)?\b/.test(text)
    || /\bquiero\s+(?:q|que)\s+(?:un\s+)?asesor\s+(?:siga|continue|continúe|me\s+ayude)(?:\s+con\s+la\s+compra)?\b/.test(text)
    || /\b(?:hablemos|hablar)\s+(?:para|de)\s+compr/.test(text);
}

function isShortAffirmative(text:string):boolean {
  const clean=fold(text).replace(/[.!¡¿?]+/g,'').replace(/\s+/g,' ').trim();
  if(!clean||clean.split(' ').length>4)return false;
  return /^(?:si|dale|ok|okay|claro|de acuerdo|vamos|avancemos|quiero|listo|hazlo|hagamoslo)$/.test(clean);
}

function confirmsPriorPurchaseStep(message:string,previous:ConversationState):boolean {
  if(!isShortAffirmative(message))return false;
  const lastIntent=String(previous.lastIntent??'').toUpperCase();
  const lastNba=String(previous.lastNba??previous.pendingCommercialAction??'').toUpperCase();
  if(lastIntent!=='STOCK'||lastNba!=='SOFT_CLOSE')return false;
  const prompt=fold(previous.lastAssistantMessage??'');
  return /\bquieres\b[^?]{0,70}\b(?:avanzar|seguir|continuar|comprar|reservar|separar)\b/.test(prompt)
    || /\b(?:avanzamos|seguimos|continuamos)\b[^?]{0,45}\b(?:modelo|compra|reserva)?\b/.test(prompt);
}

function hasInterestSignal(text:string):boolean {
  return /\b(?:me\s+interesa|estoy\s+interesad[oa]|me\s+interesaria|podria\s+interesarme)\b/.test(text)
    || hasStrongPurchaseSignal(text);
}

function explicitBudgetRecommendation(text:string):boolean {
  const asksRecommendation=/\b(?:que|cual)\s+me\s+(?:recomiendas?|conviene)|\brecomiend(?:a|ame|as|an)\b/.test(text);
  const hasBudget=/\b(?:presupuesto|maximo|tope|hasta|menos\s+de|no\s+mas\s+de)\b[^.!?]{0,30}(?:s\s*\/\s*)?\d|(?:s\s*\/\s*)?\d[^.!?]{0,30}\b(?:maximo|tope|presupuesto)\b/.test(text);
  return asksRecommendation&&hasBudget;
}

export function extractCommercialFacts(message: string, previous: ConversationState): CommercialFacts {
  const t = fold(message);
  const business = /\b(empresa|corporativo|institucion|negocio|ruc|factura|tecnicos|personal|equipo\s+de\s+trabajo)\b/.test(t);
  const customerType = business ? 'BUSINESS' : (previous.customerType ?? null);

  const quantityMatch = t.match(/\b([1-9][0-9]{0,3})\s*(?:unidades|equipos|celulares|telefonos|tecnicos|trabajadores|personas)\b/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : (previous.quantity ?? null);

  let sector = previous.sector ?? null;
  if (/\bconstruccion\b/.test(t)) sector = 'construccion';
  else if (/\b(mineria|minero)\b/.test(t)) sector = 'mineria';
  else if (/\b(logistica|almacen|reparto|delivery)\b/.test(t)) sector = 'logistica';
  else if (/\b(seguridad|vigilancia)\b/.test(t)) sector = 'seguridad';
  else if (/\bcampo\b/.test(t)) sector = 'trabajo_campo';

  let useCase = normalizeGenuineUseCase(previous.useCase);
  if (/\bdelivery\b|\brepart(?:o|idor|iendo)\b/.test(t)) useCase = 'delivery';
  else if (/\btrabaj(?:o|an|amos)\s+en\s+campo\b/.test(t)) useCase = 'trabajo_en_campo';
  else if (/\buso\s+diario\b/.test(t)) useCase = 'uso_diario';
  else if (/\btrabajo\b/.test(t)) useCase = 'trabajo';

  let problem = previous.problem ?? null;
  if (/\b(se\s+me|se\s+les|se)\s+cae[n]?\b|\bcaidas\b/.test(t)) problem = 'caidas_frecuentes';
  else if (/\bbateria\b[^.!?]{0,50}\b(se\s+acaba|no\s+aguanta|dura\s+poco)\b|\bcasi\s+no\s+tengo\s+donde\s+cargar/.test(t)) problem = 'autonomia_insuficiente';
  else if (/\bse\s+rompe[n]?\b|\bfragil/.test(t)) problem = 'durabilidad';

  const priorities = unique([...(previous.priorities ?? []), ...PRIORITIES.filter(([, rx]) => rx.test(t)).map(([key]) => key), ...(explicitBudgetRecommendation(t)?['precio']:[])]);
  const invoiceRequired = /\bfactura\b|\bruc\b/.test(t) ? true : (previous.invoiceRequired ?? null);
  const objection = /\b(muy\s+caro|esta\s+caro|se\s+me\s+hace\s+caro|sale\s+de\s+mi\s+presupuesto|mas\s+barato)\b/.test(t)
    ? 'precio'
    : (previous.objection ?? null);
  const contextualPurchaseConfirmation=confirmsPriorPurchaseStep(message,previous);
  const purchaseSignal = hasStrongPurchaseSignal(t) || contextualPurchaseConfirmation
    ? true
    : (previous.purchaseSignal ?? false);
  const interestSignal = hasInterestSignal(t) || contextualPurchaseConfirmation
    ? true
    : (previous.interestSignal ?? false);

  const spinFacts = unique([
    ...(previous.spinFacts ?? []).map(normalizeUseCaseSpinFact).filter((value):value is string=>Boolean(value)),
    ...(customerType ? [`cliente:${customerType.toLowerCase()}`] : []),
    ...(sector ? [`sector:${sector}`] : []),
    ...(useCase ? [`uso:${useCase}`] : []),
    ...(problem ? [`problema:${problem}`] : []),
    ...(quantity != null ? [`cantidad:${quantity}`] : []),
    ...priorities.map(p => `prioridad:${p}`),
    ...(invoiceRequired ? ['requiere:factura'] : []),
  ]);

  return { customerType, sector, useCase, problem, priorities, quantity, invoiceRequired, objection, interestSignal, purchaseSignal, spinFacts };
}

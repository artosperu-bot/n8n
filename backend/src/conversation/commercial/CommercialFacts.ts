import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type CommercialFacts = Pick<ConversationState,
  'customerType' | 'sector' | 'useCase' | 'problem' | 'priorities' | 'quantity' | 'invoiceRequired' | 'objection' | 'purchaseSignal' | 'spinFacts'
>;

const PRIORITIES: Array<[string, RegExp]> = [
  ['resistencia', /\b(resistente|resistencia|caida|caidas|golpe|golpes|ip68|ip69k|rugged)\b/],
  ['bateria', /\b(bateria|autonomia|cargar|carga)\b/],
  ['camara', /\b(camara|foto|fotos|video|vision\s+nocturna)\b/],
  ['rendimiento', /\b(rapido|rendimiento|procesador|ram|multitarea)\b/],
  ['conectividad', /\b(nfc|5g|4g|wifi|bluetooth|gps)\b/],
  ['precio', /\b(precio|presupuesto|economico|barato|caro)\b/],
];

function unique(values: string[]): string[] { return [...new Set(values)]; }

export function extractCommercialFacts(message: string, previous: ConversationState): CommercialFacts {
  const t = fold(message);
  const business = /\b(empresa|corporativo|institucion|negocio|ruc|factura|tecnicos|personal|equipo\s+de\s+trabajo)\b/.test(t);
  const customerType = business ? 'BUSINESS' : (previous.customerType ?? null);

  const quantityMatch = t.match(/\b([1-9][0-9]{0,3})\s*(?:unidades|equipos|celulares|telefonos|tecnicos|trabajadores|personas)\b/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : (previous.quantity ?? null);

  let sector = previous.sector ?? null;
  if (/\bconstruccion\b/.test(t)) sector = 'construccion';
  else if (/\b(mineria|minero)\b/.test(t)) sector = 'mineria';
  else if (/\b(logistica|almacen|reparto)\b/.test(t)) sector = 'logistica';
  else if (/\b(seguridad|vigilancia)\b/.test(t)) sector = 'seguridad';
  else if (/\bcampo\b/.test(t)) sector = 'trabajo_campo';

  let useCase = previous.useCase ?? null;
  if (/\btrabaj(?:o|an|amos)\s+en\s+campo\b/.test(t)) useCase = 'trabajo_en_campo';
  else if (/\buso\s+diario\b/.test(t)) useCase = 'uso_diario';
  else if (/\btrabajo\b/.test(t)) useCase = 'trabajo';

  let problem = previous.problem ?? null;
  if (/\b(se\s+me|se\s+les|se)\s+cae[n]?\b|\bcaidas\b/.test(t)) problem = 'caidas_frecuentes';
  else if (/\bbateria\b[^.!?]{0,50}\b(se\s+acaba|no\s+aguanta|dura\s+poco)\b|\bcasi\s+no\s+tengo\s+donde\s+cargar/.test(t)) problem = 'autonomia_insuficiente';
  else if (/\bse\s+rompe[n]?\b|\bfragil/.test(t)) problem = 'durabilidad';

  const priorities = unique([...(previous.priorities ?? []), ...PRIORITIES.filter(([, rx]) => rx.test(t)).map(([key]) => key)]);
  const invoiceRequired = /\bfactura\b|\bruc\b/.test(t) ? true : (previous.invoiceRequired ?? null);
  const objection = /\b(muy\s+caro|esta\s+caro|se\s+me\s+hace\s+caro|sale\s+de\s+mi\s+presupuesto|mas\s+barato)\b/.test(t)
    ? 'precio'
    : (previous.objection ?? null);
  const purchaseSignal = /\b(quiero\s+(?:avanzar\s+con\s+la\s+)?compra|quiero\s+compr|me\s+quedo\s+con|lo\s+quiero|separar|reservar)\b/.test(t)
    ? true
    : (previous.purchaseSignal ?? false);

  const spinFacts = unique([
    ...(previous.spinFacts ?? []),
    ...(customerType ? [`cliente:${customerType.toLowerCase()}`] : []),
    ...(sector ? [`sector:${sector}`] : []),
    ...(useCase ? [`uso:${useCase}`] : []),
    ...(problem ? [`problema:${problem}`] : []),
    ...(quantity != null ? [`cantidad:${quantity}`] : []),
    ...priorities.map(p => `prioridad:${p}`),
    ...(invoiceRequired ? ['requiere:factura'] : []),
  ]);

  return { customerType, sector, useCase, problem, priorities, quantity, invoiceRequired, objection, purchaseSignal, spinFacts };
}

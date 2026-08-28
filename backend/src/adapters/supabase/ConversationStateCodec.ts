import type { ConversationState } from '../../domain/types.ts';
import {
  normalizeGenuineUseCase,
  normalizeUseCaseSpinFact,
} from '../../conversation/commercial/UseCaseNormalizer.ts';

const CANONICAL_KEYS = [
  'sessionId','contextVersion',
  'activeProduct','activeProductId','activeProductCode','salientProduct','selectedProduct','recommendedProduct',
  'customerVisibleRecommendedProduct','recommendationChanged','recommendationChangeFrom','recommendationChangeReason',
  'recommendationChangeCommunicated','stageContinuityValid','exploredProducts','comparisonProducts','queryTarget','explicitSwitch',
  'budget','lastIntent','secondaryIntents','lastRoute','lastSqlTools','requiresSql','requiresRag','spinFacts',
  'lastSpinContribution','lastNba','pendingCommercialAction','pendingMissingFact','currentAttributes','customerType','sector','useCase',
  'problem','priorities','explicitPriorities','quantity','invoiceRequired','objection','interestSignal','purchaseSignal','levelOfInterest',
  'interestEvents','commercialStage','commercialStrategy','reservationStage','reservationDocument','reservationCustomerName',
  'reservationAddress','reservationId','handoffActive','blockAutomaticReply','handoffReason','lastResolvedProductId',
  'lastResolvedProductCode','lastProductResolutionConfidence','lastProductResolutionOrigin','lastDecisionTrace','lastUserMessage',
  'lastAssistantMessage','turnCount','updatedAt',
] as const satisfies readonly (keyof ConversationState)[];

const STRING_ARRAY_KEYS = [
  'exploredProducts','comparisonProducts','secondaryIntents','lastSqlTools','spinFacts','currentAttributes',
  'priorities','explicitPriorities','interestEvents',
] as const satisfies readonly (keyof ConversationState)[];

type JsonRecord = Record<string, unknown>;

function record(value:unknown):JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function cleanStrings(value:unknown):string[] {
  if(!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item):item is string=>typeof item === 'string')
    .map(item=>item.trim())
    .filter(item=>Boolean(item) && item !== '[object Object]'))];
}

function cleanSpinFacts(value:unknown):string[] {
  return [...new Set(cleanStrings(value)
    .map(normalizeUseCaseSpinFact)
    .filter((item):item is string=>Boolean(item)))];
}

function hasDefined(source:JsonRecord,key:string):boolean {
  return Object.prototype.hasOwnProperty.call(source,key) && source[key] !== undefined;
}

function canonicalText(source:JsonRecord,key:string,fallback:unknown):string|null|undefined {
  if(hasDefined(source,key)) {
    const value=source[key];
    if(value === null) return null;
    if(typeof value === 'string' && value.trim()) return value;
    if(typeof value === 'string') return typeof fallback === 'string' && fallback.trim() ? fallback : value;
    return value as string|null|undefined;
  }
  if(typeof fallback === 'string' && fallback.trim()) return fallback;
  return fallback === null ? null : undefined;
}

function canonicalValue<T>(source:JsonRecord,key:string,fallback:T|undefined):T|undefined {
  return hasDefined(source,key) ? source[key] as T : fallback;
}

function legacyText(container:JsonRecord,...keys:string[]):string|undefined {
  for(const key of keys) {
    const value=container[key];
    if(typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function normalizedCanonicalState(state:ConversationState):ConversationState {
  const out={...state};
  out.useCase=normalizeGenuineUseCase(out.useCase);
  out.spinFacts=cleanSpinFacts(out.spinFacts);
  for(const key of STRING_ARRAY_KEYS) {
    if(key === 'spinFacts') continue;
    const value=out[key];
    if(value !== undefined) (out as Record<string,unknown>)[key]=cleanStrings(value);
  }
  return out;
}

/**
 * Serialize accumulated conversational memory using the ConversationState
 * vocabulary only. Persistence/CRM aliases are intentionally excluded.
 */
export function serializeConversationState(state:ConversationState):ConversationState {
  const source=state as unknown as JsonRecord;
  const serialized:JsonRecord={};
  for(const key of CANONICAL_KEYS) {
    if(hasDefined(source,key)) serialized[key]=source[key];
  }
  return normalizedCanonicalState(serialized as ConversationState);
}

/**
 * Hydrate current canonical state while retaining read-only compatibility with
 * historical rows that stored Spanish/nested aliases in ia_contexto.contexto.
 * Canonical fields always win when both representations are present.
 */
export function hydrateConversationState(value:unknown):ConversationState {
  const source=record(value);
  const active=record(source.producto_activo);
  const target=record(source.producto_objetivo_turno);
  const recommended=record(source.producto_recomendado);
  const customer=record(source.cliente);
  const sale=record(source.venta);
  const conversation=record(source.conversacion);

  const canonical=serializeConversationState(source as ConversationState) as ConversationState;

  canonical.activeProduct=canonicalText(source,'activeProduct',legacyText(active,'nombre','nombre_corto'));
  canonical.activeProductId=canonicalText(source,'activeProductId',legacyText(active,'producto_id'));
  canonical.activeProductCode=canonicalText(source,'activeProductCode',legacyText(active,'producto_codigo'));

  canonical.queryTarget=canonicalText(source,'queryTarget',legacyText(target,'nombre'));
  canonical.lastResolvedProductId=canonicalText(source,'lastResolvedProductId',legacyText(target,'producto_id'));
  canonical.lastResolvedProductCode=canonicalText(source,'lastResolvedProductCode',legacyText(target,'producto_codigo'));
  canonical.recommendedProduct=canonicalText(source,'recommendedProduct',legacyText(recommended,'nombre','nombre_corto'));

  canonical.customerType=canonicalText(source,'customerType',legacyText(customer,'tipo')) as ConversationState['customerType'];
  canonical.sector=canonicalText(source,'sector',legacyText(customer,'sector'));
  canonical.useCase=normalizeGenuineUseCase(canonicalText(source,'useCase',legacyText(customer,'actividad')));
  canonical.problem=canonicalText(source,'problem',legacyText(customer,'problema'));
  canonical.priorities=cleanStrings(canonicalValue(source,'priorities',customer.prioridades));
  canonical.budget=canonicalValue(source,'budget',customer.presupuesto as number|null|undefined);
  canonical.quantity=canonicalValue(source,'quantity',customer.cantidad as number|null|undefined);
  canonical.invoiceRequired=canonicalValue(source,'invoiceRequired',customer.requiere_factura as boolean|null|undefined);

  canonical.purchaseSignal=canonicalValue(source,'purchaseSignal',sale.senal_compra as boolean|undefined);
  canonical.objection=canonicalText(source,'objection',legacyText(sale,'objecion'));
  canonical.commercialStage=canonicalText(source,'commercialStage',legacyText(sale,'etapa'));

  canonical.lastNba=canonicalText(source,'lastNba',legacyText(conversation,'accion_pendiente'));
  canonical.lastIntent=canonicalText(source,'lastIntent',legacyText(conversation,'ultima_intencion'));
  canonical.lastRoute=canonicalText(source,'lastRoute',legacyText(conversation,'ultima_ruta'));
  canonical.lastDecisionTrace=canonicalValue(source,'lastDecisionTrace',source.debug_trace as ConversationState['lastDecisionTrace']);

  return normalizedCanonicalState(canonical);
}

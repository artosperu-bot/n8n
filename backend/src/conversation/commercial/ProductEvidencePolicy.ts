import type { ConversationState } from '../../domain/types.ts';

type IntentLike = { primary: string; attributes?: string[] };
const FICHA = ['PANTALLA','RENDIMIENTO','MEMORIA','CAMARA','BATERIA','RESISTENCIA'];
const PRIORITY_TO_SECTION: Record<string,string> = {
  resistencia: 'RESISTENCIA', bateria: 'BATERIA', camara: 'CAMARA', rendimiento: 'RENDIMIENTO',
  conectividad: 'CONECTIVIDAD', memoria: 'MEMORIA', pantalla: 'PANTALLA',
};
function unique(values: string[]): string[] { return [...new Set(values)]; }

export function productEvidenceSections(intent: IntentLike, state: ConversationState): string[] {
  if (intent.primary === 'PRODUCT_INFO') return [...FICHA];
  if (intent.primary === 'ATTRIBUTE' && intent.attributes?.length) return unique(intent.attributes).slice(0, 3);
  if (intent.primary === 'COMPARE') {
    const priorities = unique((state.priorities ?? []).map(x => PRIORITY_TO_SECTION[x]).filter(Boolean));
    return (priorities.length ? priorities : ['RESISTENCIA','BATERIA','RENDIMIENTO','CAMARA']).slice(0, 4);
  }
  if (intent.primary === 'EVALUATE_USE' || intent.primary === 'RECOMMEND' || intent.primary === 'OBJECTION') {
    const priorities = unique((state.priorities ?? []).map(x => PRIORITY_TO_SECTION[x]).filter(Boolean));
    if (state.problem === 'caidas_frecuentes') priorities.unshift('RESISTENCIA');
    if (state.problem === 'autonomia_insuficiente') priorities.unshift('BATERIA');
    return unique(priorities).slice(0, 4);
  }
  return [];
}

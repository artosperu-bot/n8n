import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type IntentLike = { primary: string; attributes?: string[] };
const FICHA = ['PANTALLA','RENDIMIENTO','MEMORIA','CAMARA','BATERIA','RESISTENCIA'];
const SECTIONS = new Set(['AUDIO','BATERIA','CAMARA','CONECTIVIDAD','FISICO','FUNCIONES','IDENTIFICACION','LANZAMIENTO','MEMORIA','PANTALLA','POSICIONAMIENTO','REDES','RENDIMIENTO','RESISTENCIA','SEGURIDAD','SENSORES','SIM','SISTEMA','TERMICA']);
const PRIORITY_TO_SECTION: Record<string,string> = {
  resistencia:'RESISTENCIA', bateria:'BATERIA', camara:'CAMARA', rendimiento:'RENDIMIENTO',
  conectividad:'CONECTIVIDAD', memoria:'MEMORIA', pantalla:'PANTALLA', seguridad:'SEGURIDAD', audio:'AUDIO',
};
function unique(values: string[]): string[] { return [...new Set(values)]; }

function sectionsForAttribute(attribute:string):string[] {
  const raw=String(attribute??'').trim().toUpperCase();
  if(SECTIONS.has(raw))return[raw];
  const t=fold(attribute);
  if(/\bnfc\b/.test(t))return['CONECTIVIDAD','FUNCIONES'];
  if(/\b5g\b|\b4g\b|lte/.test(t))return['REDES','CONECTIVIDAD'];
  if(/termic|thermal|flir/.test(t))return['TERMICA','CAMARA'];
  if(/\bram\b|almacen|memoria|rom/.test(t))return['MEMORIA'];
  if(/bateria|carga|autonomia/.test(t))return['BATERIA'];
  if(/camara|foto|video/.test(t))return['CAMARA'];
  if(/golpe|caida|agua|polvo|ip68|ip69|mil-std|resisten/.test(t))return['RESISTENCIA'];
  if(/procesador|cpu|gpu|rendimiento|juego/.test(t))return['RENDIMIENTO'];
  if(/pantalla|display|hz|resolucion/.test(t))return['PANTALLA'];
  if(/sim|esim/.test(t))return['SIM','REDES'];
  if(/sensor|giroscop|brujula|proximidad/.test(t))return['SENSORES','FUNCIONES'];
  if(/huella|face|facial|seguridad/.test(t))return['SEGURIDAD','SENSORES'];
  if(/wifi|bluetooth|gps|usb|otg|conect/.test(t))return['CONECTIVIDAD','FUNCIONES'];
  if(/audio|parlante|speaker|microfono/.test(t))return['AUDIO'];
  if(/android|sistema|os\b/.test(t))return['SISTEMA'];
  if(/peso|dimension|tamano|fisic/.test(t))return['FISICO'];
  return[];
}

export function productEvidenceSections(intent: IntentLike, state: ConversationState): string[] {
  if (intent.primary === 'PRODUCT_INFO') return [...FICHA];
  if (intent.primary === 'ATTRIBUTE' && intent.attributes?.length) {
    return unique(intent.attributes.flatMap(sectionsForAttribute)).slice(0,4);
  }
  if (intent.primary === 'COMPARE') {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    if(explicit.length)return explicit.slice(0,4);
    const priorities = unique((state.priorities ?? []).map(x => PRIORITY_TO_SECTION[fold(x)]).filter(Boolean));
    return (priorities.length ? priorities : ['RESISTENCIA','BATERIA','RENDIMIENTO','CAMARA']).slice(0, 4);
  }
  if (intent.primary === 'EVALUATE_USE' || intent.primary === 'RECOMMEND' || intent.primary === 'OBJECTION') {
    const priorities = unique((state.priorities ?? []).map(x => PRIORITY_TO_SECTION[fold(x)]).filter(Boolean));
    if (state.problem === 'caidas_frecuentes') priorities.unshift('RESISTENCIA');
    if (state.problem === 'autonomia_insuficiente') priorities.unshift('BATERIA');
    return unique(priorities).slice(0, 4);
  }
  return [];
}

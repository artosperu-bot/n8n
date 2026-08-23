import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type IntentLike = { primary: string; attributes?: string[] };
const FICHA = ['PANTALLA','RENDIMIENTO','MEMORIA','CAMARA','BATERIA','RESISTENCIA'];
const SECTIONS = new Set(['AUDIO','BATERIA','CAMARA','CONECTIVIDAD','FISICO','FUNCIONES','IDENTIFICACION','LANZAMIENTO','MEMORIA','PANTALLA','POSICIONAMIENTO','REDES','RENDIMIENTO','RESISTENCIA','SEGURIDAD','SENSORES','SIM','SISTEMA','TERMICA']);
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }

function sectionsForAttribute(attribute:string):string[] {
  const raw=String(attribute??'').trim().toUpperCase();
  if(SECTIONS.has(raw))return[raw];
  const t=fold(attribute);
  if(/\bnfc\b/.test(t))return['CONECTIVIDAD','FUNCIONES'];
  if(/\b5g\b|\b4g\b|lte/.test(t))return['REDES','CONECTIVIDAD'];
  if(/termic|thermal|flir|temperatura|calor/.test(t))return['TERMICA','SENSORES','RESISTENCIA'];
  if(/\bram\b|almacen|memoria|rom|espacio/.test(t))return['MEMORIA'];
  if(/bateria|carga|autonomia/.test(t))return['BATERIA'];
  if(/camara|foto|fotografia|video|imagen/.test(t))return['CAMARA'];
  if(/golpe|caida|agua|polvo|ip68|ip69|mil-std|resisten|durab/.test(t))return['RESISTENCIA'];
  if(/procesador|cpu|gpu|rendimiento|juego|gaming|free fire|pubg|cod mobile/.test(t))return['RENDIMIENTO','MEMORIA','PANTALLA'];
  if(/pantalla|display|hz|resolucion/.test(t))return['PANTALLA'];
  if(/sim|esim/.test(t))return['SIM','REDES'];
  if(/huella|face|facial|seguridad/.test(t))return['SEGURIDAD','SENSORES'];
  if(/sensor|giroscop|brujula|proximidad/.test(t))return['SENSORES','FUNCIONES'];
  if(/wifi|bluetooth|gps|usb|otg|conect|compart|redes sociales|subir.*red|infrarrojo/.test(t))return['CONECTIVIDAD','REDES','FUNCIONES'];
  if(/audio|parlante|speaker|microfono|audifono|jack/.test(t))return['AUDIO','CONECTIVIDAD'];
  if(/android|sistema|os\b/.test(t))return['SISTEMA'];
  if(/peso|dimension|tamano|fisic/.test(t))return['FISICO'];
  return[];
}

function sectionsForPriority(priority:string):string[]{return sectionsForAttribute(priority);}
function inferredSections(state:ConversationState):string[]{
  const use=fold(state.useCase??state.sector??'');
  const problem=fold(state.problem??'');
  const combined=`${use} ${problem}`;
  const result:string[]=[];
  if(/delivery|repart|logistica/.test(use))result.push('BATERIA','RESISTENCIA','POSICIONAMIENTO','REDES','CONECTIVIDAD');
  if(/campo|construccion|obra|tecnico/.test(use))result.push('RESISTENCIA','BATERIA');
  if(/caida|golpe|durabilidad/.test(problem))result.push('RESISTENCIA');
  if(/autonomia|bateria/.test(problem))result.push('BATERIA');
  if(/foto|fotografia|camara|video|redes sociales|subir.*red/.test(combined))result.push('CAMARA','MEMORIA','CONECTIVIDAD','REDES');
  if(/termic|temperatura|calor/.test(combined))result.push('TERMICA','SENSORES','RESISTENCIA');
  if(/juego|jugar|gaming|free fire|pubg|cod mobile|call of duty/.test(combined))result.push('RENDIMIENTO','MEMORIA','PANTALLA','BATERIA');
  return result;
}

export function productEvidenceSections(intent: IntentLike, state: ConversationState): string[] {
  if (intent.primary === 'PRODUCT_INFO') return [...FICHA];
  if (intent.primary === 'ATTRIBUTE') {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    if(explicit.length)return explicit.slice(0,5);
    const inherited=unique([...(state.currentAttributes??[]),...(state.priorities??[])].flatMap(sectionsForPriority));
    return inherited.slice(0,5);
  }
  if (intent.primary === 'COMPARE') {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    if(explicit.length)return explicit.slice(0,5);
    const priorities=unique((state.priorities??[]).flatMap(sectionsForPriority));
    if(priorities.length)return priorities.slice(0,4);
    const inferred=unique(inferredSections(state));
    return (inferred.length?inferred:['RESISTENCIA','BATERIA','RENDIMIENTO','CAMARA']).slice(0,4);
  }
  if (intent.primary === 'EVALUATE_USE' || intent.primary === 'RECOMMEND' || intent.primary === 'OBJECTION') {
    const priorities = unique((state.priorities ?? []).flatMap(sectionsForPriority));
    return unique([...priorities,...inferredSections(state)]).slice(0, 8);
  }
  return [];
}

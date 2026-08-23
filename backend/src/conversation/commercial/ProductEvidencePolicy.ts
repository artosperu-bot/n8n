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
  if(/termic|thermal|flir|temperatura|calor/.test(t))return['TERMICA','SENSORES','RESISTENCIA','BATERIA'];
  if(/\bram\b|almacen|memoria|rom|espacio/.test(t))return['MEMORIA'];
  if(/bateria|carga|autonomia/.test(t))return['BATERIA'];
  if(/camara|foto|fotografia|video|imagen|nocturn/.test(t))return['CAMARA'];
  if(/golpe|caida|agua|polvo|ip68|ip69|mil-std|resisten|durab/.test(t))return['RESISTENCIA'];
  if(/procesador|cpu|gpu|rendimiento|juego|gaming|free fire|pubg|cod mobile/.test(t))return['RENDIMIENTO','MEMORIA','PANTALLA','BATERIA'];
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
  const priorities=fold((state.priorities??[]).join(' '));
  const combined=`${use} ${problem} ${priorities}`;
  const result:string[]=[];

  if(/gaming|juego|jugar|free fire|pubg|cod mobile|call of duty/.test(combined))result.push('RENDIMIENTO','MEMORIA','PANTALLA','BATERIA');
  if(/delivery|repart|logistica/.test(combined))result.push('BATERIA','POSICIONAMIENTO','REDES','CONECTIVIDAD','RESISTENCIA');
  if(/campo|construccion|obra|mineria|tecnico/.test(combined))result.push('RESISTENCIA','BATERIA','POSICIONAMIENTO');
  if(/trabajo nocturno|noche|nocturn|vigilancia/.test(combined))result.push('CAMARA','BATERIA','RESISTENCIA');
  if(/termic|temperatura|calor|inspeccion.*temperatura/.test(combined))result.push('TERMICA','RESISTENCIA','BATERIA','SENSORES');
  if(/oficina|multitarea|varias apps|whatsapp|correo|navegador|trabajo/.test(combined))result.push('RENDIMIENTO','MEMORIA','BATERIA');
  if(/foto|fotografia|camara|video|contenido|redes sociales|subir.*red/.test(combined))result.push('CAMARA','MEMORIA','PANTALLA');

  if(/caida|golpe|durabilidad/.test(problem))result.push('RESISTENCIA');
  if(/autonomia|bateria/.test(problem))result.push('BATERIA');
  return unique(result);
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
    const inferred=unique(inferredSections(state));
    if(priorities.length||inferred.length)return unique([...priorities,...inferred]).slice(0,5);
    return ['RESISTENCIA','BATERIA','RENDIMIENTO','MEMORIA','CAMARA'];
  }
  if (intent.primary === 'EVALUATE_USE' || intent.primary === 'RECOMMEND' || intent.primary === 'OBJECTION') {
    const priorities = unique((state.priorities ?? []).flatMap(sectionsForPriority));
    return unique([...priorities,...inferredSections(state)]).slice(0, 8);
  }
  return [];
}

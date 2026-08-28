import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type IntentLike = { primary: string; attributes?: string[] };
const FICHA = ['PANTALLA','RENDIMIENTO','MEMORIA','CAMARA','BATERIA','RESISTENCIA','TERMICA'];
const SECTIONS = new Set(['AUDIO','BATERIA','CAMARA','CONECTIVIDAD','FISICO','FUNCIONES','IDENTIFICACION','LANZAMIENTO','MEMORIA','PANTALLA','POSICIONAMIENTO','REDES','RENDIMIENTO','RESISTENCIA','SEGURIDAD','SENSORES','SIM','SISTEMA','TERMICA']);
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }

function sectionsForAttribute(attribute:string):string[] {
  const raw=String(attribute??'').trim().toUpperCase();
  if(SECTIONS.has(raw))return[raw];
  const t=fold(attribute);

  // Canonical aliases emitted naturally by the semantic planner. The planner
  // describes what the customer cares about; this function maps that meaning
  // to factual RAG sections without giving it permission to invent facts.
  if(/durability|water resistance|rugged|golpe|caida|agua|polvo|ip68|ip69|mil[- ]?std|resisten|durab/.test(t))return['RESISTENCIA'];
  if(/battery|autonomy|charge|bateria|carga|autonomia/.test(t))return['BATERIA'];
  if(/ergonomic|ergonomia|weight|size|peso|dimension|tamano|fisic/.test(t))return['FISICO'];
  if(/performance|procesador|cpu|gpu|rendimiento/.test(t))return['RENDIMIENTO'];
  if(/memory|storage|\bram\b|almacen|memoria|rom|espacio/.test(t))return['MEMORIA'];
  if(/camera|camara|foto|fotografia|video|imagen|nocturn/.test(t))return['CAMARA'];

  if(/\bnfc\b/.test(t))return['CONECTIVIDAD','FUNCIONES'];
  if(/\b5g\b|\b4g\b|lte/.test(t))return['REDES','CONECTIVIDAD'];
  if(/termic|thermal|flir|temperatura|calor/.test(t))return['TERMICA','SENSORES','RESISTENCIA','BATERIA'];
  if(/juego|gaming|free fire|pubg|cod mobile/.test(t))return['RENDIMIENTO','MEMORIA','PANTALLA','BATERIA'];
  if(/pantalla|display|hz|resolucion/.test(t))return['PANTALLA'];
  if(/sim|esim/.test(t))return['SIM','REDES'];
  if(/huella|face|facial|seguridad/.test(t))return['SEGURIDAD','SENSORES'];
  if(/sensor|giroscop|brujula|proximidad/.test(t))return['SENSORES','FUNCIONES'];
  if(/wifi|bluetooth|gps|usb|otg|conect|compart|redes sociales|subir.*red|infrarrojo/.test(t))return['CONECTIVIDAD','REDES','FUNCIONES'];
  if(/audio|parlante|speaker|microfono|audifono|jack/.test(t))return['AUDIO','CONECTIVIDAD'];
  if(/android|sistema|os\b/.test(t))return['SISTEMA'];
  return[];
}

function sectionsForPriority(priority:string):string[]{return sectionsForAttribute(priority);}
function inferredSections(state:ConversationState):string[]{
  const use=fold(state.useCase??state.sector??'');
  const problem=fold(state.problem??'');
  const priorities=fold((state.priorities??[]).join(' '));
  const combined=`${use} ${problem} ${priorities}`;
  const result:string[]=[];

  if(/caida|golpe|durabilidad|repar|polvo|agua|lluvia|humedad|malogr/.test(problem))result.push('RESISTENCIA');
  if(/autonomia|bateria|cargador|no dura|no llega/.test(problem))result.push('BATERIA');
  if(/termic|temperatura|calor|inspeccion.*temperatura/.test(problem))result.push('TERMICA','RESISTENCIA','BATERIA','SENSORES');
  if(/foto|fotografia|camara|video/.test(problem))result.push('CAMARA','MEMORIA');

  if(/gaming|juego|jugar|free fire|pubg|cod mobile|call of duty/.test(combined))result.push('RENDIMIENTO','MEMORIA','PANTALLA','BATERIA');
  if(/delivery|repart|logistica/.test(combined))result.push('BATERIA','POSICIONAMIENTO','REDES','CONECTIVIDAD','RESISTENCIA');
  if(/campo|construccion|obra|mineria|tecnico|obrero|operario/.test(combined))result.push('RESISTENCIA','BATERIA','POSICIONAMIENTO');
  if(/trabajo nocturno|noche|nocturn|vigilancia/.test(combined))result.push('CAMARA','BATERIA','RESISTENCIA');
  if(/termic|temperatura|calor|inspeccion.*temperatura/.test(combined))result.push('TERMICA','RESISTENCIA','BATERIA','SENSORES');
  if(/oficina|multitarea|varias apps|whatsapp|correo|navegador/.test(combined))result.push('RENDIMIENTO','MEMORIA','BATERIA');
  else if(/\btrabajo\b/.test(use)&&result.length===0)result.push('RESISTENCIA','BATERIA');
  if(/foto|fotografia|camara|video|contenido|redes sociales|subir.*red/.test(combined))result.push('CAMARA','MEMORIA','PANTALLA');

  return unique(result);
}

export function productEvidenceSections(intent: IntentLike, state: ConversationState): string[] {
  const primary=String(intent.primary??'').toUpperCase();
  if (primary === 'PRODUCT_INFO') return [...FICHA];
  if (primary === 'ATTRIBUTE') {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    if(explicit.length)return explicit.slice(0,5);
    const inherited=unique([...(state.currentAttributes??[]),...(state.priorities??[])].flatMap(sectionsForPriority));
    return inherited.slice(0,5);
  }
  if (primary === 'COMPARE') {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    const priorities=unique((state.priorities??[]).flatMap(sectionsForPriority));
    const inferred=unique(inferredSections(state));
    const focused=unique([...explicit,...priorities,...inferred]);
    if(focused.length)return focused.slice(0,5);
    return ['RESISTENCIA','BATERIA','RENDIMIENTO','MEMORIA','CAMARA'];
  }
  if (['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','OBJECTION','HANDLE_PRICE_OBJECTION'].includes(primary)) {
    const explicit=unique((intent.attributes??[]).flatMap(sectionsForAttribute));
    // Explicit semantic criteria describe the customer's current question and
    // therefore take precedence over generic inferred labels such as “trabajo”.
    if(explicit.length)return explicit.slice(0,5);
    const priorities=unique((state.priorities??[]).flatMap(sectionsForPriority));
    const focused=unique([...priorities,...inferredSections(state)]);
    return focused.slice(0,5);
  }
  return [];
}

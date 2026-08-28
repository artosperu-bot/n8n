import type { ProductHighlight } from '../../ports/LlmProvider.ts';
import type { VerifiedFact } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Input={intent:string;attribute:string|null;facts:VerifiedFact[];limit?:number};
type Family=ProductHighlight['family'];
const ORDER:Family[]=['MEMORY','BATTERY','RESISTANCE','CAMERA','DISPLAY','PERFORMANCE','CONNECTIVITY','NETWORK','THERMAL','OTHER'];
const KEYS:Record<Family,string[]>={
  MEMORY:['RAM_FISICA','RAM_VIRTUAL','ALMACENAMIENTO','MICROSD_MAX'],BATTERY:['BATERIA_MAH','CARGA_W'],
  RESISTANCE:['RESISTENCIA_CAIDAS','IP68','IP69K','MIL_STD_810H','PROFUNDIDAD_IP68','TIEMPO_IP68'],
  CAMERA:['CAMARA_PRINCIPAL_MP','VISION_NOCTURNA','CAMARA_NOCTURNA_MP','CAMARA_FRONTAL_MP'],
  DISPLAY:['PANTALLA_HZ','PANTALLA_TAMANO','PANTALLA_RESOLUCION'],PERFORMANCE:['PROCESADOR'],
  CONNECTIVITY:['NFC','BLUETOOTH_VERSION','WIFI_STANDARD'],NETWORK:['5G','4G_LTE'],THERMAL:['CAMARA_TERMICA','RESOLUCION_TERMICA'],OTHER:[],
};
function productFacts(facts:VerifiedFact[]):VerifiedFact[]{return facts.filter(f=>f.domain==='PRODUCT_RAG');}
function get(facts:VerifiedFact[],key:string):VerifiedFact|undefined{return facts.find(f=>f.key===key);}
function positive(value:string|undefined):boolean{return /^s[ií]$/i.test(String(value??'').trim());}
function stripHasta(value:string|undefined):string{return String(value??'').replace(/^hasta\s+/i,'').trim();}
function join(items:string[]):string{return items.filter(Boolean).join(', ');}
function summary(family:Family,facts:VerifiedFact[]):string{
  const v=(key:string)=>get(facts,key)?.value;
  if(family==='MEMORY')return join([v('RAM_FISICA')?`${v('RAM_FISICA')} de RAM física`:'',v('RAM_VIRTUAL')?`hasta ${stripHasta(v('RAM_VIRTUAL'))} de RAM virtual`:'',v('ALMACENAMIENTO')?`${v('ALMACENAMIENTO')} de almacenamiento`:'',v('MICROSD_MAX')?`microSD hasta ${stripHasta(v('MICROSD_MAX'))}`:'']);
  if(family==='BATTERY')return join([v('BATERIA_MAH')?`${v('BATERIA_MAH')} de batería`:'',v('CARGA_W')?`carga de ${v('CARGA_W')}`:'']);
  if(family==='RESISTANCE'){
    const certs=[positive(v('IP68'))?'IP68':'',positive(v('IP69K'))?'IP69K':'',positive(v('MIL_STD_810H'))?'MIL-STD-810H':''].filter(Boolean);
    return join([certs.length?`certificaciones ${certs.join(', ')}`:'',v('RESISTENCIA_CAIDAS')?`caídas de hasta ${v('RESISTENCIA_CAIDAS')}`:'',v('PROFUNDIDAD_IP68')&&v('TIEMPO_IP68')?`IP68 hasta ${v('PROFUNDIDAD_IP68')} por ${v('TIEMPO_IP68')}`:'']);
  }
  if(family==='CAMERA')return join([v('CAMARA_PRINCIPAL_MP')?`principal de ${v('CAMARA_PRINCIPAL_MP')}`:'',v('CAMARA_FRONTAL_MP')?`frontal de ${v('CAMARA_FRONTAL_MP')}`:'',positive(v('VISION_NOCTURNA'))?(v('CAMARA_NOCTURNA_MP')?`visión nocturna de ${v('CAMARA_NOCTURNA_MP')}`:'visión nocturna'):'']);
  if(family==='DISPLAY')return join([v('PANTALLA_TAMANO')||'',v('PANTALLA_HZ')||'',v('PANTALLA_RESOLUCION')||'']);
  if(family==='PERFORMANCE')return v('PROCESADOR')?`procesador ${v('PROCESADOR')}`:'';
  if(family==='CONNECTIVITY')return join([positive(v('NFC'))?'NFC':'',v('BLUETOOTH_VERSION')?`Bluetooth ${v('BLUETOOTH_VERSION')}`:'',v('WIFI_STANDARD')?`Wi‑Fi ${v('WIFI_STANDARD')}`:'']);
  if(family==='NETWORK')return join([positive(v('5G'))?'5G':'',positive(v('4G_LTE'))?'4G LTE':'']);
  if(family==='THERMAL')return join([positive(v('CAMARA_TERMICA'))?'cámara térmica':'',v('RESOLUCION_TERMICA')?`resolución ${v('RESOLUCION_TERMICA')}`:'']);
  return'';
}
function familyFacts(all:VerifiedFact[],family:Family):VerifiedFact[]{const keys=new Set(KEYS[family]);return all.filter(f=>keys.has(f.key));}
function attributeFamily(attribute:string|null):Family|null{
  const a=fold(attribute??'');if(!a)return null;
  if(/ram|memoria|almacen|rom|micro.?sd/.test(a))return'MEMORY';if(/bateria|autonomia|carga/.test(a))return'BATTERY';if(/resisten|caida|ip68|ip69|mil/.test(a))return'RESISTANCE';if(/termic|temperatura/.test(a))return'THERMAL';if(/camara|foto|video|nocturn/.test(a))return'CAMERA';if(/pantalla|display|hz/.test(a))return'DISPLAY';if(/procesador|rendimiento|cpu|chipset/.test(a))return'PERFORMANCE';if(/nfc|bluetooth|wifi|wi-fi|usb/.test(a))return'CONNECTIVITY';if(/5g|4g|lte|red/.test(a))return'NETWORK';return null;
}
function label(family:Family):string{return {MEMORY:'Memoria',BATTERY:'Batería',RESISTANCE:'Resistencia',CAMERA:'Cámaras',DISPLAY:'Pantalla',PERFORMANCE:'Rendimiento',CONNECTIVITY:'Conectividad',NETWORK:'Redes',THERMAL:'Térmica',OTHER:'Dato destacado'}[family];}
export function selectProductHighlights(input:Input):ProductHighlight[]{
  const facts=productFacts(input.facts);const focused=['CAPABILITY','ATTRIBUTE'].includes(String(input.intent).toUpperCase())?attributeFamily(input.attribute):null;
  if(focused){const ff=familyFacts(facts,focused);const s=summary(focused,ff);return s?[{family:focused,label:label(focused),facts:ff,summary:s}]:[];}
  const limit=Math.max(1,Math.min(6,input.limit??6));const result:ProductHighlight[]=[];
  for(const family of ORDER){if(family==='OTHER')continue;const ff=familyFacts(facts,family);const s=summary(family,ff);if(!s)continue;result.push({family,label:label(family),facts:ff,summary:s});if(result.length>=limit)break;}
  return result;
}

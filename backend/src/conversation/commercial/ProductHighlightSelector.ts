import type { ProductHighlight } from '../../ports/LlmProvider.ts';
import type { VerifiedFact } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type Input={intent:string;attribute:string|null;facts:VerifiedFact[];limit?:number};
type Family=ProductHighlight['family'];
const ORDER:Family[]=['MEMORY','BATTERY','RESISTANCE','CAMERA','DISPLAY','PERFORMANCE','CONNECTIVITY','NETWORK','THERMAL','OTHER'];
const KEYS:Record<Family,string[]>={
  MEMORY:['RAM_FISICA','RAM_VIRTUAL','ALMACENAMIENTO','MICROSD_MAX'],
  BATTERY:['BATERIA_MAH','CARGA_W'],
  RESISTANCE:['RESISTENCIA_CAIDAS','IP68','IP69K','MIL_STD_810H','PROFUNDIDAD_IP68','TIEMPO_IP68'],
  CAMERA:['CAMARA_PRINCIPAL_MP','VISION_NOCTURNA','CAMARA_NOCTURNA_MP','CAMARA_FRONTAL_MP'],
  DISPLAY:['PANTALLA_HZ','PANTALLA_TAMANO','PANTALLA_RESOLUCION'],
  PERFORMANCE:['PROCESADOR'],
  CONNECTIVITY:['NFC','BLUETOOTH_VERSION','WIFI_STANDARD'],
  NETWORK:['5G','4G_LTE'],
  THERMAL:['CAMARA_TERMICA','RESOLUCION_TERMICA'],
  OTHER:[],
};
function productFacts(facts:VerifiedFact[]):VerifiedFact[]{return facts.filter(f=>f.domain==='PRODUCT_RAG');}
function get(facts:VerifiedFact[],key:string):VerifiedFact|undefined{return facts.find(f=>f.key===key);}
function positive(value:string|undefined):boolean{return /^s[ií]$/i.test(String(value??'').trim());}
function summary(family:Family,facts:VerifiedFact[]):string{
  const v=(key:string)=>get(facts,key)?.value;
  if(family==='MEMORY'){
    const parts:string[]=[];if(v('RAM_FISICA'))parts.push(`${v('RAM_FISICA')} de RAM física`);if(v('RAM_VIRTUAL'))parts.push(`${v('RAM_VIRTUAL')} de RAM virtual`);if(v('ALMACENAMIENTO'))parts.push(`${v('ALMACENAMIENTO')} de almacenamiento`);if(v('MICROSD_MAX'))parts.push(`microSD ${v('MICROSD_MAX')}`);return parts.join(' + ');
  }
  if(family==='BATTERY')return [v('BATERIA_MAH')?`batería de ${v('BATERIA_MAH')}`:'',v('CARGA_W')?`carga de ${v('CARGA_W')}`:''].filter(Boolean).join(' y ');
  if(family==='RESISTANCE')return [v('RESISTENCIA_CAIDAS')?`caídas de ${v('RESISTENCIA_CAIDAS')}`:'',positive(v('IP68'))?'IP68':'',positive(v('IP69K'))?'IP69K':'',positive(v('MIL_STD_810H'))?'MIL-STD-810H':''].filter(Boolean).join(', ');
  if(family==='CAMERA')return [v('CAMARA_PRINCIPAL_MP')?`cámara principal ${v('CAMARA_PRINCIPAL_MP')}`:'',positive(v('VISION_NOCTURNA'))?(v('CAMARA_NOCTURNA_MP')?`visión nocturna ${v('CAMARA_NOCTURNA_MP')}`:'visión nocturna'):'',v('CAMARA_FRONTAL_MP')?`frontal ${v('CAMARA_FRONTAL_MP')}`:''].filter(Boolean).join(', ');
  if(family==='DISPLAY')return [v('PANTALLA_HZ'),v('PANTALLA_TAMANO'),v('PANTALLA_RESOLUCION')].filter(Boolean).join(', ');
  if(family==='PERFORMANCE')return v('PROCESADOR')?`procesador ${v('PROCESADOR')}`:'';
  if(family==='CONNECTIVITY')return [positive(v('NFC'))?'NFC':'',v('BLUETOOTH_VERSION')?`Bluetooth ${v('BLUETOOTH_VERSION')}`:'',v('WIFI_STANDARD')?`Wi‑Fi ${v('WIFI_STANDARD')}`:''].filter(Boolean).join(', ');
  if(family==='NETWORK')return [positive(v('5G'))?'5G':'',positive(v('4G_LTE'))?'4G/LTE':''].filter(Boolean).join(', ');
  if(family==='THERMAL')return [positive(v('CAMARA_TERMICA'))?'cámara térmica':'',v('RESOLUCION_TERMICA')?`resolución ${v('RESOLUCION_TERMICA')}`:''].filter(Boolean).join(', ');
  return '';
}
function familyFacts(all:VerifiedFact[],family:Family):VerifiedFact[]{const keys=new Set(KEYS[family]);return all.filter(f=>keys.has(f.key));}
function attributeFamily(attribute:string|null):Family|null{
  const a=fold(attribute??'');if(!a)return null;
  if(/ram|memoria|almacen|rom|micro.?sd/.test(a))return'MEMORY';if(/bateria|autonomia|carga/.test(a))return'BATTERY';if(/resisten|caida|ip68|ip69|mil/.test(a))return'RESISTANCE';if(/camara|foto|video|nocturn/.test(a))return'CAMERA';if(/pantalla|display|hz/.test(a))return'DISPLAY';if(/procesador|rendimiento|cpu|chipset/.test(a))return'PERFORMANCE';if(/nfc|bluetooth|wifi|wi-fi|usb/.test(a))return'CONNECTIVITY';if(/5g|4g|lte|red/.test(a))return'NETWORK';if(/termic|temperatura/.test(a))return'THERMAL';return null;
}
function label(family:Family):string{return {MEMORY:'Memoria',BATTERY:'Batería',RESISTANCE:'Resistencia',CAMERA:'Cámara',DISPLAY:'Pantalla',PERFORMANCE:'Rendimiento',CONNECTIVITY:'Conectividad',NETWORK:'Redes',THERMAL:'Térmica',OTHER:'Dato destacado'}[family];}
export function selectProductHighlights(input:Input):ProductHighlight[]{
  const facts=productFacts(input.facts);const focused=['CAPABILITY','ATTRIBUTE'].includes(String(input.intent).toUpperCase())?attributeFamily(input.attribute):null;
  if(focused){const ff=familyFacts(facts,focused);const s=summary(focused,ff);return s?[{family:focused,label:label(focused),facts:ff,summary:s}]:[];}
  const limit=Math.max(1,Math.min(6,input.limit??6));const result:ProductHighlight[]=[];
  for(const family of ORDER){if(family==='OTHER')continue;const ff=familyFacts(facts,family);const s=summary(family,ff);if(!s)continue;result.push({family,label:label(family),facts:ff,summary:s});if(result.length>=limit)break;}
  return result;
}

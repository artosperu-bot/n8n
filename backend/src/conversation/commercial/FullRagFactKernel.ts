import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type ProductFactStore={
  product:string;
  productId:string|null;
  sections:Set<string>;
  memory:{ramPhysical:string|null;ramVirtual:string|null;storage:string|null;microSd:string|null};
  battery:{capacity:string|null;charge:string|null};
  resistance:{ip68:boolean|null;ip69k:boolean|null;mil810h:boolean|null;drop:string|null;depth:string|null;time:string|null};
  camera:{mainMp:string|null;mainSensor:string|null;frontMp:string|null;nightVision:boolean|null;nightMp:string|null;nightSensor:string|null;videoMax:string|null};
  connectivity:{nfc:boolean|null;googlePay:boolean|null;bluetooth:string|null;wifiStandard:string|null;wifi5:boolean|null;infrared:boolean|null;jack35:boolean|null};
  network:{fiveG:boolean|null;fourG:boolean|null};
  sim:{count:string|null;type:string|null;dual4g:boolean|null;slots:string|null};
  display:{size:string|null;refresh:string|null;resolution:string|null};
  performance:{processor:string|null;gpu:string|null};
  thermal:{camera:boolean|null;frequency:string|null;resolution:string|null;minTemp:string|null;maxTemp:string|null;app:string|null};
  positioning:{systems:string[]};
};

type MutableStore=ProductFactStore;
const PUNCT='(?=$|[\\s.,;:!?\\)\\]])';

function first(text:string,rx:RegExp):string|null{return text.match(rx)?.[1]?.trim().replace(/[.;]+$/,'')??null;}
function cleanBoolean(value:string):boolean|null{const normalized=fold(value).replace(/[.,;:!?]+$/,'').trim();if(normalized==='si'||normalized==='yes'||normalized==='true')return true;if(normalized==='no'||normalized==='false')return false;return null;}
function bool(text:string,label:RegExp):boolean|null{
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim().replace(/^[-*•]\s*/,'');const colon=line.indexOf(':');if(colon<=0)continue;
    const key=line.slice(0,colon).trim();if(!label.test(key))continue;
    const parsed=cleanBoolean(line.slice(colon+1));if(parsed!==null)return parsed;
  }
  const m=text.match(new RegExp(`${label.source}\\s*[:=]?\\s*(s[ií]|no|yes|true|false)${PUNCT}`,'i'));
  return m?cleanBoolean(m[1]):null;
}
function productFrom(row:RagEvidence):string{const raw=String(row.text??'');return first(raw,/(?:^|\n)\s*Producto\s*:\s*([^\n]+)/i)??String(row.productId??'PRODUCTO').trim();}
function cleanProduct(value:string):string{return value.replace(/\s+/g,' ').trim();}
function emptyStore(product:string,productId:string|null):MutableStore{return{
  product:cleanProduct(product),productId,sections:new Set<string>(),memory:{ramPhysical:null,ramVirtual:null,storage:null,microSd:null},battery:{capacity:null,charge:null},resistance:{ip68:null,ip69k:null,mil810h:null,drop:null,depth:null,time:null},camera:{mainMp:null,mainSensor:null,frontMp:null,nightVision:null,nightMp:null,nightSensor:null,videoMax:null},connectivity:{nfc:null,googlePay:null,bluetooth:null,wifiStandard:null,wifi5:null,infrared:null,jack35:null},network:{fiveG:null,fourG:null},sim:{count:null,type:null,dual4g:null,slots:null},display:{size:null,refresh:null,resolution:null},performance:{processor:null,gpu:null},thermal:{camera:null,frequency:null,resolution:null,minTemp:null,maxTemp:null,app:null},positioning:{systems:[]},
};}
function assign<T>(current:T|null,next:T|null):T|null{return current??next;}
function sectionOf(row:RagEvidence):string{return String(row.section??row.source.split(':').at(-1)??'').toUpperCase();}
function parseRow(store:MutableStore,row:RagEvidence):void{
  const text=String(row.text??'');const sec=sectionOf(row);store.sections.add(sec);
  store.memory.ramPhysical=assign(store.memory.ramPhysical,first(text,/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+\s*GB)/i));
  store.memory.ramVirtual=assign(store.memory.ramVirtual,first(text,/RAM\s+virtual(?:\s+m[aá]xima)?\s*[:=]?\s*(?:hasta\s+)?([0-9.,]+\s*GB)/i));
  store.memory.storage=assign(store.memory.storage,first(text,/(?:almacenamiento(?:\s+interno)?|memoria\s+interna|ROM)\s*[:=]?\s*([0-9.,]+\s*(?:GB|TB))/i));
  store.memory.microSd=assign(store.memory.microSd,first(text,/micro\s*SD(?:\s+m[aá]xima|\s+hasta)?\s*[:=]?\s*(?:hasta\s+)?([0-9.,]+\s*(?:GB|TB))/i));
  store.battery.capacity=assign(store.battery.capacity,first(text,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+\s*mAh)/i));
  store.battery.charge=assign(store.battery.charge,first(text,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+\s*W)/i));
  store.resistance.ip68=store.resistance.ip68??bool(text,/(?:certificaci[oó]n\s+)?IP68/i);store.resistance.ip69k=store.resistance.ip69k??bool(text,/(?:certificaci[oó]n\s+)?IP69K?/i);store.resistance.mil810h=store.resistance.mil810h??bool(text,/MIL-STD-810H/i);
  store.resistance.drop=assign(store.resistance.drop,first(text,/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*([0-9.,]+\s*m)/i));store.resistance.depth=assign(store.resistance.depth,first(text,/profundidad\s+IP68\s*[:=]?\s*([0-9.,]+\s*m)/i));store.resistance.time=assign(store.resistance.time,first(text,/tiempo\s+IP68\s*[:=]?\s*([0-9.,]+\s*min(?:utos?)?)/i));
  store.camera.mainMp=assign(store.camera.mainMp,first(text,/c[aá]mara\s+(?:principal|trasera)\s*[:=]?\s*([0-9.,]+\s*MP)/i));store.camera.mainSensor=assign(store.camera.mainSensor,first(text,/sensor\s+c[aá]mara\s+principal\s*[:=]?\s*([^.;\n]+)/i));store.camera.frontMp=assign(store.camera.frontMp,first(text,/c[aá]mara\s+frontal\s*[:=]?\s*([0-9.,]+\s*MP)/i));
  store.camera.nightMp=assign(store.camera.nightMp,first(text,/(?:c[aá]mara\s+de\s+)?visi[oó]n\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i)??first(text,/c[aá]mara\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i));store.camera.nightVision=store.camera.nightVision??(store.camera.nightMp?true:bool(text,/(?:c[aá]mara\s+)?visi[oó]n\s+nocturna/i));store.camera.nightSensor=assign(store.camera.nightSensor,first(text,/sensor\s+c[aá]mara\s+nocturna\s*[:=]?\s*([^.;\n]+)/i));store.camera.videoMax=assign(store.camera.videoMax,first(text,/resoluci[oó]n\s+m[aá]xima\s+de\s+video\s*[:=]?\s*([^.;\n]+)/i));
  store.connectivity.nfc=store.connectivity.nfc??bool(text,/NFC/i);store.connectivity.googlePay=store.connectivity.googlePay??bool(text,/Google\s+Pay/i);store.connectivity.bluetooth=assign(store.connectivity.bluetooth,first(text,/versi[oó]n\s+Bluetooth\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)/i));store.connectivity.wifiStandard=assign(store.connectivity.wifiStandard,first(text,/(?:est[aá]ndares?\s+)?Wi-?Fi\s*[:=]?\s*(802\.11[^;\n]+)/i));store.connectivity.wifi5=store.connectivity.wifi5??bool(text,/Wi-?Fi\s+5\s*GHz/i);store.connectivity.infrared=store.connectivity.infrared??bool(text,/(?:puerto\s+)?infrarrojo/i);store.connectivity.jack35=store.connectivity.jack35??bool(text,/(?:jack|conector|entrada)\s*(?:de\s*)?3[.,]5\s*mm/i)??bool(text,/Conector\s+3[.,]5\s*mm/i);
  store.network.fiveG=store.network.fiveG??bool(text,/(?:conectividad\s+|red\s+|soporte\s+)?5G/i);store.network.fourG=store.network.fourG??bool(text,/(?:red\s+)?4G(?:\s+LTE)?/i);if(store.network.fourG==null&&/\b4G\s+LTE\b/i.test(text))store.network.fourG=true;
  store.sim.count=assign(store.sim.count,first(text,/cantidad\s+de\s+SIM\s*[:=]?\s*([^.;\n]+)/i));store.sim.type=assign(store.sim.type,first(text,/tipo\s+de\s+SIM\s*[:=]?\s*([^.;\n]+)/i));store.sim.dual4g=store.sim.dual4g??bool(text,/Dual\s+4G/i);store.sim.slots=assign(store.sim.slots,first(text,/cantidad\s+total\s+de\s+ranuras\s*[:=]?\s*([^.;\n]+)/i));
  store.display.size=assign(store.display.size,first(text,/(?:pantalla(?:\s+de)?\s*[:=]?\s*)?([0-9.,]+\s*pulgadas)/i));store.display.refresh=assign(store.display.refresh,first(text,/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+\s*Hz)/i));const displayRes=text.match(/(?:resoluci[oó]n(?:\s+de\s+pantalla)?)\s*[:=]?\s*(\d{3,4})\s*[x×]\s*(\d{3,4})/i);if(!store.display.resolution&&displayRes)store.display.resolution=`${displayRes[1]}×${displayRes[2]}`;
  const processor=first(text,/(?:^|\n)\s*[-*•]?\s*(?:Procesador|Chipset|SoC)\s*[:=]\s*([^;\n]+)/i);if(processor&&!/rendimiento\s+de\s+/i.test(processor))store.performance.processor=assign(store.performance.processor,processor);store.performance.gpu=assign(store.performance.gpu,first(text,/(?:^|\n)\s*[-*•]?\s*GPU\s*[:=]\s*([^;\n]+)/i));
  store.thermal.camera=store.thermal.camera??bool(text,/c[aá]mara\s+t[eé]rmica/i);store.thermal.frequency=assign(store.thermal.frequency,first(text,/frecuencia\s+t[eé]rmica\s*[:=]?\s*([0-9.,]+\s*Hz)/i));const thermalRes=text.match(/resoluci[oó]n\s+t[eé]rmica\s*[:=]?\s*(\d+)\s*[x×]\s*(\d+)/i);if(!store.thermal.resolution&&thermalRes)store.thermal.resolution=`${thermalRes[1]}×${thermalRes[2]}`;const tx=first(text,/resoluci[oó]n\s+t[eé]rmica\s+horizontal\s*[:=]?\s*([0-9]+)\s*px/i),ty=first(text,/resoluci[oó]n\s+t[eé]rmica\s+vertical\s*[:=]?\s*([0-9]+)\s*px/i);if(!store.thermal.resolution&&tx&&ty)store.thermal.resolution=`${tx}×${ty}`;store.thermal.minTemp=assign(store.thermal.minTemp,first(text,/temperatura\s+m[ií]nima\s+t[eé]rmica\s*[:=]?\s*(-?[0-9.,]+\s*°?C)/i));store.thermal.maxTemp=assign(store.thermal.maxTemp,first(text,/temperatura\s+m[aá]xima\s+t[eé]rmica\s*[:=]?\s*(-?[0-9.,]+\s*°?C)/i));store.thermal.app=assign(store.thermal.app,first(text,/aplicaci[oó]n\s+t[eé]rmica\s*[:=]?\s*([^.;\n]+)/i));
  const pos=['GPS','GLONASS','Galileo','BeiDou','QZSS'].filter(name=>new RegExp(`\\b${name}\\b`,'i').test(text));store.positioning.systems=[...new Set([...store.positioning.systems,...pos])];
}

export function buildProductFactStores(rows:RagEvidence[]):ProductFactStore[]{const stores=new Map<string,MutableStore>();for(const row of rows){if(row.domain==='INSTITUTIONAL')continue;const product=productFrom(row);const productId=row.productId??null;const key=productId?`id:${productId}`:`name:${fold(product)}`;const store=stores.get(key)??emptyStore(product,productId);parseRow(store,row);stores.set(key,store);}return [...stores.values()];}
export function findProductFactStore(stores:ProductFactStore[],product:string|null|undefined):ProductFactStore|null{if(!stores.length)return null;if(stores.length===1)return stores[0];const target=fold(product??'');if(!target)return null;const exact=stores.find(store=>fold(store.product)===target);const partial=stores.find(store=>fold(store.product).includes(target)||target.includes(fold(store.product)));return exact??partial??null;}

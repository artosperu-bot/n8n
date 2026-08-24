import type { LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { buildProductFactStores, findProductFactStore, type ProductFactStore } from './FullRagFactKernel.ts';

type Family='MEMORY'|'BATTERY'|'RESISTANCE'|'CAMERA'|'CONNECTIVITY'|'NETWORK'|'SIM'|'DISPLAY'|'PERFORMANCE'|'THERMAL'|'POSITIONING';
type UseProfile='GAMING'|'FIELD'|'DELIVERY'|'WORK'|'NIGHT'|'THERMAL'|'CAMERA'|'GENERIC';
export type FullRagAnswerResult={answer:string;mode:'OVERVIEW'|'CAPABILITY'|'USE_CASE'|'COMPARE'|'RECOMMEND';families:Family[];products:string[]};

function natural(items:string[]):string{const clean=items.filter(Boolean);if(clean.length<=1)return clean[0]??'';if(clean.length===2)return `${clean[0]} y ${clean[1]}`;return `${clean.slice(0,-1).join(', ')} y ${clean.at(-1)}`;}
function boolLabel(value:boolean|null,yes:string,no:string):string|null{return value===true?yes:value===false?no:null;}
function familyFrom(input:LlmWriteInput):Family|null{
  const q=fold(`${input.attribute??''} ${(input.decision?.attributes??[]).join(' ')} ${input.message}`);
  if(/camara termica|termic|thermal|flir|temperatura/.test(q))return'THERMAL';
  if(/nfc|google pay|bluetooth|wifi|wi fi|infrarrojo|audifono|jack|conectividad/.test(q))return'CONNECTIVITY';
  if(/5g|4g|lte|redes?/.test(q))return'NETWORK';
  if(/dual sim|nano sim|\bsim\b|esim/.test(q))return'SIM';
  if(/resisten|caida|golpe|ip68|ip69|mil|agua|polvo/.test(q))return'RESISTANCE';
  if(/vision nocturna|camara|camaras|foto|video|sensor/.test(q))return'CAMERA';
  if(/ram|memoria|almacen|micro.?sd|rom/.test(q))return'MEMORY';
  if(/bateria|autonomia|carga|cargar/.test(q))return'BATTERY';
  if(/pantalla|display|hz|pulgadas|resolucion/.test(q))return'DISPLAY';
  if(/procesador|rendimiento|cpu|gpu|gaming|jugar|juego|free fire|pubg|cod mobile/.test(q))return'PERFORMANCE';
  if(/gps|galileo|glonass|beidou|posicionamiento/.test(q))return'POSITIONING';
  return null;
}
function profile(input:LlmWriteInput):UseProfile{
  const state:any=input.state??{};const q=fold(`${input.message} ${input.useCase??state.useCase??''} ${input.problem??state.problem??''} ${(input.priorities??state.priorities??[]).join(' ')}`);
  if(/camara termica|termic|thermal|flir|medir temperatura|inspeccion.*temperatura/.test(q))return'THERMAL';
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(q))return'GAMING';
  if(/delivery|repart|logistica/.test(q))return'DELIVERY';
  if(/campo|construccion|obra|mineria|tecnico|caida|golpe|rugged/.test(q))return'FIELD';
  if(/noche|nocturn|vigilancia/.test(q))return'NIGHT';
  if(/foto|fotografia|video|contenido|redes sociales/.test(q))return'CAMERA';
  if(/trabajo|oficina|whatsapp|correo|navegador|multitarea|varias apps|uso diario/.test(q))return'WORK';
  return'GENERIC';
}
function productName(input:LlmWriteInput):string|null{const state:any=input.state??{};return String(input.recommendedProduct??input.resolvedProduct??input.quote?.shortName??input.quote?.product??input.activeProduct??state.activeProduct??'').trim()||null;}

function memory(s:ProductFactStore):string|null{const x=[s.memory.ramPhysical?`${s.memory.ramPhysical} de RAM física`:'',s.memory.ramVirtual?`hasta ${s.memory.ramVirtual} de RAM virtual`:'',s.memory.storage?`${s.memory.storage} de almacenamiento`:'',s.memory.microSd?`microSD hasta ${s.memory.microSd}`:''].filter(Boolean);return x.length?natural(x):null;}
function battery(s:ProductFactStore):string|null{const x=[s.battery.capacity?`batería de ${s.battery.capacity}`:'',s.battery.charge?`carga de ${s.battery.charge}`:''].filter(Boolean);return x.length?natural(x):null;}
function resistance(s:ProductFactStore):string|null{const certs=[s.resistance.ip68?'IP68':'',s.resistance.ip69k?'IP69K':'',s.resistance.mil810h?'MIL-STD-810H':''].filter(Boolean);const x=[certs.length?`certificaciones ${natural(certs)}`:'',s.resistance.drop?`resistencia a caídas de ${s.resistance.drop}`:'',s.resistance.depth&&s.resistance.time?`protección IP68 hasta ${s.resistance.depth} durante ${s.resistance.time}`:''].filter(Boolean);return x.length?natural(x):null;}
function camera(s:ProductFactStore):string|null{const x=[s.camera.mainMp?`cámara principal de ${s.camera.mainMp}${s.camera.mainSensor?` con sensor ${s.camera.mainSensor}`:''}`:'',s.camera.frontMp?`frontal de ${s.camera.frontMp}`:'',s.camera.nightVision?(s.camera.nightMp?`visión nocturna de ${s.camera.nightMp}${s.camera.nightSensor?` con sensor ${s.camera.nightSensor}`:''}`:'visión nocturna'):'',s.camera.videoMax?`video hasta ${s.camera.videoMax}`:''].filter(Boolean);return x.length?natural(x):null;}
function connectivity(s:ProductFactStore,q:string):string|null{
  if(/google pay/.test(q)){if(s.connectivity.googlePay===true)return `Google Pay confirmado${s.connectivity.nfc===true?' mediante NFC':''}`;if(s.connectivity.googlePay===false)return'Google Pay no confirmado';}
  if(/\bnfc\b/.test(q)){const x=[boolLabel(s.connectivity.nfc,'NFC','sin NFC'),s.connectivity.googlePay===true?'Google Pay confirmado':''].filter((v):v is string=>Boolean(v));return x.length?natural(x):null;}
  if(/bluetooth/.test(q))return s.connectivity.bluetooth?`Bluetooth ${s.connectivity.bluetooth}`:null;
  if(/wifi|wi fi/.test(q)){const x=[s.connectivity.wifi5===true?'Wi‑Fi 5 GHz':'',s.connectivity.wifiStandard?`estándar ${s.connectivity.wifiStandard}`:''].filter(Boolean);return x.length?natural(x):null;}
  if(/infrarrojo/.test(q))return boolLabel(s.connectivity.infrared,'puerto infrarrojo','sin puerto infrarrojo');
  if(/audifono|jack|3[.,]5/.test(q))return boolLabel(s.connectivity.jack35,'entrada de 3.5 mm','sin entrada de 3.5 mm');
  const x=[s.connectivity.nfc===true?'NFC':'',s.connectivity.bluetooth?`Bluetooth ${s.connectivity.bluetooth}`:'',s.connectivity.wifiStandard?`Wi‑Fi ${s.connectivity.wifiStandard}`:''].filter(Boolean);return x.length?natural(x):null;
}
function network(s:ProductFactStore,q:string):string|null{if(/5g/.test(q)){if(s.network.fiveG===true)return'5G';if(s.network.fiveG===false)return s.network.fourG===true?'no tiene 5G; sí tiene 4G LTE':'no tiene 5G';if(s.network.fourG===true)return'5G no confirmado; 4G LTE sí documentado';}if(/4g|lte/.test(q))return boolLabel(s.network.fourG,'4G LTE','sin 4G LTE');const x=[s.network.fiveG===true?'5G':'',s.network.fourG===true?'4G LTE':''].filter(Boolean);return x.length?natural(x):null;}
function sim(s:ProductFactStore):string|null{const count=s.sim.count?`Dual SIM (${s.sim.count})`:null;const x=[count,s.sim.type,s.sim.dual4g===true?'Dual 4G':'',s.sim.slots?`${s.sim.slots} ranuras en total`:'' ].filter((v):v is string=>Boolean(v));return x.length?natural(x):null;}
function display(s:ProductFactStore):string|null{const x=[s.display.size,s.display.refresh,s.display.resolution].filter((v):v is string=>Boolean(v));return x.length?natural(x):null;}
function performance(s:ProductFactStore):string|null{const x=[s.performance.processor?`procesador ${s.performance.processor}`:'',s.performance.gpu?`GPU ${s.performance.gpu}`:''].filter(Boolean);return x.length?natural(x):null;}
function thermal(s:ProductFactStore):string|null{if(s.thermal.camera===false)return'no tiene cámara térmica';if(s.thermal.camera!==true)return null;const x=['cámara térmica',s.thermal.frequency,s.thermal.resolution?`resolución ${s.thermal.resolution}`:'',s.thermal.minTemp&&s.thermal.maxTemp?`rango ${s.thermal.minTemp} a ${s.thermal.maxTemp}`:'',s.thermal.app?`app ${s.thermal.app}`:''].filter(Boolean);return natural(x);}
function positioning(s:ProductFactStore):string|null{return s.positioning.systems.length?natural(s.positioning.systems):null;}
function familySummary(s:ProductFactStore,f:Family,q=''):string|null{switch(f){case'MEMORY':return memory(s);case'BATTERY':return battery(s);case'RESISTANCE':return resistance(s);case'CAMERA':return camera(s);case'CONNECTIVITY':return connectivity(s,q);case'NETWORK':return network(s,q);case'SIM':return sim(s);case'DISPLAY':return display(s);case'PERFORMANCE':return performance(s);case'THERMAL':return thermal(s);case'POSITIONING':return positioning(s);}}

function overview(s:ProductFactStore):string|null{const groups:[string,string|null][]=[['memoria',memory(s)],['batería',battery(s)],['resistencia',resistance(s)],['cámaras',camera(s)],['pantalla',display(s)],['rendimiento',performance(s)]];const selected=groups.filter((g):g is [string,string]=>Boolean(g[1])).slice(0,5);if(!selected.length)return null;return `${s.product} viene con ${selected.map(([label,value])=>`${label}: ${value}`).join('. ')}.`;}
function capability(input:LlmWriteInput,s:ProductFactStore):FullRagAnswerResult|null{const family=familyFrom(input);if(!family)return null;const q=fold(input.message);const detail=familySummary(s,family,q);if(!detail)return null;let prefix=`${s.product} tiene `;if(family==='RESISTANCE')prefix=`${s.product} cuenta con `;if(family==='THERMAL'&&s.thermal.camera===false)return{answer:`No, ${s.product} no tiene cámara térmica.`,mode:'CAPABILITY',families:[family],products:[s.product]};if(family==='CONNECTIVITY'&&/nfc|google pay|wifi|infrarrojo/.test(q)&&!detail.startsWith('sin ')&&!detail.startsWith('Google Pay no'))prefix=`Sí, ${s.product} tiene `;if(family==='NETWORK'&&/5g/.test(q)&&detail.startsWith('no tiene'))return{answer:`No, ${s.product} ${detail}.`,mode:'CAPABILITY',families:[family],products:[s.product]};return{answer:`${prefix}${detail}.`,mode:'CAPABILITY',families:[family],products:[s.product]};}
function useCase(input:LlmWriteInput,s:ProductFactStore):FullRagAnswerResult|null{const p=profile(input);let families:Family[]=[];let conclusion='';if(p==='GAMING'){families=['PERFORMANCE','MEMORY','DISPLAY','BATTERY'];conclusion='Por esas especificaciones es razonable esperar que pueda ejecutar juegos móviles de este tipo; no afirmo FPS ni calidad gráfica exacta sin un benchmark verificado.';}else if(p==='FIELD'){families=['RESISTANCE','BATTERY','POSITIONING'];conclusion='Para trabajo de campo, resistencia y autonomía son los puntos que más pesan.';}else if(p==='DELIVERY'){families=['BATTERY','POSITIONING','NETWORK','RESISTANCE'];conclusion='Para delivery, esto cubre autonomía, navegación, conexión y uso en ruta.';}else if(p==='WORK'){families=['PERFORMANCE','MEMORY','BATTERY'];conclusion='Para trabajo y multitarea, procesador, memoria y autonomía son la base de la experiencia.';}else if(p==='NIGHT'){families=['CAMERA','BATTERY'];conclusion='Para trabajo nocturno, la visión nocturna es la característica diferencial cuando está documentada.';}else if(p==='THERMAL'){families=['THERMAL','RESISTANCE','BATTERY'];conclusion='La cámara térmica es un requisito distinto de la visión nocturna y no se sustituye por ella.';}else if(p==='CAMERA'){families=['CAMERA','MEMORY','DISPLAY'];conclusion='Para fotos o contenido, conviene priorizar cámara y espacio disponible.';}else return null;const details=families.map(f=>familySummary(s,f,fold(input.message))).filter((v):v is string=>Boolean(v));if(!details.length)return null;const game=/free fire/i.test(input.message)?'Free Fire':/pubg/i.test(input.message)?'PUBG':/cod mobile|call of duty/i.test(input.message)?'Call of Duty Mobile':null;const intro=p==='GAMING'&&game?`Para ${game}, ${s.product} cuenta con`:`Para ese uso, ${s.product} cuenta con`;return{answer:`${intro} ${natural(details)}. ${conclusion}`,mode:'USE_CASE',families,products:[s.product]};}
function numberValue(value:string|null):number|null{if(!value)return null;const n=Number(value.replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;}
function compareConclusion(a:ProductFactStore,b:ProductFactStore,f:Family):string|null{if(f==='BATTERY'){const av=numberValue(a.battery.capacity),bv=numberValue(b.battery.capacity),aw=numberValue(a.battery.charge),bw=numberValue(b.battery.charge);if(av!=null&&bv!=null&&av!==bv){const win=av>bv?a:b;const max=Math.max(av,bv),min=Math.min(av,bv);const extra=aw!=null&&bw!=null&&aw!==bw?` En carga, ${aw>bw?a.product:b.product} tiene mayor potencia (${Math.max(aw,bw)} vs ${Math.min(aw,bw)} W).`:'';return `En batería, ${win.product} tiene más capacidad (${max} vs ${min} mAh).${extra}`;}}
  if(f==='MEMORY'){const av=numberValue(a.memory.ramPhysical),bv=numberValue(b.memory.ramPhysical);if(av!=null&&bv!=null&&av!==bv)return`En RAM física, ${av>bv?a.product:b.product} tiene ventaja (${Math.max(av,bv)} vs ${Math.min(av,bv)} GB).`;}
  if(f==='DISPLAY'){const av=numberValue(a.display.refresh),bv=numberValue(b.display.refresh);if(av!=null&&bv!=null&&av!==bv)return`En refresco de pantalla, ${av>bv?a.product:b.product} tiene ventaja (${Math.max(av,bv)} vs ${Math.min(av,bv)} Hz).`;}
  if(f==='THERMAL'&&a.thermal.camera!==b.thermal.camera){const win=a.thermal.camera===true?a:b;return`Si la cámara térmica es requisito, ${win.product} es el que la tiene documentada.`;}
  if(f==='RESISTANCE'){const ad=numberValue(a.resistance.drop),bd=numberValue(b.resistance.drop);if(ad!=null&&bd!=null&&ad!==bd)return`En resistencia a caídas, ${ad>bd?a.product:b.product} tiene la cifra mayor (${Math.max(ad,bd)} vs ${Math.min(ad,bd)} m).`;}
  return null;}
function compare(input:LlmWriteInput,stores:ProductFactStore[]):FullRagAnswerResult|null{if(stores.length<2)return null;const [a,b]=stores.slice(0,2);const p=profile(input);let families:Family[]=[];const explicit=familyFrom(input);if(p==='GAMING')families=['PERFORMANCE','MEMORY','DISPLAY'];else if(p==='FIELD')families=['RESISTANCE','BATTERY'];else if(p==='DELIVERY')families=['BATTERY','POSITIONING','NETWORK'];else if(explicit)families=[explicit];else families=['BATTERY','RESISTANCE','MEMORY','CAMERA'];const aParts=families.map(f=>familySummary(a,f,fold(input.message))).filter((v):v is string=>Boolean(v));const bParts=families.map(f=>familySummary(b,f,fold(input.message))).filter((v):v is string=>Boolean(v));if(!aParts.length||!bParts.length)return null;let conclusion=compareConclusion(a,b,families[0]);if(!conclusion&&p==='GAMING'){const ar=numberValue(a.memory.ramPhysical),br=numberValue(b.memory.ramPhysical),ah=numberValue(a.display.refresh),bh=numberValue(b.display.refresh);const aw=Number(ar!=null&&br!=null&&ar>br)+Number(ah!=null&&bh!=null&&ah>bh),bw=Number(ar!=null&&br!=null&&br>ar)+Number(ah!=null&&bh!=null&&bh>ah);if(aw!==bw)conclusion=`Para gaming, ${aw>bw?a.product:b.product} parte con ventaja en las diferencias medibles de RAM y pantalla; no afirmo superioridad de CPU/GPU sin benchmark verificado.`;}return{answer:`${a.product}: ${aParts.join('; ')}. ${b.product}: ${bParts.join('; ')}.${conclusion?` ${conclusion}`:''}`,mode:'COMPARE',families,products:[a.product,b.product]};}
function recommendationFamilies(input:LlmWriteInput):Family[]{const p=profile(input);const q=fold(`${input.message} ${(input.priorities??input.state?.priorities??[]).join(' ')}`);const out:Family[]=[];if(/termic|thermal/.test(q)||p==='THERMAL')out.push('THERMAL');if(/nfc/.test(q))out.push('CONNECTIVITY');if(/resisten|caida|golpe|campo|construccion/.test(q)||p==='FIELD')out.push('RESISTANCE');if(/bateria|autonomia|delivery/.test(q)||['FIELD','DELIVERY'].includes(p))out.push('BATTERY');if(p==='GAMING')out.push('PERFORMANCE','MEMORY','DISPLAY');if(p==='WORK')out.push('PERFORMANCE','MEMORY','BATTERY');return [...new Set(out)].slice(0,4);}
function recommend(input:LlmWriteInput,stores:ProductFactStore[]):FullRagAnswerResult|null{const name=productName(input);let store=findProductFactStore(stores,name);const families=recommendationFamilies(input);if(families.includes('THERMAL')&&store?.thermal.camera!==true){const thermalStore=stores.find(s=>s.thermal.camera===true);if(thermalStore)store=thermalStore;}if(!store)return null;const details=families.map(f=>familySummary(store!,f,fold(input.message))).filter((v):v is string=>Boolean(v));if(!details.length)return null;return{answer:`Para lo que buscas, me iría por ${store.product}: ${details.join('; ')}.`,mode:'RECOMMEND',families,products:[store.product]};}

export function buildFullRagAnswer(input:LlmWriteInput):FullRagAnswerResult|null{
  const intent=String(input.intent??'').toUpperCase();if(['POLICY','WARRANTY'].includes(intent))return null;
  const stores=buildProductFactStores(input.rag??[]);if(!stores.length)return null;
  if(intent==='COMPARE')return compare(input,stores);
  if(intent==='RECOMMEND'||intent==='RECOMMEND_WITHIN_BUDGET')return recommend(input,stores);
  const target=findProductFactStore(stores,productName(input));if(!target)return null;
  if(intent==='EVALUATE_USE')return useCase(input,target);
  if(['ATTRIBUTE','CAPABILITY'].includes(intent))return capability(input,target);
  if(intent==='PRODUCT_INFO'){const answer=overview(target);return answer?{answer,mode:'OVERVIEW',families:['MEMORY','BATTERY','RESISTANCE','CAMERA','DISPLAY'],products:[target.product]}:null;}
  return null;
}

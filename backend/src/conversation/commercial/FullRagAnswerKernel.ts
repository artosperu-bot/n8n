import type { LlmWriteInput } from '../../ports/LlmProvider.ts';
import { fold } from '../../shared/text.ts';
import { buildProductFactStores, findProductFactStore, type ProductFactStore } from './FullRagFactKernel.ts';

type Family='MEMORY'|'BATTERY'|'RESISTANCE'|'CAMERA'|'CONNECTIVITY'|'NETWORK'|'SIM'|'DISPLAY'|'PERFORMANCE'|'THERMAL'|'POSITIONING';
type UseProfile='GAMING'|'FIELD'|'DELIVERY'|'WORK'|'NIGHT'|'THERMAL'|'CAMERA'|'GENERIC';
export type FullRagAnswerResult={answer:string;mode:'OVERVIEW'|'CAPABILITY'|'USE_CASE'|'COMPARE'|'RECOMMEND';families:Family[];products:string[]};

function natural(items:string[]):string{
  const clean=items.filter(Boolean);
  if(clean.length<=1)return clean[0]??'';
  if(clean.length===2)return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0,-1).join(', ')} y ${clean.at(-1)}`;
}
function boolLabel(value:boolean|null,yes:string,no:string):string|null{return value===true?yes:value===false?no:null;}
function familyFromText(input:LlmWriteInput):Family|null{
  const q=fold(`${input.attribute??''} ${input.message}`);
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
function familyFrom(input:LlmWriteInput):Family|null{
  const fromText=familyFromText(input);if(fromText)return fromText;
  const decision=fold((input.decision?.attributes??[]).join(' '));
  if(/termic/.test(decision))return'THERMAL';
  if(/nfc|conect/.test(decision))return'CONNECTIVITY';
  if(/5g|4g|red/.test(decision))return'NETWORK';
  if(/sim/.test(decision))return'SIM';
  if(/resisten|durab|caida/.test(decision))return'RESISTANCE';
  if(/camara|video/.test(decision))return'CAMERA';
  if(/ram|memoria|storage/.test(decision))return'MEMORY';
  if(/bateria|battery/.test(decision))return'BATTERY';
  if(/pantalla|display/.test(decision))return'DISPLAY';
  if(/procesador|rendimiento|performance|cpu|gpu/.test(decision))return'PERFORMANCE';
  return null;
}
function profile(input:LlmWriteInput):UseProfile{
  const state:any=input.state??{};
  const q=fold(`${input.message} ${input.useCase??state.useCase??''} ${input.problem??state.problem??''} ${(input.priorities??state.priorities??[]).join(' ')}`);
  if(/camara termica|termic|thermal|flir|medir temperatura|inspeccion.*temperatura/.test(q))return'THERMAL';
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(q))return'GAMING';
  if(/delivery|repart|logistica/.test(q))return'DELIVERY';
  if(/campo|construccion|obra|mineria|tecnico|caida|golpe|rugged/.test(q))return'FIELD';
  if(/noche|nocturn|vigilancia/.test(q))return'NIGHT';
  if(/foto|fotografia|video|contenido|redes sociales/.test(q))return'CAMERA';
  if(/trabajo|oficina|whatsapp|correo|navegador|multitarea|varias apps|uso diario/.test(q))return'WORK';
  return'GENERIC';
}
function productName(input:LlmWriteInput):string|null{
  const state:any=input.state??{};
  const direct=String(input.resolvedProduct??input.quote?.shortName??input.quote?.product??input.activeProduct??state.activeProduct??'').trim();
  if(direct)return direct;
  return String(input.recommendedProduct??state.recommendedProduct??'').trim()||null;
}

function memory(s:ProductFactStore,q=''):string|null{
  if(/micro.?sd/.test(q))return s.memory.microSd?`microSD hasta ${s.memory.microSd}`:null;
  if(/\bram\b/.test(q)){
    const x=[s.memory.ramPhysical?`${s.memory.ramPhysical} de RAM física`:'',s.memory.ramVirtual?`hasta ${s.memory.ramVirtual} de RAM virtual`:''].filter(Boolean);
    return x.length?natural(x):null;
  }
  if(/almacen|espacio|rom/.test(q)){
    const x=[s.memory.storage?`${s.memory.storage} de almacenamiento`:'',s.memory.microSd?`microSD hasta ${s.memory.microSd}`:''].filter(Boolean);
    return x.length?natural(x):null;
  }
  const x=[s.memory.ramPhysical?`${s.memory.ramPhysical} de RAM física`:'',s.memory.ramVirtual?`hasta ${s.memory.ramVirtual} de RAM virtual`:'',s.memory.storage?`${s.memory.storage} de almacenamiento`:'',s.memory.microSd?`microSD hasta ${s.memory.microSd}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function memoryRam(s:ProductFactStore):string|null{return memory(s,'ram');}
function memoryWork(s:ProductFactStore):string|null{
  const x=[memoryRam(s),s.memory.storage?`${s.memory.storage} de almacenamiento`:''].filter((v):v is string=>Boolean(v));
  return x.length?natural(x):null;
}
function battery(s:ProductFactStore,q=''):string|null{
  if(/carga|cargar|watts?|\bw\b/.test(q)&&!/bateria|autonomia/.test(q))return s.battery.charge?`carga de ${s.battery.charge}`:null;
  const x=[s.battery.capacity?`batería de ${s.battery.capacity}`:'',s.battery.charge?`carga de ${s.battery.charge}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function resistance(s:ProductFactStore,q=''):string|null{
  const certs=[s.resistance.ip68?'IP68':'',s.resistance.ip69k?'IP69K':'',s.resistance.mil810h?'MIL-STD-810H':''].filter(Boolean);
  if(/\bip68\b/.test(q)&&!/resisten|golpe|caida|agua|polvo/.test(q)){
    const x=[s.resistance.ip68?'IP68':'',s.resistance.depth&&s.resistance.time?`protección hasta ${s.resistance.depth} durante ${s.resistance.time}`:''].filter(Boolean);
    return x.length?natural(x):null;
  }
  const x=[certs.length?`certificaciones ${natural(certs)}`:'',s.resistance.drop?`resistencia a caídas de ${s.resistance.drop}`:'',s.resistance.depth&&s.resistance.time?`protección IP68 hasta ${s.resistance.depth} durante ${s.resistance.time}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function camera(s:ProductFactStore,q=''):string|null{
  if(/nocturn/.test(q)){
    if(!s.camera.nightVision)return null;
    const x=[s.camera.nightMp?`visión nocturna de ${s.camera.nightMp}`:'visión nocturna',s.camera.nightSensor?`sensor ${s.camera.nightSensor}`:''].filter(Boolean);
    return natural(x);
  }
  if(/sensor/.test(q)){
    const x=[s.camera.mainSensor?`sensor principal ${s.camera.mainSensor}`:'',s.camera.nightSensor?`sensor nocturno ${s.camera.nightSensor}`:''].filter(Boolean);
    return x.length?natural(x):null;
  }
  if(/video/.test(q))return s.camera.videoMax?`video hasta ${s.camera.videoMax}`:null;
  const x=[s.camera.mainMp?`cámara principal de ${s.camera.mainMp}${s.camera.mainSensor?` con sensor ${s.camera.mainSensor}`:''}`:'',s.camera.frontMp?`frontal de ${s.camera.frontMp}`:'',s.camera.nightVision?(s.camera.nightMp?`visión nocturna de ${s.camera.nightMp}${s.camera.nightSensor?` con sensor ${s.camera.nightSensor}`:''}`:'visión nocturna'):'',s.camera.videoMax?`video hasta ${s.camera.videoMax}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function connectivity(s:ProductFactStore,q:string):string|null{
  if(/google pay/.test(q)){
    if(s.connectivity.googlePay===true)return `Google Pay confirmado${s.connectivity.nfc===true?' mediante NFC':''}`;
    if(s.connectivity.googlePay===false)return'Google Pay no confirmado';
  }
  if(/\bnfc\b/.test(q)){
    const x=[boolLabel(s.connectivity.nfc,'NFC','sin NFC'),s.connectivity.googlePay===true?'Google Pay confirmado':''].filter((v):v is string=>Boolean(v));
    return x.length?natural(x):null;
  }
  if(/bluetooth/.test(q))return s.connectivity.bluetooth?`Bluetooth ${s.connectivity.bluetooth}`:null;
  if(/wifi|wi fi/.test(q)){
    const x=[s.connectivity.wifi5===true?'Wi‑Fi 5 GHz':'',s.connectivity.wifiStandard?`estándar ${s.connectivity.wifiStandard}`:''].filter(Boolean);
    return x.length?natural(x):null;
  }
  if(/infrarrojo/.test(q))return boolLabel(s.connectivity.infrared,'puerto infrarrojo','sin puerto infrarrojo');
  if(/audifono|jack|3[.,]5/.test(q))return boolLabel(s.connectivity.jack35,'entrada de 3.5 mm','sin entrada de 3.5 mm');
  const x=[s.connectivity.nfc===true?'NFC':'',s.connectivity.bluetooth?`Bluetooth ${s.connectivity.bluetooth}`:'',s.connectivity.wifiStandard?`Wi‑Fi ${s.connectivity.wifiStandard}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function network(s:ProductFactStore,q:string):string|null{
  if(/5g/.test(q)){
    if(s.network.fiveG===true)return'5G';
    if(s.network.fiveG===false)return s.network.fourG===true?'no tiene 5G; sí tiene 4G LTE':'no tiene 5G';
    if(s.network.fourG===true)return'5G no confirmado; 4G LTE sí documentado';
  }
  if(/4g|lte/.test(q))return boolLabel(s.network.fourG,'4G LTE','sin 4G LTE');
  const x=[s.network.fiveG===true?'5G':'',s.network.fourG===true?'4G LTE':''].filter(Boolean);
  return x.length?natural(x):null;
}
function sim(s:ProductFactStore):string|null{
  const count=s.sim.count?`Dual SIM (${s.sim.count})`:null;
  const x=[count,s.sim.type,s.sim.dual4g===true?'Dual 4G':'',s.sim.slots?`${s.sim.slots} ranuras en total`:'' ].filter((v):v is string=>Boolean(v));
  return x.length?natural(x):null;
}
function display(s:ProductFactStore,q=''):string|null{
  if(/hz|refresco|frecuencia/.test(q))return s.display.refresh?s.display.refresh:null;
  const x=[s.display.size,s.display.refresh,s.display.resolution].filter((v):v is string=>Boolean(v));
  return x.length?natural(x):null;
}
function displayGaming(s:ProductFactStore):string|null{
  const x=[s.display.refresh,s.display.size].filter((v):v is string=>Boolean(v));
  return x.length?natural(x):null;
}
function performance(s:ProductFactStore):string|null{
  const x=[s.performance.processor?`procesador ${s.performance.processor}`:'',s.performance.gpu?`GPU ${s.performance.gpu}`:''].filter(Boolean);
  return x.length?natural(x):null;
}
function thermal(s:ProductFactStore):string|null{
  if(s.thermal.camera===false)return'no tiene cámara térmica';
  if(s.thermal.camera!==true)return null;
  const x=['cámara térmica',s.thermal.frequency,s.thermal.resolution?`resolución ${s.thermal.resolution}`:'',s.thermal.minTemp&&s.thermal.maxTemp?`rango ${s.thermal.minTemp} a ${s.thermal.maxTemp}`:'',s.thermal.app?`app ${s.thermal.app}`:''].filter(Boolean);
  return natural(x);
}
function positioning(s:ProductFactStore):string|null{return s.positioning.systems.length?natural(s.positioning.systems):null;}
function familySummary(s:ProductFactStore,f:Family,q=''):string|null{
  switch(f){
    case'MEMORY':return memory(s,q);
    case'BATTERY':return battery(s,q);
    case'RESISTANCE':return resistance(s,q);
    case'CAMERA':return camera(s,q);
    case'CONNECTIVITY':return connectivity(s,q);
    case'NETWORK':return network(s,q);
    case'SIM':return sim(s);
    case'DISPLAY':return display(s,q);
    case'PERFORMANCE':return performance(s);
    case'THERMAL':return thermal(s);
    case'POSITIONING':return positioning(s);
  }
}

function overviewFab(input:LlmWriteInput,s:ProductFactStore):string{
  const state:any=input.state??{};
  const context=fold(`${input.useCase??state.useCase??''} ${input.problem??state.problem??''} ${(input.priorities??state.priorities??[]).join(' ')}`);
  if(/construccion|campo|obra|mineria|caida|golpe/.test(context))return'En la práctica: para trabajo exigente, las certificaciones de resistencia, la protección frente a caídas y la batería son los datos más relevantes.';
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(context))return'En la práctica: para gaming, procesador, RAM y frecuencia de pantalla son los datos que más pesan; no afirmo FPS sin benchmark verificado.';
  if(/noche|nocturn|vigilancia/.test(context)&&s.camera.nightVision)return'En la práctica: para uso nocturno, la cámara de visión nocturna es la característica diferencial documentada.';
  if(/trabajo|oficina|whatsapp|correo|multitarea/.test(context))return'En la práctica: para trabajo diario, procesador, memoria y batería son los puntos principales a evaluar.';
  if(s.thermal.camera===true)return'En la práctica: además de las características rugged, la cámara térmica es un diferencial técnico de este equipo.';
  if(s.resistance.ip68||s.resistance.ip69k||s.resistance.mil810h)return'En la práctica: combina resistencia rugged documentada, batería y memoria para un uso exigente.';
  return'En la práctica: rendimiento, memoria y batería son los puntos principales para decidir si encaja con tu uso.';
}
function overview(input:LlmWriteInput,s:ProductFactStore):string|null{
  const perf=[s.performance.processor,s.performance.gpu?`GPU ${s.performance.gpu}`:''].filter(Boolean).join(', ');
  const mem=[s.memory.ramPhysical?`${s.memory.ramPhysical} de RAM física`:'',s.memory.ramVirtual?`hasta ${s.memory.ramVirtual} de RAM virtual`:'',s.memory.storage?`${s.memory.storage} de almacenamiento`:'',s.memory.microSd?`microSD hasta ${s.memory.microSd}`:''].filter(Boolean).join(', ');
  const bat=[s.battery.capacity,s.battery.charge?`carga de ${s.battery.charge}`:''].filter(Boolean).join(', ');
  const resist=resistance(s)??'';
  const cams=[s.camera.mainMp?`${s.camera.mainMp} principal`:'',s.camera.frontMp?`${s.camera.frontMp} frontal`:'',s.camera.nightMp?`${s.camera.nightMp} nocturna`:'',s.camera.videoMax?`video ${s.camera.videoMax}`:'',s.thermal.camera===true?(s.thermal.frequency?`térmica ${s.thermal.frequency}`:'cámara térmica'):'' ].filter(Boolean).join(', ');
  const screen=[s.display.size,s.display.refresh,s.display.resolution].filter(Boolean).join(', ');
  const lines=[
    perf?`1. Rendimiento: ${perf}.`:'',
    mem?`2. Memoria: ${mem}.`:'',
    bat?`3. Batería: ${bat}.`:'',
    resist?`4. Resistencia: ${resist}.`:'',
    cams?`5. Cámaras: ${cams}.`:'',
    screen?`6. Pantalla: ${screen}.`:'',
  ].filter(Boolean);
  return lines.length?`${s.product}:\n${lines.join('\n')}\n\n${overviewFab(input,s)}`:null;
}
function capability(input:LlmWriteInput,s:ProductFactStore):FullRagAnswerResult|null{
  const family=familyFrom(input);if(!family)return null;
  const q=fold(input.message);const detail=familySummary(s,family,q);if(!detail)return null;
  if(family==='THERMAL'&&s.thermal.camera===false)return{answer:`No, ${s.product} no tiene cámara térmica.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  if(family==='CONNECTIVITY'&&/google pay/.test(q)&&s.connectivity.googlePay===true)return{answer:`Sí, ${s.product} tiene Google Pay confirmado${s.connectivity.nfc===true?' y NFC':''}.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  if(family==='CONNECTIVITY'&&/\bnfc\b/.test(q)&&s.connectivity.nfc===true)return{answer:`Sí, ${s.product} tiene ${detail}. Esto permite usar pagos contactless compatibles.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  if(family==='CAMERA'&&/nocturn/.test(q)&&s.camera.nightVision)return{answer:`Sí, ${s.product} tiene ${detail}. Es la cámara específica para capturas nocturnas.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  if(family==='THERMAL'&&s.thermal.camera===true)return{answer:`Sí, ${s.product} tiene ${detail}. Ese rango es útil para inspecciones térmicas.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  if(family==='NETWORK'&&/5g/.test(q)){
    if(detail.startsWith('no tiene'))return{answer:`No, ${s.product} ${detail}.`,mode:'CAPABILITY',families:[family],products:[s.product]};
    if(detail.startsWith('5G no confirmado'))return{answer:`No tengo 5G confirmado para ${s.product}; lo que sí está documentado es 4G LTE.`,mode:'CAPABILITY',families:[family],products:[s.product]};
  }
  let prefix=`${s.product} tiene `;
  if(family==='RESISTANCE')prefix=`${s.product} cuenta con `;
  if(family==='CONNECTIVITY'&&/wifi|infrarrojo/.test(q)&&!detail.startsWith('sin '))prefix=`Sí, ${s.product} tiene `;
  return{answer:`${prefix}${detail}.`,mode:'CAPABILITY',families:[family],products:[s.product]};
}
function useCase(input:LlmWriteInput,s:ProductFactStore):FullRagAnswerResult|null{
  const p=profile(input);let families:Family[]=[];let details:string[]=[];let conclusion='';
  if(p==='GAMING'){
    families=['PERFORMANCE','MEMORY','DISPLAY','BATTERY'];details=[performance(s),memoryRam(s),displayGaming(s),battery(s)].filter((v):v is string=>Boolean(v));
    conclusion='Por esas especificaciones es razonable esperar que pueda ejecutar juegos móviles de este tipo; no afirmo FPS ni calidad gráfica exacta sin un benchmark verificado.';
  }else if(p==='FIELD'){
    families=['RESISTANCE','BATTERY','POSITIONING'];details=[resistance(s),battery(s),positioning(s)].filter((v):v is string=>Boolean(v));
    conclusion='Para trabajo de campo, resistencia y autonomía son los puntos que más pesan.';
  }else if(p==='DELIVERY'){
    families=['BATTERY','POSITIONING','NETWORK','RESISTANCE'];details=[battery(s),positioning(s),network(s,''),resistance(s)].filter((v):v is string=>Boolean(v));
    conclusion='Para delivery, esto cubre autonomía, navegación, conexión y uso en ruta.';
  }else if(p==='WORK'){
    families=['PERFORMANCE','MEMORY','BATTERY'];details=[performance(s),memoryWork(s),battery(s)].filter((v):v is string=>Boolean(v));
    conclusion='Para trabajo y multitarea, procesador, memoria y autonomía son la base de la experiencia.';
  }else if(p==='NIGHT'){
    families=['CAMERA','BATTERY'];details=[camera(s,'vision nocturna'),battery(s)].filter((v):v is string=>Boolean(v));
    conclusion='Para trabajo nocturno, la visión nocturna es la característica diferencial cuando está documentada.';
  }else if(p==='THERMAL'){
    families=['THERMAL','RESISTANCE','BATTERY'];details=[thermal(s),resistance(s),battery(s)].filter((v):v is string=>Boolean(v));
    conclusion='La cámara térmica es un requisito distinto de la visión nocturna y no se sustituye por ella.';
  }else if(p==='CAMERA'){
    families=['CAMERA','MEMORY','DISPLAY'];details=[camera(s),memory(s,'almacenamiento'),display(s)].filter((v):v is string=>Boolean(v));
    conclusion='Para fotos o contenido, conviene priorizar cámara y espacio disponible.';
  }else return null;
  if(!details.length)return null;
  const game=/free fire/i.test(input.message)?'Free Fire':/pubg/i.test(input.message)?'PUBG':/cod mobile|call of duty/i.test(input.message)?'Call of Duty Mobile':null;
  const intro=p==='GAMING'&&game?`Para ${game}, ${s.product} cuenta con`:`Para ese uso, ${s.product} cuenta con`;
  return{answer:`${intro} ${natural(details)}. ${conclusion}`,mode:'USE_CASE',families,products:[s.product]};
}
function numberValue(value:string|null):number|null{
  if(!value)return null;
  const n=Number(value.replace(',','.').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n)?n:null;
}
function compareConclusion(a:ProductFactStore,b:ProductFactStore,f:Family):string|null{
  if(f==='BATTERY'){
    const av=numberValue(a.battery.capacity),bv=numberValue(b.battery.capacity),aw=numberValue(a.battery.charge),bw=numberValue(b.battery.charge);
    if(av!=null&&bv!=null&&av!==bv){
      const win=av>bv?a:b;const max=Math.max(av,bv),min=Math.min(av,bv);
      const extra=aw!=null&&bw!=null&&aw!==bw?` En carga, ${aw>bw?a.product:b.product} tiene mayor potencia (${Math.max(aw,bw)} vs ${Math.min(aw,bw)} W).`:'';
      return `En batería, ${win.product} tiene más capacidad (${max} vs ${min} mAh).${extra}`;
    }
  }
  if(f==='MEMORY'){
    const av=numberValue(a.memory.ramPhysical),bv=numberValue(b.memory.ramPhysical);
    if(av!=null&&bv!=null&&av!==bv)return`En RAM física, ${av>bv?a.product:b.product} tiene ventaja (${Math.max(av,bv)} vs ${Math.min(av,bv)} GB).`;
  }
  if(f==='DISPLAY'){
    const av=numberValue(a.display.refresh),bv=numberValue(b.display.refresh);
    if(av!=null&&bv!=null&&av!==bv)return`En refresco de pantalla, ${av>bv?a.product:b.product} tiene ventaja (${Math.max(av,bv)} vs ${Math.min(av,bv)} Hz).`;
  }
  if(f==='THERMAL'&&a.thermal.camera!==b.thermal.camera){const win=a.thermal.camera===true?a:b;return`Si la cámara térmica es requisito, ${win.product} es el que la tiene documentada.`;}
  if(f==='RESISTANCE'){
    const ad=numberValue(a.resistance.drop),bd=numberValue(b.resistance.drop);
    if(ad!=null&&bd!=null&&ad!==bd)return`En resistencia a caídas, ${ad>bd?a.product:b.product} tiene la cifra mayor (${Math.max(ad,bd)} vs ${Math.min(ad,bd)} m).`;
  }
  return null;
}
function priorityFamilies(input:LlmWriteInput):Family[]{
  const state:any=input.state??{};
  const q=fold((input.priorities??state.priorities??[]).join(' '));
  const out:Family[]=[];
  if(/termic|thermal/.test(q))out.push('THERMAL');
  if(/bateria|autonomia/.test(q))out.push('BATTERY');
  if(/resisten|caida|golpe|durab/.test(q))out.push('RESISTANCE');
  if(/ram|memoria|almacen/.test(q))out.push('MEMORY');
  if(/camara|foto|video|nocturn/.test(q))out.push('CAMERA');
  if(/pantalla|display|hz/.test(q))out.push('DISPLAY');
  if(/nfc|conect/.test(q))out.push('CONNECTIVITY');
  if(/5g|4g|red/.test(q))out.push('NETWORK');
  if(/rendimiento|procesador|gaming/.test(q))out.push('PERFORMANCE');
  return [...new Set(out)].slice(0,3);
}
function useContextFamilies(input:LlmWriteInput):Family[]{
  const state:any=input.state??{};
  const q=fold(`${input.message} ${input.useCase??state.useCase??''} ${input.problem??state.problem??''}`);
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(q))return['PERFORMANCE','MEMORY','DISPLAY'];
  if(/campo|construccion|obra|mineria|tecnico|caida|golpe/.test(q))return['RESISTANCE','BATTERY'];
  if(/delivery|repart|logistica/.test(q))return['BATTERY','POSITIONING','NETWORK'];
  if(/noche|nocturn|vigilancia/.test(q))return['CAMERA','BATTERY'];
  if(/termic|thermal|temperatura/.test(q))return['THERMAL','RESISTANCE'];
  if(/foto|fotografia|video|contenido/.test(q))return['CAMERA','MEMORY'];
  if(/trabajo|oficina|whatsapp|correo|multitarea|varias apps/.test(q))return['PERFORMANCE','MEMORY','BATTERY'];
  return[];
}
function compactGeneralComparison(a:ProductFactStore,b:ProductFactStore):string|null{
  const perfA=[a.performance.processor,a.memory.ramPhysical?`${a.memory.ramPhysical} RAM`:'',a.memory.storage].filter(Boolean).join(', ');
  const perfB=[b.performance.processor,b.memory.ramPhysical?`${b.memory.ramPhysical} RAM`:'',b.memory.storage].filter(Boolean).join(', ');
  const batA=[a.battery.capacity,a.battery.charge].filter(Boolean).join(', ');const batB=[b.battery.capacity,b.battery.charge].filter(Boolean).join(', ');
  const dropA=numberValue(a.resistance.drop),dropB=numberValue(b.resistance.drop);const resistanceDiff=dropA!=null&&dropB!=null&&dropA!==dropB;
  const camA=[a.camera.mainMp?`${a.camera.mainMp} principal`:'',a.camera.nightMp?`${a.camera.nightMp} nocturna`:'',a.camera.videoMax?`video ${a.camera.videoMax}`:''].filter(Boolean).join(', ');
  const camB=[b.camera.mainMp?`${b.camera.mainMp} principal`:'',b.camera.nightMp?`${b.camera.nightMp} nocturna`:'',b.camera.videoMax?`video ${b.camera.videoMax}`:''].filter(Boolean).join(', ');
  const lines:string[]=[];
  if(perfA&&perfB)lines.push(`- Rendimiento y memoria: ${a.product} ${perfA}; ${b.product} ${perfB}.`);
  if(batA&&batB)lines.push(`- Batería: ${a.product} ${batA}; ${b.product} ${batB}.`);
  if(resistanceDiff)lines.push(`- Resistencia a caídas: ${a.product} ${a.resistance.drop}; ${b.product} ${b.resistance.drop}.`);
  else if(camA&&camB)lines.push(`- Cámaras: ${a.product} ${camA}; ${b.product} ${camB}.`);
  if(!lines.length)return null;
  const winners:string[]=[];
  const ramA=numberValue(a.memory.ramPhysical),ramB=numberValue(b.memory.ramPhysical),storageA=numberValue(a.memory.storage),storageB=numberValue(b.memory.storage),batteryA=numberValue(a.battery.capacity),batteryB=numberValue(b.battery.capacity);
  if(ramA!=null&&ramB!=null&&ramA!==ramB)winners.push(ramA>ramB?a.product:b.product);
  if(storageA!=null&&storageB!=null&&storageA!==storageB)winners.push(storageA>storageB?a.product:b.product);
  if(batteryA!=null&&batteryB!=null&&batteryA!==batteryB)winners.push(batteryA>batteryB?a.product:b.product);
  const common=winners.length&&winners.every(x=>x===winners[0])?winners[0]:null;
  const conclusion=common?`\nSi priorizas memoria y batería, ${common} tiene cifras mayores en esos puntos.`:'';
  return`Diferencias clave entre ${a.product} y ${b.product}:\n${lines.slice(0,3).join('\n')}${conclusion}`;
}
function gamingComparison(a:ProductFactStore,b:ProductFactStore):string|null{
  const aParts=[performance(a),memoryRam(a),displayGaming(a)].filter((v):v is string=>Boolean(v));
  const bParts=[performance(b),memoryRam(b),displayGaming(b)].filter((v):v is string=>Boolean(v));
  if(!aParts.length||!bParts.length)return null;
  const notes:string[]=[];
  const ar=numberValue(a.memory.ramPhysical),br=numberValue(b.memory.ramPhysical);
  if(ar!=null&&br!=null&&ar!==br)notes.push(`${ar>br?a.product:b.product} tiene más RAM física (${Math.max(ar,br)} vs ${Math.min(ar,br)} GB)`);
  const ah=numberValue(a.display.refresh),bh=numberValue(b.display.refresh);
  if(ah!=null&&bh!=null&&ah!==bh)notes.push(`${ah>bh?a.product:b.product} tiene mayor refresco (${Math.max(ah,bh)} vs ${Math.min(ah,bh)} Hz)`);
  else if(ah!=null&&bh==null)notes.push(`${a.product} tiene ${a.display.refresh} documentados`);
  else if(bh!=null&&ah==null)notes.push(`${b.product} tiene ${b.display.refresh} documentados`);
  const measurable=notes.length?notes.join(' y '):'no hay una ventaja cuantitativa completa en pantalla con los datos disponibles';
  return`Para gaming:\n- ${a.product}: ${aParts.join('; ')}.\n- ${b.product}: ${bParts.join('; ')}.\n- Diferencias medibles: ${measurable}. No afirmo superioridad de CPU/GPU sin benchmark verificado.`;
}
function compare(input:LlmWriteInput,stores:ProductFactStore[]):FullRagAnswerResult|null{
  if(stores.length<2)return null;
  const [a,b]=stores.slice(0,2);
  const explicit=familyFromText(input);
  const priorities=priorityFamilies(input);
  const contextual=useContextFamilies(input);
  const p=profile(input);

  if(!explicit&&!priorities.length&&p==='GAMING'){
    const answer=gamingComparison(a,b);
    return answer?{answer,mode:'COMPARE',families:['PERFORMANCE','MEMORY','DISPLAY'],products:[a.product,b.product]}:null;
  }

  let families:Family[]=[];
  if(explicit)families=[explicit];
  else if(priorities.length)families=priorities;
  else if(contextual.length)families=contextual;
  else{
    const answer=compactGeneralComparison(a,b);
    return answer?{answer,mode:'COMPARE',families:['PERFORMANCE','MEMORY','BATTERY','CAMERA'],products:[a.product,b.product]}:null;
  }

  const q=fold(input.message);
  const lines:string[]=[];
  for(const family of families.slice(0,3)){
    const left=familySummary(a,family,q),right=familySummary(b,family,q);
    if(left&&right)lines.push(`- ${family==='BATTERY'?'Batería':family==='RESISTANCE'?'Resistencia':family==='MEMORY'?'Memoria':family==='CAMERA'?'Cámaras':family==='DISPLAY'?'Pantalla':family==='PERFORMANCE'?'Rendimiento':family==='THERMAL'?'Térmica':family==='CONNECTIVITY'?'Conectividad':family==='NETWORK'?'Red':family}: ${a.product} ${left}; ${b.product} ${right}.`);
  }
  if(!lines.length)return null;
  const conclusion=families.map(f=>compareConclusion(a,b,f)).find((value):value is string=>Boolean(value))??null;
  return{answer:`Comparando ${a.product} y ${b.product}:\n${lines.join('\n')}${conclusion?`\n${conclusion}`:''}`,mode:'COMPARE',families,products:[a.product,b.product]};
}
function recommendationFamilies(input:LlmWriteInput):Family[]{
  const p=profile(input);const q=fold(`${input.message} ${(input.priorities??input.state?.priorities??[]).join(' ')}`);const out:Family[]=[];
  if(/termic|thermal/.test(q)||p==='THERMAL')out.push('THERMAL');
  if(/nfc/.test(q))out.push('CONNECTIVITY');
  if(/resisten|caida|golpe|campo|construccion/.test(q)||p==='FIELD')out.push('RESISTANCE');
  if(/bateria|autonomia|delivery/.test(q)||['FIELD','DELIVERY'].includes(p))out.push('BATTERY');
  if(p==='GAMING')out.push('PERFORMANCE','MEMORY','DISPLAY');
  if(p==='WORK')out.push('PERFORMANCE','MEMORY','BATTERY');
  return [...new Set(out)].slice(0,4);
}
function recommend(input:LlmWriteInput,stores:ProductFactStore[]):FullRagAnswerResult|null{
  const name=productName(input);let store=findProductFactStore(stores,name);const families=recommendationFamilies(input);
  if(families.includes('THERMAL')&&store?.thermal.camera!==true){const thermalStore=stores.find(s=>s.thermal.camera===true);if(thermalStore)store=thermalStore;}
  if(!store)return null;
  const details=families.map(f=>familySummary(store!,f,fold(input.message))).filter((v):v is string=>Boolean(v));
  if(!details.length)return null;
  return{answer:`Para lo que buscas, me iría por ${store.product}: ${details.join('; ')}.`,mode:'RECOMMEND',families,products:[store.product]};
}

export function buildFullRagAnswer(input:LlmWriteInput):FullRagAnswerResult|null{
  const intent=String(input.intent??'').toUpperCase();
  if(['POLICY','WARRANTY'].includes(intent))return null;
  const stores=buildProductFactStores(input.rag??[]);
  if(!stores.length)return null;
  if(intent==='COMPARE')return compare(input,stores);
  if(intent==='RECOMMEND'||intent==='RECOMMEND_WITHIN_BUDGET')return recommend(input,stores);
  const target=findProductFactStore(stores,productName(input));
  if(!target)return null;
  if(intent==='EVALUATE_USE')return useCase(input,target);
  if(['ATTRIBUTE','CAPABILITY'].includes(intent))return capability(input,target);
  if(intent==='PRODUCT_INFO'){
    const answer=overview(input,target);
    return answer?{answer,mode:'OVERVIEW',families:['PERFORMANCE','MEMORY','BATTERY','RESISTANCE','CAMERA','DISPLAY','THERMAL'],products:[target.product]}:null;
  }
  return null;
}

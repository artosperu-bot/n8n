import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type FullRagComparisonOptions={message?:string;attributes?:string[];useCase?:string|null;priorities?:string[]};
type Family='BATERIA'|'RESISTENCIA'|'MEMORIA'|'CAMARA'|'PANTALLA'|'RENDIMIENTO'|'TERMICA'|'CONECTIVIDAD'|'REDES';

function productFrom(row:RagEvidence):string|null{const match=String(row.text??'').match(/(?:^|\n)Producto\s*:\s*([^\n]+)/i);return match?.[1]?.trim()||null;}
function section(row:RagEvidence):string{return String(row.section??row.source.split(':').at(-1)??'').toUpperCase();}
function text(row:RagEvidence):string{return String(row.text??'');}
function first(raw:string,rx:RegExp):string|null{return raw.match(rx)?.[1]?.trim().replace(/[.;]+$/,'')??null;}
function number(raw:string,rx:RegExp):number|null{const value=first(raw,rx);if(!value)return null;const n=Number(value.replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;}
function yes(raw:string,rx:RegExp):boolean{return new RegExp(`${rx.source}\\s*[:=]?\\s*(?:s[ií]|yes|true)(?=$|[\\s.,;:!?\\)\\]])`,'i').test(raw);}

function summary(row:RagEvidence):string|null{
  const raw=text(row);const sec=section(row);
  if(sec==='BATERIA'){
    const mah=first(raw,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+\s*mAh)/i);const w=first(raw,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+\s*W)/i);
    return [mah?`batería ${mah}`:'',w?`carga ${w}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='RESISTENCIA'){
    const certs=[yes(raw,/(?:certificaci[oó]n\s+)?IP68/)?'IP68':'',yes(raw,/(?:certificaci[oó]n\s+)?IP69K?/)?'IP69K':'',yes(raw,/MIL-STD-810H/)?'MIL-STD-810H':''].filter(Boolean);const fall=first(raw,/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*([0-9.,]+\s*m)/i);
    return [certs.join('/'),fall?`caídas ${fall}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='MEMORIA'){
    const ram=first(raw,/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+\s*GB)/i);const storage=first(raw,/almacenamiento(?:\s+interno)?\s*[:=]?\s*([0-9.,]+\s*(?:GB|TB))/i);
    return [ram?`RAM ${ram}`:'',storage?`almacenamiento ${storage}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='CAMARA'){
    const main=first(raw,/c[aá]mara\s+principal\s*[:=]?\s*([0-9.,]+\s*MP)/i);const night=first(raw,/(?:c[aá]mara\s+de\s+)?visi[oó]n\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i)??first(raw,/c[aá]mara\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i);
    return [main?`cámara ${main}`:'',night?`nocturna ${night}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='PANTALLA'){
    const size=first(raw,/(?:pantalla\s*[:=]?\s*)?([0-9.,]+\s*pulgadas)/i);const hz=first(raw,/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+\s*Hz)/i);
    return [size,hz].filter(Boolean).join(', ')||null;
  }
  if(sec==='RENDIMIENTO'){
    const cpu=first(raw,/(?:procesador|chipset|soc)\s*[:=]?\s*([^.;\n]+)/i);return cpu?`procesador ${cpu}`:null;
  }
  if(sec==='TERMICA'){
    if(!yes(raw,/c[aá]mara\s+t[eé]rmica/))return null;const hz=first(raw,/frecuencia\s+t[eé]rmica\s*[:=]?\s*([0-9.,]+\s*Hz)/i);const x=first(raw,/resoluci[oó]n\s+t[eé]rmica\s+horizontal\s*[:=]?\s*([0-9]+)\s*px/i);const y=first(raw,/resoluci[oó]n\s+t[eé]rmica\s+vertical\s*[:=]?\s*([0-9]+)\s*px/i);return [`cámara térmica`,hz?`${hz}`:'',x&&y?`${x}×${y}`:''].filter(Boolean).join(', ');
  }
  if(sec==='CONECTIVIDAD'){
    const nfc=yes(raw,/\bNFC\b/);const wifi5=yes(raw,/Wi-?Fi\s+5\s*GHz/);const bt=first(raw,/Versi[oó]n\s+Bluetooth\s*[:=]?\s*([^\n.;]+)/i);return [nfc?'NFC':'',wifi5?'Wi‑Fi 5 GHz':'',bt?`Bluetooth ${bt}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='REDES'){
    const five=yes(raw,/(?:conectividad\s+|red\s+|soporte\s+)?5G/);const four=/\b4G\b|\bLTE\b/i.test(raw);return five?'5G':four?'4G LTE':null;
  }
  return null;
}

function focus(options:FullRagComparisonOptions={}):Family[]{
  const q=fold(`${options.message??''} ${(options.attributes??[]).join(' ')} ${options.useCase??''} ${(options.priorities??[]).join(' ')}`);
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(q))return['RENDIMIENTO','MEMORIA','PANTALLA'];
  if(/bateria|autonomia|carga/.test(q))return['BATERIA'];
  if(/resisten|caida|golpe|ip68|ip69|mil/.test(q))return['RESISTENCIA'];
  if(/termic|thermal|temperatura/.test(q))return['TERMICA'];
  if(/nfc|wifi|bluetooth|conectividad/.test(q))return['CONECTIVIDAD'];
  if(/5g|4g|lte|redes?/.test(q))return['REDES'];
  if(/ram|memoria|almacen/.test(q))return['MEMORIA'];
  if(/pantalla|hz|display/.test(q))return['PANTALLA'];
  if(/camara|foto|video|nocturn/.test(q))return['CAMARA'];
  if(/procesador|rendimiento|rapido/.test(q))return['RENDIMIENTO','MEMORIA','PANTALLA'];
  return['BATERIA','RESISTENCIA','MEMORIA','CAMARA'];
}

function rawFor(rows:RagEvidence[],family:Family):string{return rows.filter(row=>section(row)===family).map(text).join('\n');}
function conclusion(groups:Array<[string,RagEvidence[]]>,families:Family[],options:FullRagComparisonOptions):string|null{
  if(groups.length<2)return null;const [a,b]=groups;const firstFamily=families[0];
  if(firstFamily==='BATERIA'){
    const aText=rawFor(a[1],'BATERIA'),bText=rawFor(b[1],'BATERIA');const aMah=number(aText,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+)\s*mAh/i),bMah=number(bText,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+)\s*mAh/i);const aW=number(aText,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+)\s*W/i),bW=number(bText,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+)\s*W/i);
    if(aMah!=null&&bMah!=null&&aMah!==bMah){const winner=aMah>bMah?a:b;const loser=aMah>bMah?b:a;const winMah=Math.max(aMah,bMah),loseMah=Math.min(aMah,bMah);const winnerW=aMah>bMah?aW:bW,loserW=aMah>bMah?bW:aW;return `En batería, ${winner[0]} tiene más capacidad (${winMah} vs ${loseMah} mAh)${winnerW!=null&&loserW!=null&&winnerW>loserW?` y también mayor potencia de carga (${winnerW} vs ${loserW} W)`:''}.`;}
  }
  if(firstFamily==='MEMORIA'){
    const aRam=number(rawFor(a[1],'MEMORIA'),/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+)\s*GB/i),bRam=number(rawFor(b[1],'MEMORIA'),/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+)\s*GB/i);if(aRam!=null&&bRam!=null&&aRam!==bRam){const winner=aRam>bRam?a:b;return `En RAM física, ${winner[0]} parte con ventaja (${Math.max(aRam,bRam)} vs ${Math.min(aRam,bRam)} GB).`;}
  }
  if(firstFamily==='PANTALLA'){
    const aHz=number(rawFor(a[1],'PANTALLA'),/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+)\s*Hz/i),bHz=number(rawFor(b[1],'PANTALLA'),/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+)\s*Hz/i);if(aHz!=null&&bHz!=null&&aHz!==bHz){const winner=aHz>bHz?a:b;return `En fluidez de pantalla, ${winner[0]} tiene mayor refresco (${Math.max(aHz,bHz)} vs ${Math.min(aHz,bHz)} Hz).`;}
  }
  if(firstFamily==='TERMICA'){
    const aThermal=yes(rawFor(a[1],'TERMICA'),/c[aá]mara\s+t[eé]rmica/),bThermal=yes(rawFor(b[1],'TERMICA'),/c[aá]mara\s+t[eé]rmica/);if(aThermal!==bThermal)return `Si la cámara térmica es requisito, ${aThermal?a[0]:b[0]} es el que la tiene documentada.`;
  }
  const q=fold(`${options.message??''} ${options.useCase??''}`);
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(q)){
    const aRam=number(rawFor(a[1],'MEMORIA'),/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+)\s*GB/i),bRam=number(rawFor(b[1],'MEMORIA'),/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+)\s*GB/i);const aHz=number(rawFor(a[1],'PANTALLA'),/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+)\s*Hz/i),bHz=number(rawFor(b[1],'PANTALLA'),/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+)\s*Hz/i);
    const aWins=Number(aRam!=null&&bRam!=null&&aRam>bRam)+Number(aHz!=null&&bHz!=null&&aHz>bHz);const bWins=Number(aRam!=null&&bRam!=null&&bRam>aRam)+Number(aHz!=null&&bHz!=null&&bHz>aHz);if(aWins!==bWins)return `Para gaming, ${aWins>bWins?a[0]:b[0]} parte con ventaja en las diferencias medibles de RAM/pantalla; no afirmo superioridad de CPU/GPU sin benchmark verificado.`;
  }
  return null;
}

export function buildColdRagComparison(rows:RagEvidence[],options:FullRagComparisonOptions={}):string|null{
  const groups=new Map<string,RagEvidence[]>();for(const row of rows){const product=productFrom(row);if(!product)continue;const bucket=groups.get(product)??[];bucket.push(row);groups.set(product,bucket);}if(groups.size<2)return null;
  const families=focus(options);const entries=[...groups.entries()].slice(0,2);const lines=entries.map(([product,evidence])=>{const parts:string[]=[];for(const family of families){const row=evidence.find(item=>section(item)===family);const value=row?summary(row):null;if(value)parts.push(value);if(parts.length>=Math.min(4,families.length))break;}return parts.length?`${product}: ${parts.join('; ')}.`:null;}).filter((value):value is string=>Boolean(value));if(lines.length!==2)return null;
  const end=conclusion(entries,families,options);return [lines.join(' '),end].filter(Boolean).join(' ');
}

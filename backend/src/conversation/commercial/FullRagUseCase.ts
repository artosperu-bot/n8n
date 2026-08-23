import type { RagEvidence } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

export type FullRagUseCaseInput={
  message:string;
  product:string;
  rows:RagEvidence[];
  useCase?:string|null;
  problem?:string|null;
  priorities?:string[];
};

type UseProfile='GAMING'|'FIELD'|'DELIVERY'|'WORK'|'NIGHT'|'THERMAL'|'CAMERA'|'GENERIC';

function rowText(rows:RagEvidence[],section:string):string{
  return rows.filter(row=>fold(row.section??'')===fold(section)).map(row=>String(row.text??'')).join('\n');
}
function first(text:string,rx:RegExp):string|null{return text.match(rx)?.[1]?.trim().replace(/[.;]+$/,'')??null;}
function yes(text:string,rx:RegExp):boolean{
  return new RegExp(`${rx.source}\\s*[:=]?\\s*(?:s[ií]|yes|true)(?=$|[\\s.,;:!?\\)\\]])`,'i').test(text);
}
function profile(input:FullRagUseCaseInput):UseProfile{
  const text=fold(`${input.message} ${input.useCase??''} ${input.problem??''} ${(input.priorities??[]).join(' ')}`);
  if(/camara termica|termic|thermal|flir|medir temperatura|inspeccion.*temperatura/.test(text))return'THERMAL';
  if(/free fire|pubg|cod mobile|call of duty|gaming|jugar|juego/.test(text))return'GAMING';
  if(/delivery|repart|logistica/.test(text))return'DELIVERY';
  if(/campo|construccion|obra|mineria|tecnico|caida|golpe|rugged/.test(text))return'FIELD';
  if(/noche|nocturn|vigilancia/.test(text))return'NIGHT';
  if(/foto|fotografia|video|contenido|redes sociales/.test(text))return'CAMERA';
  if(/trabajo|oficina|whatsapp|correo|navegador|multitarea|varias apps|uso diario/.test(text))return'WORK';
  return'GENERIC';
}
function processor(rows:RagEvidence[]):string|null{return first(rowText(rows,'RENDIMIENTO'),/(?:Procesador|Chipset|SoC)\s*[:=]?\s*([^\n.;]+)/i);}
function ram(rows:RagEvidence[]):string|null{return first(rowText(rows,'MEMORIA'),/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+\s*GB)/i);}
function storage(rows:RagEvidence[]):string|null{return first(rowText(rows,'MEMORIA'),/almacenamiento(?:\s+interno)?\s*[:=]?\s*([0-9.,]+\s*(?:GB|TB))/i);}
function refresh(rows:RagEvidence[]):string|null{return first(rowText(rows,'PANTALLA'),/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+\s*Hz)/i);}
function battery(rows:RagEvidence[]):{mah:string|null;w:string|null}{const text=rowText(rows,'BATERIA');return{mah:first(text,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+\s*mAh)/i),w:first(text,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+\s*W)/i)};}
function resistance(rows:RagEvidence[]):string|null{
  const text=rowText(rows,'RESISTENCIA');const certs=[yes(text,/(?:certificaci[oó]n\s+)?IP68/)?'IP68':'',yes(text,/(?:certificaci[oó]n\s+)?IP69K?/)?'IP69K':'',yes(text,/MIL-STD-810H/)?'MIL-STD-810H':''].filter(Boolean);const fall=first(text,/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*([0-9.,]+\s*m)/i);const parts=[certs.length?certs.join(', '):'',fall?`caídas de hasta ${fall}`:''].filter(Boolean);return parts.join(' y ')||null;
}
function positioning(rows:RagEvidence[]):string|null{
  const text=rowText(rows,'POSICIONAMIENTO');const systems=['GPS','GLONASS','Galileo','BeiDou','QZSS'].filter(name=>new RegExp(`\\b${name}\\b`,'i').test(text));return systems.length?systems.join(', '):null;
}
function network(rows:RagEvidence[]):string|null{
  const text=`${rowText(rows,'REDES')}\n${rowText(rows,'CONECTIVIDAD')}`;if(yes(text,/(?:conectividad\s+|red\s+|soporte\s+)?5G/))return'5G';if(/\b4G\b|\bLTE\b/i.test(text))return'4G LTE';return null;
}
function camera(rows:RagEvidence[]):string|null{
  const text=rowText(rows,'CAMARA');const main=first(text,/c[aá]mara\s+principal\s*[:=]?\s*([0-9.,]+\s*MP)/i);const night=first(text,/(?:c[aá]mara\s+de\s+)?visi[oó]n\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i)??first(text,/c[aá]mara\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i);return [main?`principal de ${main}`:'',night?`visión nocturna de ${night}`:''].filter(Boolean).join(' y ')||null;
}
function thermal(rows:RagEvidence[]):string|null{
  const text=rowText(rows,'TERMICA');if(!yes(text,/c[aá]mara\s+t[eé]rmica/))return null;const hz=first(text,/frecuencia\s+t[eé]rmica\s*[:=]?\s*([0-9.,]+\s*Hz)/i);const x=first(text,/resoluci[oó]n\s+t[eé]rmica\s+horizontal\s*[:=]?\s*([0-9]+)\s*px/i);const y=first(text,/resoluci[oó]n\s+t[eé]rmica\s+vertical\s*[:=]?\s*([0-9]+)\s*px/i);const min=first(text,/temperatura\s+m[ií]nima\s+t[eé]rmica\s*[:=]?\s*(-?[0-9.,]+\s*°?C)/i);const max=first(text,/temperatura\s+m[aá]xima\s+t[eé]rmica\s*[:=]?\s*(-?[0-9.,]+\s*°?C)/i);return [`cámara térmica${hz?` a ${hz}`:''}`,x&&y?`resolución ${x}×${y}`:'',min&&max?`rango ${min} a ${max}`:''].filter(Boolean).join(', ');
}
function join(items:string[]):string{return items.filter(Boolean).join(', ');}

export function buildFullRagUseCaseAnswer(input:FullRagUseCaseInput):string|null{
  const p=profile(input);const b=battery(input.rows);
  if(p==='GAMING'){
    const cpu=processor(input.rows),memory=ram(input.rows),hz=refresh(input.rows);const facts=[cpu?`procesador ${cpu}`:'',memory?`${memory} de RAM física`:'',hz?`pantalla de ${hz}`:'',b.mah?`batería de ${b.mah}`:''].filter(Boolean);if(!facts.length)return null;
    const game=/free fire/i.test(input.message)?'Free Fire':/pubg/i.test(input.message)?'PUBG':/cod mobile|call of duty/i.test(input.message)?'Call of Duty Mobile':'juegos móviles';
    return `Para ${game}, ${input.product} cuenta con ${join(facts)}. Por ese hardware, debería poder ejecutar este tipo de juego; no tengo un benchmark verificado para prometerte FPS o calidad gráfica exacta.`;
  }
  if(p==='FIELD'){
    const rugged=resistance(input.rows);const facts=[rugged?`protección ${rugged}`:'',b.mah?`batería de ${b.mah}`:'',b.w?`carga de ${b.w}`:''].filter(Boolean);if(!facts.length)return null;
    return `Para trabajo en campo, lo más relevante de ${input.product} es ${join(facts)}. Esa combinación apunta justamente a aguantar mejor jornadas exigentes y uso fuera de oficina.`;
  }
  if(p==='DELIVERY'){
    const pos=positioning(input.rows),net=network(input.rows);const facts=[b.mah?`batería de ${b.mah}`:'',pos?`posicionamiento con ${pos}`:'',net?`conectividad ${net}`:''].filter(Boolean);if(!facts.length)return null;
    return `Para delivery, ${input.product} tiene ${join(facts)}. Son las características que más pesan para autonomía, navegación y conexión durante la ruta.`;
  }
  if(p==='THERMAL'){
    const t=thermal(input.rows);if(!t)return null;return `Para inspecciones térmicas, ${input.product} sí tiene ${t}. Esa es la capacidad que debe tomarse como requisito principal; una cámara nocturna normal no la sustituye.`;
  }
  if(p==='NIGHT'){
    const cam=camera(input.rows);const facts=[cam?`cámara ${cam}`:'',b.mah?`batería de ${b.mah}`:''].filter(Boolean);if(!facts.length)return null;return `Para trabajo nocturno, ${input.product} ofrece ${join(facts)}. La visión nocturna es la característica diferencial cuando necesitas registrar con poca luz.`;
  }
  if(p==='CAMERA'){
    const cam=camera(input.rows),memory=storage(input.rows);const facts=[cam?`cámara ${cam}`:'',memory?`${memory} de almacenamiento`:''].filter(Boolean);if(!facts.length)return null;return `Para fotos o contenido, ${input.product} destaca por ${join(facts)}. Aquí conviene fijarse primero en la cámara que realmente usarás y en el espacio disponible para guardar archivos.`;
  }
  if(p==='WORK'){
    const cpu=processor(input.rows),memory=ram(input.rows),space=storage(input.rows);const facts=[cpu?`procesador ${cpu}`:'',memory?`${memory} de RAM física`:'',space?`${space} de almacenamiento`:'',b.mah?`batería de ${b.mah}`:''].filter(Boolean);if(!facts.length)return null;return `Para trabajo y multitarea, ${input.product} cuenta con ${join(facts)}. Esa combinación es la que más importa para varias apps, archivos y autonomía durante la jornada.`;
  }
  return null;
}

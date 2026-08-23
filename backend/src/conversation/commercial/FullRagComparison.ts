import type { RagEvidence } from '../../domain/types.ts';

function productFrom(row:RagEvidence):string|null{
  const match=String(row.text??'').match(/(?:^|\n)Producto\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim()||null;
}
function section(row:RagEvidence):string{return String(row.section??row.source.split(':').at(-1)??'').toUpperCase();}
function text(row:RagEvidence):string{return String(row.text??'');}
function first(raw:string,rx:RegExp):string|null{return raw.match(rx)?.[1]?.trim()??null;}
function yes(raw:string,rx:RegExp):boolean{return new RegExp(`${rx.source}\\s*[:=]?\\s*s[ií]\\b`,'i').test(raw);}
function summary(row:RagEvidence):string|null{
  const raw=text(row);const sec=section(row);
  if(sec==='BATERIA'){
    const mah=first(raw,/(?:capacidad(?:\s+de\s+bater[ií]a)?|bater[ií]a)\s*[:=]?\s*([0-9.,]+\s*mAh)/i);
    const w=first(raw,/carga(?:\s+cableada)?\s*[:=]?\s*([0-9.,]+\s*W)/i);
    return [mah?`batería ${mah}`:'',w?`carga ${w}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='RESISTENCIA'){
    const certs=[yes(raw,/(?:certificaci[oó]n\s+)?IP68/)?'IP68':'',yes(raw,/(?:certificaci[oó]n\s+)?IP69K?/)?'IP69K':'',yes(raw,/MIL-STD-810H/)?'MIL-STD-810H':''].filter(Boolean);
    const fall=first(raw,/resistencia\s+a\s+ca[ií]das?\s*[:=]?\s*([0-9.,]+\s*m)/i);
    return [certs.join('/'),fall?`caídas ${fall}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='MEMORIA'){
    const ram=first(raw,/RAM\s+f[ií]sica\s*[:=]?\s*([0-9.,]+\s*GB)/i);
    const storage=first(raw,/almacenamiento(?:\s+interno)?\s*[:=]?\s*([0-9.,]+\s*(?:GB|TB))/i);
    return [ram?`RAM ${ram}`:'',storage?`almacenamiento ${storage}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='CAMARA'){
    const main=first(raw,/c[aá]mara\s+principal\s*[:=]?\s*([0-9.,]+\s*MP)/i);
    const night=first(raw,/(?:c[aá]mara\s+de\s+)?visi[oó]n\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i)??first(raw,/c[aá]mara\s+nocturna\s*[:=]?\s*([0-9.,]+\s*MP)/i);
    return [main?`cámara ${main}`:'',night?`nocturna ${night}`:''].filter(Boolean).join(', ')||null;
  }
  if(sec==='PANTALLA'){
    const size=first(raw,/(?:pantalla\s*[:=]?\s*)?([0-9.,]+\s*pulgadas)/i);
    const hz=first(raw,/(?:frecuencia(?:\s+de\s+refresco)?|refresco)\s*[:=]?\s*([0-9.,]+\s*Hz)/i);
    return [size,hz].filter(Boolean).join(', ')||null;
  }
  if(sec==='RENDIMIENTO'){
    const cpu=first(raw,/(?:procesador|chipset|soc)\s*[:=]?\s*([^.;\n]+)/i);
    return cpu?`procesador ${cpu}`:null;
  }
  return null;
}

export function buildColdRagComparison(rows:RagEvidence[]):string|null{
  const groups=new Map<string,RagEvidence[]>();
  for(const row of rows){const product=productFrom(row);if(!product)continue;const bucket=groups.get(product)??[];bucket.push(row);groups.set(product,bucket);}
  if(groups.size<2)return null;
  const order=['BATERIA','RESISTENCIA','MEMORIA','CAMARA','PANTALLA','RENDIMIENTO'];
  const lines=[...groups.entries()].slice(0,2).map(([product,evidence])=>{
    const parts:string[]=[];
    for(const sec of order){const row=evidence.find(item=>section(item)===sec);const value=row?summary(row):null;if(value)parts.push(value);if(parts.length>=3)break;}
    return parts.length?`${product}: ${parts.join('; ')}.`:null;
  }).filter((value):value is string=>Boolean(value));
  return lines.length===2?lines.join(' '):null;
}

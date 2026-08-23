export type ReservationBundle={document:string|null;name:string|null;address:string|null};

function clean(value:string):string{return value.replace(/\s+/g,' ').trim();}
function normalizedDocument(value:string):string|null{
  const normalized=value.replace(/[\s.-]/g,'').toUpperCase();
  return /^[A-Z0-9]{8,12}$/.test(normalized)&&/[0-9]{6}/.test(normalized)?normalized:null;
}
function validName(value:string):string|null{
  const cleanValue=clean(value);
  return cleanValue.length>=5&&cleanValue.split(/\s+/).filter(Boolean).length>=2&&/^[\p{L}\s.'-]+$/u.test(cleanValue)?cleanValue:null;
}
function validAddress(value:string):string|null{
  const cleanValue=clean(value);
  return cleanValue.length>=6&&/\p{L}/u.test(cleanValue)&&(/\d/u.test(cleanValue)||/\b(?:av|avenida|jr|jiron|jirón|calle|mz|manzana|lote|urbanizacion|urbanización|distrito)\b/iu.test(cleanValue))?cleanValue:null;
}

export function extractReservationBundle(message:string):ReservationBundle{
  const result:ReservationBundle={document:null,name:null,address:null};
  const segments=message
    .split(/\s*(?:\||;|\n|,(?=\s*(?:dni|ce|carn[eé]|documento|nombre|direcci[oó]n|domicilio)\b))\s*/iu)
    .map(clean)
    .filter(Boolean);
  for(const segment of segments){
    let match=segment.match(/^(?:dni|ce|carn[eé]\s*de\s*extranjer[ií]a|documento)\s*[:#=-]?\s*(.+)$/iu);
    if(match){result.document=normalizedDocument(match[1]);continue;}
    match=segment.match(/^(?:nombre(?:s)?(?:\s+y\s+apellidos)?|nombre\s+completo)\s*[:#=-]?\s*(.+)$/iu);
    if(match){result.name=validName(match[1]);continue;}
    match=segment.match(/^(?:direcci[oó]n(?:\s+completa)?|domicilio)\s*[:#=-]?\s*(.+)$/iu);
    if(match){result.address=validAddress(match[1]);continue;}
  }
  if(!result.document){
    const inline=message.match(/\b(?:dni|ce|documento)\s*[:#=-]?\s*([A-Z0-9.\-]{8,14})\b/i)?.[1];
    if(inline)result.document=normalizedDocument(inline);
  }
  return result;
}

export function mergeReservationBundle(current:Partial<ReservationBundle>,incoming:Partial<ReservationBundle>):ReservationBundle{
  return{document:incoming.document??current.document??null,name:incoming.name??current.name??null,address:incoming.address??current.address??null};
}

export function reservationBundleMissing(data:Partial<ReservationBundle>):string[]{
  const missing:string[]=[];
  if(!data.document)missing.push('DNI o Carné de Extranjería');
  if(!data.name)missing.push('nombres y apellidos');
  if(!data.address)missing.push('dirección completa');
  return missing;
}

export function reservationBundleStage(data:Partial<ReservationBundle>):'NEED_DOCUMENT'|'NEED_NAME'|'NEED_ADDRESS'|'READY'{
  if(!data.document)return'NEED_DOCUMENT';
  if(!data.name)return'NEED_NAME';
  if(!data.address)return'NEED_ADDRESS';
  return'READY';
}

export function reservationBundlePrompt(product:string):string{
  return `Perfecto. Para iniciar la reserva de ${product}, envíame en un solo mensaje: DNI o Carné de Extranjería, nombres y apellidos, y dirección completa. Ejemplo: DNI: 12345678, Nombre: Juan Perez Lopez, Dirección: Av. Arequipa 1234, Lima.`;
}

export function reservationMissingPrompt(missing:string[]):string{
  if(!missing.length)return 'Ya tengo todos los datos necesarios para continuar.';
  if(missing.length===1)return `Me falta ${missing[0]}. Envíame solo ese dato para continuar.`;
  if(missing.length===2)return `Me faltan ${missing[0]} y ${missing[1]}. Envíame solo esos datos para continuar.`;
  return `Me faltan ${missing.slice(0,-1).join(', ')} y ${missing.at(-1)}. Envíame esos datos para continuar.`;
}

import { appendFileSync } from 'node:fs';

const REDACT_KEYS=new Set([
  'message','lastusermessage','lastassistantmessage','email','correo','address','direccion','phone','telefono',
  'dni','document','documento','reservationdocument','reservationcustomername','reservationaddress','name','nombre',
]);

function redactScalar(value:string):string{
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]')
    .replace(/\b\d{8,12}\b/g,'[REDACTED_ID]');
}

function sanitize(value:unknown,key=''):unknown{
  if(REDACT_KEYS.has(key.toLowerCase()))return '[REDACTED]';
  if(typeof value==='string')return redactScalar(value);
  if(Array.isArray(value))return value.map(item=>sanitize(item));
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [childKey,childValue] of Object.entries(value as Record<string,unknown>))out[childKey]=sanitize(childValue,childKey);
    return out;
  }
  return value;
}

export function writeTrace(payload:Record<string,unknown>,level:'log'|'error'='log'):void{
  const safe=sanitize(payload) as Record<string,unknown>;
  const line=JSON.stringify(safe);
  if(level==='error')console.error(line);else console.log(line);

  const file=process.env.STECH_TRACE_FILE?.trim();
  if(!file)return;
  try{appendFileSync(file,`${line}\n`,{encoding:'utf8'});}catch{}
}

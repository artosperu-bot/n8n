import { appendFileSync } from 'node:fs';

const TRACE_EVENTS=new Set([
  'STECH_TURN_TRACE',
  'STECH_REFERENCE_TRACE',
  'STECH_PRODUCT_FLOW',
  'STECH_TURN_ERROR',
]);

const REDACT_KEYS=new Set([
  'message','lastusermessage','lastassistantmessage','email','correo','address','direccion','phone','telefono',
  'dni','document','documento','reservationdocument','reservationcustomername','reservationaddress','name','nombre',
]);

let sinkInstalled=false;

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

function appendTrace(payload:Record<string,unknown>):void{
  const file=process.env.STECH_TRACE_FILE?.trim();
  if(!file)return;
  try{
    const safe=sanitize(payload) as Record<string,unknown>;
    appendFileSync(file,`${JSON.stringify(safe)}\n`,{encoding:'utf8'});
  }catch{}
}

function parseTraceArgument(value:unknown):Record<string,unknown>|null{
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;
  if(typeof value!=='string')return null;
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;
  }catch{return null;}
}

export function writeTrace(payload:Record<string,unknown>,level:'log'|'error'='log'):void{
  const safe=sanitize(payload) as Record<string,unknown>;
  const line=JSON.stringify(safe);
  if(level==='error')console.error(line);else console.log(line);
  appendTrace(safe);
}

export function installTraceConsoleSink():void{
  if(sinkInstalled)return;
  sinkInstalled=true;

  const originalLog=console.log.bind(console);
  const originalError=console.error.bind(console);

  const wrap=(original:(...args:unknown[])=>void)=>(...args:unknown[])=>{
    try{
      const payload=parseTraceArgument(args[0]);
      if(payload&&TRACE_EVENTS.has(String(payload.event??'')))appendTrace(payload);
    }catch{}
    original(...args);
  };

  console.log=wrap(originalLog) as typeof console.log;
  console.error=wrap(originalError) as typeof console.error;
}

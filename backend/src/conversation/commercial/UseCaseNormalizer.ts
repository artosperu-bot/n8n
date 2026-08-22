import { fold } from '../../shared/text.ts';

const QUERY_PURPOSE=/^(?:conocer|consultar|saber|ver|revisar|preguntar|confirmar|buscar|comparar|cotizar|comprar|reservar|agendar|programar|coordinar|solicitar|pedir|evaluar|elegir|decidir|encontrar)\b/;
const COMMERCIAL_QUERY=/\b(?:precio|stock|disponibilidad|availability|cotizacion|alternativa|opcion)\b.*\b(?:barat|economic|precio|stock|disponib)|\b(?:cual|que)\b.*\b(?:mejor|conviene)|\b(?:agendar|programar|coordinar)\b.*\b(?:prueba|demo|demostracion|cita)\b/;

export function normalizeGenuineUseCase(value:string|null|undefined):string|null{
  const raw=String(value??'').trim();
  const normalized=fold(raw).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  if(!normalized||QUERY_PURPOSE.test(normalized)||COMMERCIAL_QUERY.test(normalized))return null;
  if(/^(?:precio|stock|disponibilidad|stock availability|alternativa mas barata)$/.test(normalized))return null;
  return raw;
}

export function normalizeUseCaseSpinFact(value:string|null|undefined):string|null{
  const raw=String(value??'').trim();
  if(!raw)return null;
  const prefixed=raw.match(/^(?:uso|use[ _-]?case|actividad)\s*:\s*(.+)$/i);
  if(prefixed){
    const useCase=normalizeGenuineUseCase(prefixed[1]);
    return useCase?`uso:${useCase}`:null;
  }
  return normalizeGenuineUseCase(raw)?raw:null;
}


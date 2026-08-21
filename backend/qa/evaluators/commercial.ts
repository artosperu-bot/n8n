import type { QaFinding, QaTurnObservation } from '../types.ts';

export function evaluateCommercial(observation:QaTurnObservation):QaFinding[]{
  const findings:QaFinding[]=[];if(!observation.ok)return findings;
  const response=observation.response??{};const answer=String(response.answer??'');const debug=response.debug??{};const state=response.state??{};
  if((answer.match(/\?/g)??[]).length>1)findings.push({level:'YELLOW',code:'TOO_MANY_QUESTIONS',message:'La respuesta hace más de una pregunta.'});
  if(answer.length>500)findings.push({level:'YELLOW',code:'CHAT_TOO_LONG',message:`Respuesta de ${answer.length} caracteres; excesiva para chat comercial.`});
  if((answer.match(/^\s*[-*•]\s+/gm)??[]).length>4)findings.push({level:'YELLOW',code:'TOO_MANY_BULLETS',message:'Usa demasiados puntos/listas para una conversación.'});
  if(/como modelo de ia|según mi sistema interno|\bINTENT\b|queryTarget|\bRAG\b|\bUNKNOWN\b/i.test(answer))findings.push({level:'YELLOW',code:'ROBOTIC_META_LANGUAGE',message:'Expone lenguaje técnico/meta o suena como sistema.'});
  const isPriceObjection=debug.priceObjection===true||debug.intent==='HANDLE_PRICE_OBJECTION';
  if(isPriceObjection&&!/entiendo|te resulta alto|se sale de tu presupuesto|busquemos una opción|veamos una opción|claro|sí, el precio/i.test(answer))findings.push({level:'YELLOW',code:'EMPATHY_WEAK_PRICE_OBJECTION',message:'La objeción de precio no se reconoce antes de avanzar.'});
  if(!state.lastNba)findings.push({level:'YELLOW',code:'NBA_MISSING',message:'No se registró siguiente mejor acción para el turno.'});
  const message=observation.request.message.toLocaleLowerCase('es');
  if(/construcci[oó]n|se me caen|se me cae|trabajo en campo|bater[ií]a se me acaba/.test(message)&&!/entiendo|construcci[oó]n|ca[ií]da|resistente|trabajo|bater[ií]a|campo/i.test(answer))findings.push({level:'YELLOW',code:'CONTEXT_NOT_ACKNOWLEDGED',message:'No refleja el contexto/problema explícito del cliente.'});
  const llm=debug.llm;
  if(llm&&Number(llm.outputTokens??0)>300)findings.push({level:'YELLOW',code:'LLM_OUTPUT_HEAVY',message:`Salida LLM alta: ${llm.outputTokens} tokens.`});
  if(llm&&Number(llm.totalTokens??0)>1200)findings.push({level:'YELLOW',code:'LLM_TOKEN_HEAVY',message:`Turno LLM costoso: ${llm.totalTokens} tokens.`});
  if(llm&&Number(llm.durationMs??0)>7000)findings.push({level:'YELLOW',code:'LLM_SLOW',message:`LLM lento: ${llm.durationMs} ms.`});
  if(debug.telemetry?.delivered===false)findings.push({level:'YELLOW',code:'TELEMETRY_DELIVERY_FAILED',message:`No se pudo persistir telemetría LLM: ${debug.telemetry.error??'sin detalle'}`});
  if(debug.automation?.delivered===false)findings.push({level:'YELLOW',code:'AUTOMATION_DELIVERY_FAILED',message:`n8n no recibió el evento: ${debug.automation.error??'sin detalle'}`});
  return findings;
}

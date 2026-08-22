import type { QaFinding, QaNbaEvaluation, QaTurnObservation } from '../types.ts';

const PROGRESSION_NBAS=new Set(['ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE','ASSISTED_HANDOFF','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION']);
const PURCHASE_NBAS=new Set(['ASSISTED_HANDOFF','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION']);

function repeatsKnownQuestion(answer:string,state:any):boolean{
  const text=answer.toLocaleLowerCase('es');
  if((state.useCase||state.sector)&&/para qu[eé]\s+(?:lo\s+)?(?:usar[ií]as|usas|uso|necesitas)|uso principal/.test(text))return true;
  if(state.problem&&/qu[eé]\s+problema|qu[eé]\s+te pasa/.test(text))return true;
  if(state.budget!=null&&/presupuesto|cu[aá]nto\s+(?:quieres|puedes)\s+gastar|tope/.test(text))return true;
  if((state.priorities?.length??0)>0&&/qu[eé]\s+(?:criterio|prioridad)|qu[eé]\s+es\s+m[aá]s\s+importante/.test(text))return true;
  if((state.activeProduct||state.selectedProduct||state.recommendedProduct||state.queryTarget)&&/qu[eé]\s+modelo\s+(?:quieres|buscas|te interesa)/.test(text))return true;
  return false;
}

function actionDelivered(nba:string,answer:string):boolean{
  if(!answer.trim())return false;
  if(nba==='ANSWER_ONLY')return true;
  if(nba==='ASK_MISSING_FACT')return /\?/.test(answer);
  if(nba==='SOFT_CLOSE')return /\?|quieres|deseas|puedo|reviso|confirmo|avanz|apart|reserv|cotiz|te ayudo|para (?:continuar|comprar)/i.test(answer);
  if(nba==='OFFER_ALTERNATIVE')return /alternativ|otra opci[oó]n|m[aá]s econ[oó]mic|puedo ofrecer/i.test(answer);
  if(nba==='RECOMMEND')return /recomiend|conviene|me inclinar[ií]a|mejor opci[oó]n/i.test(answer);
  if(nba==='COMPARE')return /compar|diferencia|\bvs\b|ambos|los dos|frente a/i.test(answer);
  if(nba==='COLLECT_RESERVATION_DATA')return /DNI|Carn[eé] de Extranjer|nombre completo|direcci[oó]n/i.test(answer);
  if(nba==='EXECUTE_RESERVATION')return /reserva|confirmar|validar/i.test(answer);
  if(nba==='ASSISTED_HANDOFF')return /asesor|deriv|transfier|paso con/i.test(answer);
  return false;
}

function unsupportedCommercialAction(answer:string,nba:string):boolean{
  const operational=answer.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const unsupported=/\b(?:(?:puedo|podemos|voy a|vamos a|te\s+)?\s*)?(?:agend(?:ar|o|amos|a)|program(?:ar|o|amos|a))\w*\b[^.!?;]{0,45}\b(?:prueba|demo|demostracion|cita)\b|\b(?:yo\s+)?coordino\b|\bte confirmo (?:luego|despues|mas tarde)\b|\bte (?:separo|aparto|reservo)\b|\b(?:(?:puedo|podemos)\s+)?(?:te\s+)?(?:envio|mando|preparo|enviare|mandare)\b[^.!?]{0,45}\b(?:cotizacion|ficha(?: tecnica)?|accesorios?)\b/.test(operational);
  const advisor=/\b(?:te contactara|te llamara|te paso|te derivo)\b[^.!?]{0,45}\b(?:un\s+)?asesor\b/.test(operational)&&nba!=='ASSISTED_HANDOFF';
  const stock=/\b(?:reviso|revisamos|confirmo|confirmamos|revisar|confirmar)\b[^.!?]{0,45}\b(?:stock|disponibilidad)\b/.test(operational)&&nba!=='SOFT_CLOSE';
  const recommendation=/(?:\bte recomiendo\b|\bmi recomendacion es\b)/.test(operational)&&nba!=='RECOMMEND';
  const alternative=/\b(?:otra|una)\s+(?:alternativa|opcion)\s+(?:es|seria)\b|\bpuedo ofrecerte\b/.test(operational)&&nba!=='OFFER_ALTERNATIVE';
  return unsupported||advisor||stock||recommendation||alternative;
}

export function assessNba(observation:QaTurnObservation):QaNbaEvaluation{
  const response=observation.response??{};const state=response.state??{};const debug=response.debug??{};const answer=String(response.answer??'');
  const nba=String(state.lastNba??'').toUpperCase();const intent=String(debug.intent??state.lastIntent??'').toUpperCase();const stage=String(state.commercialStage??'').toUpperCase();
  const purchaseProgress=state.purchaseSignal===true||['PURCHASE','HUMAN'].includes(intent)||stage==='CIERRE'||stage==='CIERRE_ASISTIDO';
  const interestedProgress=state.interestSignal===true&&['PRICE','STOCK'].includes(intent);
  const consultativeProgress=['EVALUATE_USE','RECOMMEND','RECOMMEND_WITHIN_BUDGET','HANDLE_PRICE_OBJECTION'].includes(intent);
  const n1Reason=purchaseProgress?'PURCHASE_REQUIRES_PROGRESSION':interestedProgress?'INTEREST_REQUIRES_PROGRESSION':consultativeProgress?'CONSULTATIVE_TURN_REQUIRES_PROGRESSION':PROGRESSION_NBAS.has(nba)?'DECLARED_ACTION_REQUIRES_DELIVERY':'ANSWER_ONLY_APPROPRIATE';
  const n1Required=n1Reason!=='ANSWER_ONLY_APPROPRIATE';
  const stageMismatch=Boolean(nba)&&((purchaseProgress&&!PURCHASE_NBAS.has(nba))||((stage==='CIERRE'||stage==='CIERRE_ASISTIDO')&&['ASK_MISSING_FACT','RECOMMEND','COMPARE','OFFER_ALTERNATIVE'].includes(nba)));
  const decisionPass=Boolean(nba)&&!stageMismatch&&(!n1Required||nba!=='ANSWER_ONLY');
  const repeatsKnown=nba==='ASK_MISSING_FACT'&&repeatsKnownQuestion(answer,state);
  const n1Delivered=actionDelivered(nba,answer)&&!repeatsKnown;
  const deliveryPass=n1Required?n1Delivered:Boolean(answer.trim());
  const actionabilityPass=!unsupportedCommercialAction(answer,nba);
  return{n1Required,n1Delivered,n1Reason,decisionPass,deliveryPass,actionabilityPass,progressionPass:decisionPass&&deliveryPass&&actionabilityPass};
}

export function evaluateCommercial(observation:QaTurnObservation):QaFinding[]{
  const findings:QaFinding[]=[];if(!observation.ok)return findings;
  const response=observation.response??{};const answer=String(response.answer??'');const debug=response.debug??{};const state=response.state??{};
  if((answer.match(/\?/g)??[]).length>1)findings.push({level:'YELLOW',code:'TOO_MANY_QUESTIONS',message:'La respuesta hace más de una pregunta.'});
  const lengthGuidance=debug.intent==='COMPARE'?750:500;
  if(answer.length>lengthGuidance)findings.push({level:'YELLOW',code:'CHAT_TOO_LONG',message:`Respuesta de ${answer.length} caracteres; excesiva para chat comercial.`});
  if((answer.match(/^\s*[-*•]\s+/gm)??[]).length>4)findings.push({level:'YELLOW',code:'TOO_MANY_BULLETS',message:'Usa demasiados puntos/listas para una conversación.'});
  const internalLanguage=/como modelo de ia|según mi sistema interno|\bINTENT\b|queryTarget|\bRAG\b|\bUNKNOWN\b|\boracle\b|\bconfidence\b|\bscore\b|datos recuperados|ficha técnica|según (?:la )?fuente(?: consultada)?|fuente (?:consultada|disponible)|evidencia (?:disponible|recuperada|técnica)/i;
  if(internalLanguage.test(answer))findings.push({level:'YELLOW',code:'ROBOTIC_META_LANGUAGE',message:'Expone lenguaje técnico/meta o suena como sistema.'});
  const isPriceObjection=debug.priceObjection===true||debug.intent==='HANDLE_PRICE_OBJECTION';
  if(isPriceObjection&&!/entiendo|te resulta alto|se sale de tu presupuesto|busquemos una opción|veamos una opción|claro|sí, el precio/i.test(answer))findings.push({level:'YELLOW',code:'EMPATHY_WEAK_PRICE_OBJECTION',message:'La objeción de precio no se reconoce antes de avanzar.'});
  const nba=assessNba(observation);const action=String(state.lastNba??'').toUpperCase();
  if(!action)findings.push({level:'YELLOW',code:'NBA_MISSING',message:'No se registró siguiente mejor acción para el turno.',rootCause:'NBA'});
  else if(!nba.decisionPass)findings.push({level:state.purchaseSignal===true?'RED':'YELLOW',code:action==='ANSWER_ONLY'&&nba.n1Required?'NBA_PROGRESSION_MISSING':'NBA_STAGE_MISMATCH',message:`La acción ${action} no progresa de forma compatible con ${nba.n1Reason}.`,rootCause:'NBA'});
  if(nba.n1Required&&!nba.n1Delivered&&action!=='ANSWER_ONLY')findings.push({level:'YELLOW',code:'NBA_NOT_DELIVERED',message:`La respuesta no ejecuta de forma visible ${action}.`,rootCause:'NBA'});
  if(action==='ASK_MISSING_FACT'&&repeatsKnownQuestion(answer,state))findings.push({level:'YELLOW',code:'NBA_REPEATS_KNOWN',message:'La siguiente pregunta solicita contexto que ya estaba disponible.',rootCause:'NBA'});
  if(!nba.actionabilityPass)findings.push({level:'RED',code:'UNSUPPORTED_COMMERCIAL_ACTION',message:'La respuesta ofrece una acción que no está autorizada por el N+1 ejecutable.',rootCause:'NBA'});
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

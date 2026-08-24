import type { QaFinding, QaNbaEvaluation, QaTurnObservation } from '../types.ts';

const PROGRESSION_NBAS=new Set(['RELATED_VALUE','ASK_MISSING_FACT','OFFER_ALTERNATIVE','COMPARE','RECOMMEND','SOFT_CLOSE','ASSISTED_HANDOFF','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION']);
const PURCHASE_NBAS=new Set(['ASSISTED_HANDOFF','COLLECT_RESERVATION_DATA','EXECUTE_RESERVATION']);

function foldText(value:unknown):string{return String(value??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

function repeatsKnownQuestion(answer:string,state:any):boolean{
  const text=answer.toLocaleLowerCase('es');
  if((state.useCase||state.sector)&&/para qu[eé]\s+(?:lo\s+)?(?:usar[ií]as|usas|uso|necesitas)|uso principal/.test(text))return true;
  if(state.problem&&/qu[eé]\s+problema|qu[eé]\s+te pasa/.test(text))return true;
  if(state.budget!=null&&/presupuesto|cu[aá]nto\s+(?:quieres|puedes)\s+gastar|tope/.test(text))return true;
  if((state.priorities?.length??0)>0&&/qu[eé]\s+(?:criterio|prioridad)|qu[eé]\s+es\s+m[aá]s\s+importante/.test(text))return true;
  if((state.activeProduct||state.selectedProduct||state.recommendedProduct||state.queryTarget)&&/qu[eé]\s+modelo\s+(?:quieres|buscas|te interesa)/.test(text))return true;
  return false;
}

function relatedValueDelivered(intent:string,answer:string,debug:any):boolean{
  const text=answer.toLocaleLowerCase('es');
  const kind=String(debug?.decisionTrace?.commercialMoveKind??debug?.commercialMoveKind??'').toUpperCase();
  if(kind==='STOCK_STATUS'||intent==='PRICE'||intent==='PRICE_AVAILABILITY')return /\b(?:disponible|disponibilidad|stock|hay unidades?)\b/i.test(text);
  if(kind==='RELATED_VERIFIED_FACT'&&intent==='STOCK')return /\bprecio\b|\bS\/\s*\d+/i.test(answer);
  if(intent==='STOCK')return /\bprecio\b|\bS\/\s*\d+/i.test(answer);
  return /\b(?:adem[aá]s|tambi[eé]n|por otro lado)\b|\bpara\b[^.!?]{0,70}\b(?:útil|sirve|ayuda|conviene|encaja)\b/i.test(answer);
}

function actionDelivered(nba:string,answer:string,intent:string,debug:any):boolean{
  if(!answer.trim())return false;
  if(nba==='ANSWER_ONLY')return true;
  if(nba==='RELATED_VALUE')return relatedValueDelivered(intent,answer,debug);
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

function unsupportedCommercialAction(answer:string,nba:string,intent:string):boolean{
  const operational=foldText(answer);
  const unsupported=/\b(?:(?:puedo|podemos|voy a|vamos a|te\s+)?\s*)?(?:agend(?:ar|o|amos|a)|program(?:ar|o|amos|a))\w*\b[^.!?;]{0,45}\b(?:prueba|demo|demostracion|cita)\b|\b(?:yo\s+)?coordino\b|\bte confirmo (?:luego|despues|mas tarde)\b|\bte (?:separo|aparto|reservo)\b|\b(?:(?:puedo|podemos)\s+)?(?:te\s+)?(?:envio|mando|preparo|enviare|mandare)\b[^.!?]{0,45}\b(?:cotizacion|ficha(?: tecnica)?|accesorios?)\b/.test(operational);
  const advisor=/\b(?:te contactara|te llamara|te paso|te derivo)\b[^.!?]{0,45}\b(?:un\s+)?asesor\b/.test(operational)&&nba!=='ASSISTED_HANDOFF';
  const stock=/\b(?:reviso|revisamos|confirmo|confirmamos|revisar|confirmar)\b[^.!?]{0,45}\b(?:stock|disponibilidad)\b/.test(operational)&&nba!=='SOFT_CLOSE';
  // A recommendation can be the answer to the current request while the +1 is
  // a single SPIN question. Do not mislabel that as an unauthorized N+1.
  const recommendation=/(?:\bte recomiendo\b|\bmi recomendacion es\b)/.test(operational)&&nba!=='RECOMMEND'&&!['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(intent);
  const alternative=/\b(?:otra|una)\s+(?:alternativa|opcion)\s+(?:es|seria)\b|\bpuedo ofrecerte\b/.test(operational)&&nba!=='OFFER_ALTERNATIVE';
  return unsupported||advisor||stock||recommendation||alternative;
}

function internalMetadataLeak(answer:string):boolean{
  const labels=[...answer.matchAll(/(?:^|[\n.!?]\s*)\b(?:Producto\s+ID|C[oó]digo|SKU|Secci[oó]n|Grupo\s+t[eé]cnico|T[ií]tulo|Contenido)\s*:/gi)];
  return labels.length>=2;
}

function sameProduct(a:unknown,b:unknown):boolean{
  return Boolean(a&&b&&String(a).trim().toLocaleLowerCase('es')===String(b).trim().toLocaleLowerCase('es'));
}

export function assessCommercialContinuity(observation:QaTurnObservation):boolean{
  const response=observation.response??{};const state=response.state??{};const debug=response.debug??{};const answer=String(response.answer??'');
  if(state.stageContinuityValid===false)return false;
  const recommended=state.recommendedProduct??null;const visibleRecommendation=state.customerVisibleRecommendedProduct??recommended;
  const recommendationMismatch=Boolean(recommended&&visibleRecommendation&&!sameProduct(recommended,visibleRecommendation));
  const explicitSelectedRecommendation=Boolean(state.explicitSwitch===true&&state.selectedProduct&&sameProduct(state.selectedProduct,recommended));
  if(recommendationMismatch&&!explicitSelectedRecommendation)return false;
  if(state.recommendationChanged===true){
    const from=String(state.recommendationChangeFrom??'').trim();
    const to=String(state.recommendedProduct??'').trim();
    const reason=String(state.recommendationChangeReason??'').trim();
    const communicated=state.recommendationChangeCommunicated===true;
    const visible=String(state.customerVisibleRecommendedProduct??'').trim();
    const text=answer.toLocaleLowerCase('es');
    const explicitChange=/\b(?:cambio|cambia|cambiar|cambiar[ií]a|ahora (?:te )?recomiendo|nueva recomendaci[oó]n)\b/i.test(answer);
    if(!from||!to||!reason||!communicated||!sameProduct(visible,to)||!explicitChange||!text.includes(from.toLocaleLowerCase('es'))||!text.includes(to.toLocaleLowerCase('es')))return false;
  }
  if(/\b(?:ese|esa|ese modelo|esa opci[oó]n)\b/i.test(observation.request.message)){
    const visible=state.selectedProduct??(!recommendationMismatch?state.salientProduct:null)??visibleRecommendation??state.salientProduct??null;
    const target=debug.queryTarget??state.queryTarget??state.activeProduct??null;
    if(visible&&target&&!sameProduct(visible,target))return false;
  }
  return true;
}

export function assessNba(observation:QaTurnObservation):QaNbaEvaluation{
  const response=observation.response??{};const state=response.state??{};const debug=response.debug??{};const answer=String(response.answer??'');
  const nba=String(state.lastNba??'').toUpperCase();const intent=String(debug.intent??state.lastIntent??'').toUpperCase();const stage=String(state.commercialStage??'').toUpperCase();
  const purchaseProgress=state.purchaseSignal===true||['PURCHASE','HUMAN'].includes(intent)||stage==='CIERRE'||stage==='CIERRE_ASISTIDO';
  const interestedProgress=state.interestSignal===true&&['PRICE','STOCK'].includes(intent);
  // A recommendation can itself be the complete N. Do not require a second CTA just
  // because intent=RECOMMEND; require progression only for turns whose purpose is
  // explicitly discovery/objection handling or when an executable NBA is declared.
  const consultativeProgress=['EVALUATE_USE','HANDLE_PRICE_OBJECTION'].includes(intent);
  const n1Reason=purchaseProgress?'PURCHASE_REQUIRES_PROGRESSION':interestedProgress?'INTEREST_REQUIRES_PROGRESSION':consultativeProgress?'CONSULTATIVE_TURN_REQUIRES_PROGRESSION':PROGRESSION_NBAS.has(nba)?'DECLARED_ACTION_REQUIRES_DELIVERY':'ANSWER_ONLY_APPROPRIATE';
  const n1Required=n1Reason!=='ANSWER_ONLY_APPROPRIATE';
  const stageMismatch=Boolean(nba)&&((purchaseProgress&&!PURCHASE_NBAS.has(nba))||((stage==='CIERRE'||stage==='CIERRE_ASISTIDO')&&['ASK_MISSING_FACT','RECOMMEND','COMPARE','OFFER_ALTERNATIVE'].includes(nba)));
  const decisionPass=Boolean(nba)&&!stageMismatch&&(!n1Required||nba!=='ANSWER_ONLY');
  const repeatsKnown=nba==='ASK_MISSING_FACT'&&repeatsKnownQuestion(answer,state);
  const n1Delivered=actionDelivered(nba,answer,intent,debug)&&!repeatsKnown;
  const deliveryPass=n1Required?n1Delivered:Boolean(answer.trim());
  const actionabilityPass=!unsupportedCommercialAction(answer,nba,intent);
  const continuityPass=assessCommercialContinuity(observation);
  return{n1Required,n1Delivered,n1Reason,decisionPass,deliveryPass,actionabilityPass,continuityPass,progressionPass:decisionPass&&deliveryPass&&actionabilityPass&&continuityPass};
}

function hasExplicitNeedCue(message:string):boolean{
  const text=foldText(message);
  return /\b(?:necesito|requiero|busco|priorizo|mi prioridad|me importa|lo mas importante|si o si|quiero que sea|necesito que)\b/.test(text);
}
function isFocusedFactualIntent(intent:string):boolean{
  return ['ATTRIBUTE','CAPABILITY','PRICE_AVAILABILITY','PRICE','STOCK','IMAGES','IMAGE','POLICY','WARRANTY','ORDER_STATUS'].includes(intent);
}
function spinQuestionMatchesMissing(answer:string,missing:string):boolean{
  const text=foldText(answer);const fact=foldText(missing);
  if(/uso/.test(fact))return /\buso\b|para que/.test(text);
  if(/impacto|implicacion|consecuencia/.test(fact))return /impacto|afecta|genera|ocasiona|provoca|consecuencia|interrup|perdida|pierdes|parar|detener/.test(text);
  if(/problema/.test(fact))return /problema|complica|falla|que te pasa|que ocurre/.test(text);
  if(/prioridad|criterio/.test(fact))return /prioridad|priorizas|importa|criterio|pesa mas|mas importante/.test(text);
  if(/presupuesto|tope/.test(fact))return /presupuesto|tope|hasta cuanto|cuanto.*(?:gastar|pagar|llegar)/.test(text);
  if(/modelo|producto/.test(fact))return /modelo|producto|equipo|celular/.test(text);
  return false;
}

export function assessSpinUtility(observation:QaTurnObservation):boolean{
  const response=observation.response??{};const state=response.state??{};const debug=response.debug??{};const answer=String(response.answer??'');
  const action=String(state.lastNba??'').toUpperCase();const intent=String(debug.intent??state.lastIntent??'').toUpperCase();const message=String(observation.request.message??'');
  const contribution=String(state.lastSpinContribution??'').toUpperCase();

  // A factual question without explicit requirement language cannot create a new
  // SPIN contribution merely because it mentions NFC, battery, stock, etc.
  if(isFocusedFactualIntent(intent)&&/[¿?]/.test(message)&&!hasExplicitNeedCue(message)&&contribution)return false;
  // Same protection for neutral questions such as “¿es el más vendido?”: unless
  // they are answering a pending discovery question they cannot manufacture SPIN.
  if(intent==='OTHER'&&!state.pendingMissingFact&&contribution)return false;

  if(action!=='ASK_MISSING_FACT')return true;
  if(state.purchaseSignal===true||['CIERRE','CIERRE_ASISTIDO'].includes(String(state.commercialStage??'').toUpperCase()))return false;
  const missing=String(state.pendingMissingFact??'');
  if(!missing||repeatsKnownQuestion(answer,state))return false;
  if((answer.match(/\?/g)??[]).length!==1)return false;

  const foldedMissing=foldText(missing);
  const consumable=/uso|problema|impacto|implicacion|consecuencia|prioridad|criterio|presupuesto|tope|modelo|producto/.test(foldedMissing);
  if(!consumable||!spinQuestionMatchesMissing(answer,missing))return false;

  if(/uso/.test(foldedMissing)&&(state.useCase||state.sector))return false;
  if(/problema/.test(foldedMissing)&&state.problem)return false;
  if(/impacto|implicacion|consecuencia/.test(foldedMissing)&&contribution==='IMPLICACION')return false;
  if(/prioridad|criterio/.test(foldedMissing)&&(state.priorities?.length??0)>0)return false;
  if(/presupuesto|tope/.test(foldedMissing)){
    if(state.budget!=null)return false;
    if(!['BUDGET_CONSTRAINT','OBJECTION','HANDLE_PRICE_OBJECTION'].includes(intent))return false;
  }
  if(/modelo|producto/.test(foldedMissing)&&(state.activeProduct||state.selectedProduct||state.recommendedProduct||state.queryTarget))return false;
  return true;
}

export function assessFabGrounding(observation:QaTurnObservation):boolean{
  const response=observation.response??{};const state=response.state??{};const debug=response.debug??{};const answer=String(response.answer??'');
  const attributes=Array.isArray(state.currentAttributes)?state.currentAttributes.map((x:unknown)=>String(x).toUpperCase()):[];
  const attributeText=attributes.join(' ');
  const technicalAttribute=/RAM|MEMORIA|BATERIA|RESISTENCIA|CAIDA|DURABILIDAD|CAMARA|TERMICA|5G|PANTALLA|NFC|CONECTIVIDAD|FISICO|PESO|DIMENSION|GROSOR/.test(attributeText);
  const decisionContext=['COMPARE','RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(String(debug.intent??'').toUpperCase())||/^RAG_(?:COMPARISON|RECOMMENDATION)/.test(String(debug.route??''));
  // A single inferred priority is not proof of customer context. Isolated factual
  // questions may correctly answer only the fact; FAB becomes expected when the
  // customer gave a real use/problem, multiple criteria, implications, or is deciding.
  const genuineContext=Boolean(state.useCase||state.problem||(state.implications?.length??0)>0||(state.priorities?.length??0)>=2||decisionContext);
  if(!technicalAttribute||!genuineContext||Number(debug.ragCount??0)<=0||!/^RAG_(?:PRODUCT|COMPARISON|RECOMMENDATION)/.test(String(debug.route??'')))return true;
  const feature=attributes.some((attribute:string)=>{
    if(/RAM|MEMORIA/.test(attribute))return /\bram\b|\bmemoria\b|\bgb\b/i.test(answer);
    if(/BATERIA/.test(attribute))return /bater[ií]a|carga|mah|\bw\b/i.test(answer);
    if(/RESISTENCIA|CAIDA|DURABILIDAD|PROTECCION/.test(attribute))return /resisten|ip6[89]|mil.std|ca[ií]da|golpe|impacto/i.test(answer);
    if(/TERMICA/.test(attribute))return /t[eé]rmic|temperatura|resoluci[oó]n t[eé]rmica/i.test(answer);
    if(/CAMARA/.test(attribute))return /c[aá]mara|sensor|\bmp\b|visi[oó]n nocturna/i.test(answer);
    if(/PANTALLA/.test(attribute))return /pantalla|pulgad|\bhz\b|resoluci[oó]n/i.test(answer);
    if(/FISICO|PESO|DIMENSION|GROSOR/.test(attribute))return /peso|pesa|gramos|\bg\b|dimensi|grosor/i.test(answer);
    return new RegExp(`\\b${attribute.replace(/[^A-Z0-9]/g,'')}\\b`,'i').test(answer);
  });
  const commercial=answer.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const benefit=/\b(?:te ayuda|te da|mas margen|punto a favor|util|permite|facilita|reduce|conviene|ideal|encaja|adecuad[oa]|proteccion ante|mayor|superior|mas rapid[oa]|en tu caso|para (?:tu|ese|esa|trabajo|obra|construccion|uso|jornada)|si priorizas|si prefieres|para lo que)\b/i.test(commercial);
  return feature&&benefit;
}

export function evaluateCommercial(observation:QaTurnObservation):QaFinding[]{
  const findings:QaFinding[]=[];if(!observation.ok)return findings;
  const response=observation.response??{};const answer=String(response.answer??'');const debug=response.debug??{};const state=response.state??{};
  if((answer.match(/\?/g)??[]).length>1)findings.push({level:'YELLOW',code:'TOO_MANY_QUESTIONS',message:'La respuesta hace más de una pregunta.'});
  const lengthGuidance=debug.intent==='COMPARE'?750:500;
  if(answer.length>lengthGuidance)findings.push({level:'YELLOW',code:'CHAT_TOO_LONG',message:`Respuesta de ${answer.length} caracteres; excesiva para chat comercial.`});
  if((answer.match(/^\s*[-*•]\s+/gm)??[]).length>4)findings.push({level:'YELLOW',code:'TOO_MANY_BULLETS',message:'Usa demasiados puntos/listas para una conversación.'});
  if(internalMetadataLeak(answer))findings.push({level:'RED',code:'INTERNAL_METADATA_LEAK',message:'La respuesta expone etiquetas internas del sobre RAG o catálogo.',rootCause:'WRITER'});
  const internalLanguage=/como modelo de ia|según mi sistema interno|\bINTENT\b|queryTarget|\bRAG\b|\bUNKNOWN\b|\boracle\b|\bconfidence\b|\bscore\b|datos recuperados|ficha técnica|según (?:la )?fuente(?: consultada)?|fuente (?:consultada|disponible)|evidencia (?:disponible|recuperada|técnica)|\bSOFT_CLOSE_TO_STOCK\b|\bASK_(?:USE_CASE|PROBLEM|IMPLICATION|PRIORITY|BUDGET)\b/i;
  if(internalLanguage.test(answer))findings.push({level:'YELLOW',code:'ROBOTIC_META_LANGUAGE',message:'Expone lenguaje técnico/meta o suena como sistema.'});
  const isPriceObjection=debug.priceObjection===true||debug.intent==='HANDLE_PRICE_OBJECTION';
  if(isPriceObjection&&!/te resulta alto|se sale de tu presupuesto|busquemos una opción|veamos una opción|claro|sí, el precio|podemos buscar/i.test(answer))findings.push({level:'YELLOW',code:'EMPATHY_WEAK_PRICE_OBJECTION',message:'La objeción de precio no se reconoce antes de avanzar.'});
  if(isPriceObjection&&/entiendo la objecion/i.test(foldText(answer)))findings.push({level:'YELLOW',code:'LAER_ROBOTIC_ACKNOWLEDGEMENT',message:'LAER reconoce la objeción con lenguaje de evaluador en vez de lenguaje humano.',rootCause:'WRITER'});
  const nba=assessNba(observation);const action=String(state.lastNba??'').toUpperCase();
  if(!action)findings.push({level:'YELLOW',code:'NBA_MISSING',message:'No se registró siguiente mejor acción para el turno.',rootCause:'NBA'});
  else if(!nba.decisionPass)findings.push({level:state.purchaseSignal===true?'RED':'YELLOW',code:action==='ANSWER_ONLY'&&nba.n1Required?'NBA_PROGRESSION_MISSING':'NBA_STAGE_MISMATCH',message:`La acción ${action} no progresa de forma compatible con ${nba.n1Reason}.`,rootCause:'NBA'});
  if(nba.n1Required&&!nba.n1Delivered&&action!=='ANSWER_ONLY')findings.push({level:'YELLOW',code:'NBA_NOT_DELIVERED',message:`La respuesta no ejecuta de forma visible ${action}.`,rootCause:'NBA'});
  if(action==='ASK_MISSING_FACT'&&repeatsKnownQuestion(answer,state))findings.push({level:'YELLOW',code:'NBA_REPEATS_KNOWN',message:'La siguiente pregunta solicita contexto que ya estaba disponible.',rootCause:'NBA'});
  if(!nba.actionabilityPass)findings.push({level:'RED',code:'UNSUPPORTED_COMMERCIAL_ACTION',message:'La respuesta ofrece una acción que no está autorizada por el N+1 ejecutable.',rootCause:'NBA'});
  if(!nba.continuityPass)findings.push({level:'RED',code:'COMMERCIAL_PRODUCT_SWITCH_UNEXPLAINED',message:'La decisión comercial cambió de producto o etapa sin una transición visible válida.',rootCause:'NBA'});
  if(!assessSpinUtility(observation))findings.push({level:'YELLOW',code:'SPIN_UTILITY_INVALID',message:'SPIN creó memoria indebida o la pregunta no corresponde al único dato faltante.',rootCause:'NBA'});
  if(!assessFabGrounding(observation))findings.push({level:'YELLOW',code:'FAB_GROUNDING_MISSING',message:'Un atributo verificado no se convirtió en un beneficio comercial seguro.',rootCause:'WRITER'});
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

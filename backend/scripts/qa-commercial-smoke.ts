import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

/**
 * Small acceptance gate before COMMERCIAL 50.
 *
 * Conversation A certifies flexible SPIN one question at a time:
 * S -> P -> I -> N, reusing facts already supplied by the customer.
 * Conversation B certifies that interest is not purchase and that reservation
 * starts only after explicit purchase language.
 *
 * This is a LOCAL/live gate. It also audits ia_conversaciones + ia_contexto
 * read-only when PERSISTENCE_MODE=supabase. GitHub Actions is not part of it.
 */
const scenarios:QaScenario[]=[
  {
    id:'CSMOKE-SPIN-PROGRESSION',family:'COMMERCIAL',title:'SPIN progresses one useful question at a time and N+1 stays bounded',turns:[
      {message:'Hola, estoy viendo el Armor 22, ¿qué tal es?',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 22'}},
      {message:'Lo quiero para construcción.',expected:{intent:'EVALUATE_USE',queryTarget:'Armor 22'}},
      {message:'Se me cae seguido el celular.',expected:{queryTarget:'Armor 22'}},
      {message:'Cuando pasa pierdo tiempo y tengo que parar el trabajo.',expected:{queryTarget:'Armor 22'}},
      {message:'Lo más importante para mí es que aguante golpes.',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'CSMOKE-INTEREST-NOT-PURCHASE',family:'CLOSING',title:'Interest remains interest until explicit purchase',turns:[
      {message:'Estoy viendo el Armor 22 para trabajo.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Cuánto cuesta?',expected:{intent:'PRICE',queryTarget:'Armor 22'}},
      {message:'¿Está disponible?',expected:{intent:'STOCK',queryTarget:'Armor 22'}},
      {message:'Si está disponible me interesa.',expected:{queryTarget:'Armor 22'}},
      {message:'Ya, lo quiero comprar.',expected:{intent:'PURCHASE',queryTarget:'Armor 22'}},
    ],
  },
];

const result=await runLiveQa({scenarios,outputDir:'qa-results/commercial-smoke'});
const supabaseUrl=String(process.env.SUPABASE_URL??'').replace(/\/$/,'');
const supabaseKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY??'');
const conversationTable=process.env.SUPABASE_CONVERSATION_TABLE??'ia_conversaciones';
const contextTable=process.env.SUPABASE_CONTEXT_TABLE??'ia_contexto';
const persistenceMode=String(result.report.modes?.persistence??'unknown').toLowerCase();
const latest=resolve('qa-results/commercial-smoke/latest');
await mkdir(latest,{recursive:true});

type Finding={level:'RED'|'YELLOW';code:string;message:string};
function questionCount(text:string):number{return (String(text??'').match(/\?/g)??[]).length;}
function stateNba(turn:any):string{return String(turn?.observation?.response?.debug?.nextBestAction??turn?.observation?.response?.state?.lastNba??'').toUpperCase();}
function normalizedArray(value:any):string[]{return Array.isArray(value)?value.map(x=>String(x)):[];}
function containsBudgetQuestion(value:any):boolean{return /presupuesto|tope|hasta cuanto|cuanto.*(?:gastar|pagar)/i.test(String(value??''));}
function jsonish(value:any):any{if(value&&typeof value==='object')return value;if(typeof value!=='string'||!value.trim())return{};try{return JSON.parse(value);}catch{return{};}}
function headers(){return{apikey:supabaseKey,authorization:`Bearer ${supabaseKey}`};}
async function supabaseRows(table:string,sessionId:string,select:string,order?:string):Promise<any[]>{
  const url=new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('session_id',`eq.${sessionId}`);
  url.searchParams.set('select',select);
  if(order)url.searchParams.set('order',order);
  const response=await fetch(url,{headers:headers()});
  if(!response.ok)throw new Error(`${table} HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
function add(findings:Finding[],condition:boolean,code:string,message:string){if(!condition)findings.push({level:'RED',code,message});}

const functional:any[]=[];
for(const scenario of result.report.scenarios){
  const turns=scenario.turns.map(turn=>({
    turn:turn.turn,message:turn.message,answer:String(turn?.observation?.response?.answer??''),
    nba:stateNba(turn),state:turn?.observation?.response?.state??{},
    findings:turn.findings.filter(f=>f.code!=='AUTOMATION_DELIVERY_FAILED').map(f=>({...f})),
  }));
  const findings:Finding[]=[];

  for(const turn of turns)add(findings,questionCount(turn.answer)<=1,'MULTIPLE_VISIBLE_QUESTIONS',`T${turn.turn} hizo ${questionCount(turn.answer)} preguntas visibles.`);

  if(scenario.id==='CSMOKE-SPIN-PROGRESSION'){
    const [t1,t2,t3,t4,t5]=turns;
    add(findings,t1.nba==='ASK_MISSING_FACT','SITUATION_NBA_MISSING',`T1 debía abrir SPIN con ASK_MISSING_FACT y terminó en ${t1.nba||'SIN_NBA'}.`);
    add(findings,questionCount(t1.answer)===1&&/uso|para qu[eé]/i.test(t1.answer),'SITUATION_QUESTION_MISSING','T1 debía preguntar una sola vez por el uso principal.');
    add(findings,t1.answer.length<=450&&!/\n\s*[4-9]\./.test(t1.answer),'PRODUCT_INFO_TOO_LONG',`T1 sigue pareciendo ficha técnica (${t1.answer.length} caracteres).`);

    add(findings,Boolean(t2.state?.useCase),'USE_CASE_NOT_PERSISTED','T2 no conservó construcción como caso de uso.');
    add(findings,t2.nba==='ASK_MISSING_FACT','PROBLEM_NBA_MISSING',`T2 debía avanzar a una pregunta de problema y terminó en ${t2.nba||'SIN_NBA'}.`);
    add(findings,/complica|problema|falla|pasa/i.test(t2.answer)&&!containsBudgetQuestion(t2.answer),'PROBLEM_QUESTION_WRONG','T2 debía preguntar por el problema, no por presupuesto.');

    add(findings,Boolean(t3.state?.problem),'PROBLEM_NOT_PERSISTED','T3 no conservó la caída recurrente como problema.');
    add(findings,t3.nba==='ASK_MISSING_FACT','IMPLICATION_NBA_MISSING',`T3 debía avanzar a impacto/implicación y terminó en ${t3.nba||'SIN_NBA'}.`);
    add(findings,/genera|afecta|interrup|p[eé]rdida|pierdes|parar|consecuencia/i.test(t3.answer)&&!containsBudgetQuestion(t3.answer),'IMPLICATION_QUESTION_WRONG','T3 debía explorar el impacto del problema, no presupuesto ni otro CTA.');

    add(findings,String(t4.state?.lastSpinContribution??'').toUpperCase()==='IMPLICACION','IMPLICATION_NOT_PERSISTED',`T4 debía registrar IMPLICACION y registró ${String(t4.state?.lastSpinContribution??null)}.`);
    add(findings,t4.nba==='ASK_MISSING_FACT','NEED_NBA_MISSING',`T4 debía avanzar a prioridad/need-payoff y terminó en ${t4.nba||'SIN_NBA'}.`);
    add(findings,/pesa|prioridad|importante|importa/i.test(t4.answer)&&!containsBudgetQuestion(t4.answer),'NEED_QUESTION_WRONG','T4 debía preguntar qué pesa más al elegir.');

    add(findings,normalizedArray(t5.state?.priorities).some(value=>/resisten|golpe|caida/i.test(value)),'NEED_NOT_PERSISTED',`T5 no conservó resistencia como prioridad: ${JSON.stringify(t5.state?.priorities??[])}.`);
    add(findings,t5.nba!=='ASK_MISSING_FACT','SPIN_DID_NOT_FINISH',`T5 ya tenía S/P/I/N y no debía seguir interrogando; NBA=${t5.nba}.`);
    add(findings(!0 as never) as any,true,'','');
  }

  if(scenario.id==='CSMOKE-INTEREST-NOT-PURCHASE'){
    const [,t2,t3,t4,t5]=turns;
    add(findings,t2.nba!=='COLLECT_RESERVATION_DATA','PRICE_STARTED_RESERVATION','La consulta de precio no puede iniciar reserva.');
    add(findings,t3.nba!=='COLLECT_RESERVATION_DATA','STOCK_STARTED_RESERVATION','La consulta de stock no puede iniciar reserva.');
    add(findings,t4.state?.purchaseSignal!==true,'INTEREST_BECAME_PURCHASE','“Me interesa” quedó persistido como purchaseSignal=true.');
    add(findings,String(t4.state?.lastIntent??'').toUpperCase()!=='PURCHASE','INTEREST_INTENT_PURCHASE',`“Me interesa” terminó con intent=${String(t4.state?.lastIntent??null)}.`);
    add(findings,t4.nba!=='COLLECT_RESERVATION_DATA','INTEREST_STARTED_RESERVATION',`“Me interesa” inició ${t4.nba}.`);
    add(findings,t5.state?.purchaseSignal===true,'EXPLICIT_PURCHASE_NOT_PERSISTED','La compra explícita no dejó purchaseSignal=true.');
    add(findings,String(t5.state?.lastIntent??'').toUpperCase()==='PURCHASE','EXPLICIT_PURCHASE_INTENT_MISSING',`La compra explícita terminó con intent=${String(t5.state?.lastIntent??null)}.`);
    add(findings,t5.nba==='COLLECT_RESERVATION_DATA'||t5.nba==='ASSISTED_HANDOFF','EXPLICIT_PURCHASE_DID_NOT_PROGRESS',`La compra explícita no avanzó a un paso de compra; NBA=${t5.nba}.`);
  }

  functional.push({id:scenario.id,sessionId:scenario.sessionId,turns,findings,status:findings.length||turns.some(t=>t.findings.some((f:any)=>f.level==='RED'))?'RED':'GREEN'});
}

const supabaseAudit:any={mode:persistenceMode,status:'RED',sessions:[],error:null};
if(persistenceMode!=='supabase')supabaseAudit.error=`PERSISTENCE_MODE=${persistenceMode}; este smoke exige Supabase.`;
else if(!supabaseUrl||!supabaseKey)supabaseAudit.error='Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para auditoría read-only.';
else{
  try{
    for(const scenario of result.report.scenarios){
      const conversationRows=await supabaseRows(conversationTable,scenario.sessionId,'message_id,mensaje_cliente,respuesta_bot,intencion,ruta,siguiente_accion,etapa_comercial,estrategia_recomendada,spin_aporte,spin_fase_actual,actividad_detectada,problemas_detectados,implicaciones_detectadas,prioridades_detectadas,pregunta_pendiente_turno,accion_pendiente_turno,nivel_interes,contexto_comercial_snapshot,fecha','fecha.asc');
      const contextRows=await supabaseRows(contextTable,scenario.sessionId,'session_id,context_version,ultima_intencion,ultima_accion,ultima_ruta,actividad_activa,problema_activo,presupuesto_activo,senal_compra,accion_pendiente,etapa_conversacion,contexto');
      const checks:Record<string,boolean>={conversationRows:conversationRows.length===scenario.turns.length,contextRow:contextRows.length===1,contextVersion:Number(contextRows[0]?.context_version)===scenario.turns.length};
      const findings:Finding[]=[];

      if(scenario.id==='CSMOKE-SPIN-PROGRESSION'){
        const [r1,r2,r3,r4,r5]=conversationRows;
        checks.situation=String(r1?.siguiente_accion??'').toUpperCase()==='ASK_MISSING_FACT'&&/uso/i.test(JSON.stringify(r1?.pregunta_pendiente_turno??{}));
        checks.problem=String(r2?.siguiente_accion??'').toUpperCase()==='ASK_MISSING_FACT'&&/problema/i.test(JSON.stringify(r2?.pregunta_pendiente_turno??{}))&&!containsBudgetQuestion(r2?.pregunta_pendiente_turno);
        checks.implication=String(r3?.siguiente_accion??'').toUpperCase()==='ASK_MISSING_FACT'&&/impacto|implic/i.test(JSON.stringify(r3?.pregunta_pendiente_turno??{}));
        checks.implicationPersisted=String(r4?.spin_aporte??'').toUpperCase()==='IMPLICACION'||normalizedArray(r4?.implicaciones_detectadas).length>0;
        checks.need=String(r4?.siguiente_accion??'').toUpperCase()==='ASK_MISSING_FACT'&&/prioridad/i.test(JSON.stringify(r4?.pregunta_pendiente_turno??{}));
        checks.needPersisted=normalizedArray(r5?.prioridades_detectadas).some(value=>/resisten|golpe|caida/i.test(value));
        checks.noBudgetHijack=[r1,r2,r3,r4].every(row=>!containsBudgetQuestion(row?.pregunta_pendiente_turno));
        checks.spinFinished=String(r5?.siguiente_accion??'').toUpperCase()!=='ASK_MISSING_FACT';
        for(const [key,ok] of Object.entries(checks))if(!ok)findings.push({level:'RED',code:`DB_${key.toUpperCase()}`,message:`Supabase no certificó ${key} en la progresión SPIN.`});
      }

      if(scenario.id==='CSMOKE-INTEREST-NOT-PURCHASE'){
        const r4=conversationRows[3]??{},r5=conversationRows[4]??{};
        const snap4=jsonish(r4.contexto_comercial_snapshot),snap5=jsonish(r5.contexto_comercial_snapshot);
        checks.interestNotPurchase=String(r4.intencion??'').toUpperCase()!=='PURCHASE'&&String(r4.siguiente_accion??'').toUpperCase()!=='COLLECT_RESERVATION_DATA'&&snap4?.venta?.senal_compra!==true;
        checks.explicitPurchase=String(r5.intencion??'').toUpperCase()==='PURCHASE'&&['COLLECT_RESERVATION_DATA','ASSISTED_HANDOFF'].includes(String(r5.siguiente_accion??'').toUpperCase())&&snap5?.venta?.senal_compra===true;
        if(!checks.interestNotPurchase)findings.push({level:'RED',code:'DB_INTEREST_BECAME_PURCHASE',message:`ia_conversaciones convirtió interés en compra: ${JSON.stringify({intent:r4.intencion,nba:r4.siguiente_accion,senalCompra:snap4?.venta?.senal_compra})}.`});
        if(!checks.explicitPurchase)findings.push({level:'RED',code:'DB_EXPLICIT_PURCHASE_MISSING',message:`ia_conversaciones no avanzó la compra explícita: ${JSON.stringify({intent:r5.intencion,nba:r5.siguiente_accion,senalCompra:snap5?.venta?.senal_compra})}.`});
      }

      const status=Object.values(checks).every(Boolean)&&!findings.length?'GREEN':'RED';
      supabaseAudit.sessions.push({id:scenario.id,sessionId:scenario.sessionId,status,checks,findings,conversationRows,contextRow:contextRows[0]??null});
    }
    supabaseAudit.status=supabaseAudit.sessions.every((x:any)=>x.status==='GREEN')?'GREEN':'RED';
  }catch(error){supabaseAudit.error=error instanceof Error?error.message:String(error);}
}

const functionalStatus=functional.every(x=>x.status==='GREEN')?'GREEN':'RED';
const gate=functionalStatus==='GREEN'&&supabaseAudit.status==='GREEN'?'GREEN':'RED';
const summary={runId:result.report.runId,gate,functionalStatus,supabaseStatus:supabaseAudit.status,scenarios:functional.map(x=>({id:x.id,sessionId:x.sessionId,status:x.status,findings:x.findings})),supabase:supabaseAudit};
await writeFile(resolve(latest,'commercial-smoke-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
await writeFile(resolve(latest,'commercial-smoke-session-ids.txt'),`${result.report.scenarios.map(x=>`${x.id}\t${x.sessionId}`).join('\n')}\n`,'utf8');

console.log(`COMMERCIAL SMOKE gate=${gate} functional=${functionalStatus} supabase=${supabaseAudit.status}`);
console.table(functional.map(x=>({status:x.status,case:x.id,session:x.sessionId,findings:x.findings.map((f:Finding)=>f.code).join(',')})));
if(supabaseAudit.sessions.length)console.table(supabaseAudit.sessions.map((x:any)=>({status:x.status,case:x.id,session:x.sessionId,rows:x.conversationRows.length,contextVersion:x.contextRow?.context_version??null})));
if(supabaseAudit.error)console.error(`SUPABASE AUDIT: ${supabaseAudit.error}`);
console.log('Report: qa-results/commercial-smoke/latest/commercial-smoke-summary.json');
process.exitCode=gate==='GREEN'?0:1;

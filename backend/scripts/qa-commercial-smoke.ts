import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { commercial50Scenarios } from '../qa/scenarios/commercial50.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios=commercial50Scenarios.slice(0,2);
const result=await runLiveQa({scenarios,outputDir:'qa-results/commercial-smoke'});
const baseUrl=(process.env.QA_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
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

const functional:any[]=[];
for(const scenario of result.report.scenarios){
  const turns=scenario.turns.map(turn=>({turn:turn.turn,message:turn.message,answer:String(turn?.observation?.response?.answer??''),nba:stateNba(turn),state:turn?.observation?.response?.state??{},findings:turn.findings.filter(f=>f.code!=='AUTOMATION_DELIVERY_FAILED').map(f=>({...f}))}));
  const findings:Finding[]=[];
  if(scenario.id==='C50-F01-DISCOVERY-THEN-FACTS'){
    const t1=turns[0],t2=turns[1];
    if(t1.nba!=='ASK_MISSING_FACT')findings.push({level:'RED',code:'BROAD_INFO_DID_NOT_OPEN_DISCOVERY',message:`T1 debía terminar en ASK_MISSING_FACT y terminó en ${t1.nba||'SIN_NBA'}.`});
    if(questionCount(t1.answer)!==1)findings.push({level:'RED',code:'BROAD_INFO_QUESTION_COUNT',message:`T1 debía hacer exactamente 1 pregunta útil; hizo ${questionCount(t1.answer)}.`});
    if(t1.answer.length>550||/\n\s*[4-9]\./.test(t1.answer))findings.push({level:'RED',code:'BROAD_INFO_SPEC_DUMP',message:`T1 sigue pareciendo ficha técnica larga (${t1.answer.length} caracteres).`});
    if(t2.nba!=='ANSWER_ONLY')findings.push({level:'RED',code:'FACTUAL_NFC_NOT_DIRECT',message:`T2 NFC debía quedar ANSWER_ONLY y terminó en ${t2.nba||'SIN_NBA'}.`});
    if(questionCount(t2.answer)!==0)findings.push({level:'RED',code:'FACTUAL_NFC_REASKED_DISCOVERY',message:'T2 NFC volvió a hacer una pregunta en vez de resolver el turno factual.'});
    if(normalizedArray(t2.state?.priorities).length) findings.push({level:'RED',code:'FACTUAL_NFC_CONTAMINATED_PRIORITIES',message:`T2 dejó prioridades=${JSON.stringify(t2.state.priorities)}.`});
    if(t2.state?.lastSpinContribution)findings.push({level:'RED',code:'FACTUAL_NFC_CONTAMINATED_SPIN',message:`T2 dejó lastSpinContribution=${String(t2.state.lastSpinContribution)}.`});
  }
  functional.push({id:scenario.id,sessionId:scenario.sessionId,turns,findings,status:findings.some(x=>x.level==='RED')||turns.some(t=>t.findings.some((f:any)=>f.level==='RED'))?'RED':'GREEN'});
}

const supabaseAudit:any={mode:persistenceMode,status:'RED',sessions:[],error:null};
if(persistenceMode!=='supabase')supabaseAudit.error=`PERSISTENCE_MODE=${persistenceMode}; este smoke exige Supabase.`;
else if(!supabaseUrl||!supabaseKey)supabaseAudit.error='Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para auditoría read-only.';
else{
  try{
    for(const scenario of result.report.scenarios){
      const conversationRows=await supabaseRows(conversationTable,scenario.sessionId,'message_id,mensaje_cliente,respuesta_bot,intencion,ruta,siguiente_accion,etapa_comercial,estrategia_recomendada,spin_aporte,spin_fase_actual,actividad_detectada,problemas_detectados,prioridades_detectadas,pregunta_pendiente_turno,accion_pendiente_turno,nivel_interes,contexto_comercial_snapshot,fecha','fecha.asc');
      const contextRows=await supabaseRows(contextTable,scenario.sessionId,'session_id,context_version,ultima_intencion,ultima_accion,ultima_ruta,actividad_activa,problema_activo,presupuesto_activo,senal_compra,accion_pendiente,etapa_conversacion,contexto');
      const checks:Record<string,boolean>={conversationRows:conversationRows.length===scenario.turns.length,contextRow:contextRows.length===1,contextVersion:Number(contextRows[0]?.context_version)===scenario.turns.length};
      const findings:Finding[]=[];
      if(scenario.id==='C50-F01-DISCOVERY-THEN-FACTS'){
        const r1=conversationRows[0]??{},r2=conversationRows[1]??{};
        checks.t1Discovery=String(r1.siguiente_accion??'').toUpperCase()==='ASK_MISSING_FACT';
        checks.t1PendingUse=/uso/i.test(JSON.stringify(r1.pregunta_pendiente_turno??{}));
        checks.t1NoFakeSpin=r1.spin_aporte==null&&normalizedArray(r1.prioridades_detectadas).length===0;
        checks.t2Direct=String(r2.siguiente_accion??'').toUpperCase()==='ANSWER_ONLY';
        checks.t2NoFakeSpin=r2.spin_aporte==null&&normalizedArray(r2.prioridades_detectadas).length===0;
        if(!checks.t1Discovery)findings.push({level:'RED',code:'DB_T1_DISCOVERY_MISSING',message:`ia_conversaciones T1 siguiente_accion=${String(r1.siguiente_accion??null)}.`});
        if(!checks.t1PendingUse)findings.push({level:'RED',code:'DB_T1_PENDING_USE_MISSING',message:'ia_conversaciones T1 no dejó uso principal como pregunta pendiente.'});
        if(!checks.t1NoFakeSpin)findings.push({level:'RED',code:'DB_T1_SPIN_CONTAMINATION',message:`ia_conversaciones T1 spin/prioridades inesperadas: ${JSON.stringify({spin:r1.spin_aporte,prioridades:r1.prioridades_detectadas})}.`});
        if(!checks.t2Direct)findings.push({level:'RED',code:'DB_T2_NOT_ANSWER_ONLY',message:`ia_conversaciones T2 siguiente_accion=${String(r2.siguiente_accion??null)}.`});
        if(!checks.t2NoFakeSpin)findings.push({level:'RED',code:'DB_T2_SPIN_CONTAMINATION',message:`ia_conversaciones T2 contaminó SPIN/prioridades: ${JSON.stringify({spin:r2.spin_aporte,prioridades:r2.prioridades_detectadas})}.`});
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

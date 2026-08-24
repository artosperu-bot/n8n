import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fullRag50Scenarios, FULL_RAG_50_TURN_COUNT } from '../qa/scenarios/fullRag50.ts';
import { runLiveQa } from './qa-live.ts';

function fold(value:string):string{return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function fabricatedPressure(answer:string):string|null{
  const text=fold(answer);
  if(/(?:^|[.!?]\s*)(?:quedan|hay)\s+(?:muy\s+)?(?:pocas?|poquisimas?)\s+(?:unidades?|equipos?)\b/.test(text)||/(?:^|[.!?]\s*)(?:son\s+)?las?\s+ultimas?\s+(?:unidades?|equipos?)\b/.test(text))return'FAKE_SCARCITY';
  if(/(?:^|[.!?]\s*)(?:aprovecha|compralo|comprala|separalo|separala)\s+(?:hoy|ahora|ya)\b|(?:^|[.!?]\s*)se\s+acaba\s+hoy\b/.test(text))return'FAKE_URGENCY';
  if(/(?:^|[.!?]\s*)(?:es|este\s+es)\s+el\s+mas\s+vendido\b|(?:^|[.!?]\s*)todos\s+lo\s+estan\s+comprando\b/.test(text))return'INVENTED_SOCIAL_PROOF';
  return null;
}
function compactContext(state:any){return{
  contextVersion:state?.contextVersion??null,
  activeProduct:state?.activeProduct??null,
  queryTarget:state?.queryTarget??null,
  selectedProduct:state?.selectedProduct??null,
  recommendedProduct:state?.recommendedProduct??null,
  comparisonProducts:state?.comparisonProducts??[],
  useCase:state?.useCase??null,
  problem:state?.problem??null,
  priorities:state?.priorities??[],
  budget:state?.budget??null,
  objection:state?.objection??null,
  interestSignal:state?.interestSignal??false,
  purchaseSignal:state?.purchaseSignal??false,
  commercialStage:state?.commercialStage??null,
  commercialStrategy:state?.commercialStrategy??null,
  lastIntent:state?.lastIntent??null,
  lastRoute:state?.lastRoute??null,
  lastNba:state?.lastNba??null,
};}

const result=await runLiveQa({scenarios:fullRag50Scenarios,outputDir:'qa-results/full-rag50'});
const relevantTurns:any[]=[];
for(const scenario of result.report.scenarios){
  for(const turn of scenario.turns){
    const debug=turn?.observation?.response?.debug??{};
    const state=turn?.observation?.response?.state??{};
    const sources=Array.isArray(debug.ragSources)?debug.ragSources:Array.isArray(state.ragSources)?state.ragSources:[];
    const vectorProduct=sources.some((s:string)=>s.startsWith('SUPABASE_VECTOR_DOCUMENTS:'));
    const vectorInstitutional=sources.some((s:string)=>s.startsWith('SUPABASE_VECTOR_INSTITUCIONAL:'));
    const lexicalFallback=sources.some((s:string)=>s.includes('LEXICAL_FALLBACK'));
    const requiresRag=Boolean(debug.requiresRag??state.requiresRag??sources.length);
    if(!requiresRag&&!sources.length)continue;
    relevantTurns.push({scenarioId:scenario.id,sessionId:scenario.sessionId,turn:turn.turn,message:turn.message,route:debug.route??state.lastRoute??null,sources,vectorProduct,vectorInstitutional,lexicalFallback,answer:turn?.observation?.response?.answer??null});
  }
}
const summary={runId:result.report.runId,scenarios:result.report.scenarios.length,customerTurns:FULL_RAG_50_TURN_COUNT,relevantTurns:relevantTurns.length,vectorProduct:relevantTurns.filter(x=>x.vectorProduct).length,vectorInstitutional:relevantTurns.filter(x=>x.vectorInstitutional).length,lexicalFallback:relevantTurns.filter(x=>x.lexicalFallback).length,missingSource:relevantTurns.filter(x=>!x.sources.length).length,turns:relevantTurns};

const functionalScenarios=result.report.scenarios.map(scenario=>{
  const turns=scenario.turns.map(turn=>{
    const findings=turn.findings.filter(f=>f.code!=='AUTOMATION_DELIVERY_FAILED').map(f=>({...f}));
    const pressure=fabricatedPressure(String(turn?.observation?.response?.answer??''));
    if(pressure)findings.push({level:'RED',code:pressure,message:'La respuesta introdujo presión comercial no sustentada.'});
    const status=findings.some(f=>f.level==='RED')?'RED':findings.some(f=>f.level==='YELLOW')?'YELLOW':'GREEN';
    return{turn:turn.turn,message:turn.message,status,findings,answer:turn?.observation?.response?.answer??null,state:compactContext(turn?.observation?.response?.state??{})};
  });
  const status=turns.some(t=>t.status==='RED')?'RED':turns.some(t=>t.status==='YELLOW')?'YELLOW':'GREEN';
  return{id:scenario.id,title:scenario.title,sessionId:scenario.sessionId,status,turns};
});
const functional={runId:result.report.runId,note:'FULL RAG 50 multi-turn conversational gate. GitHub Actions is not part of this gate. AUTOMATION_DELIVERY_FAILED is excluded because n8n delivery is outside this conversational test.',summary:{scenarios:functionalScenarios.length,customerTurns:FULL_RAG_50_TURN_COUNT,green:functionalScenarios.filter(x=>x.status==='GREEN').length,yellow:functionalScenarios.filter(x=>x.status==='YELLOW').length,red:functionalScenarios.filter(x=>x.status==='RED').length},scenarios:functionalScenarios};

const baseUrl=(process.env.QA_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
const persistenceMode=String(result.report.modes?.persistence??'unknown').toLowerCase();
const persistenceScenarios:any[]=[];
for(const scenario of result.report.scenarios){
  let snapshot:any=null;let error:string|null=null;
  try{
    const response=await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(scenario.sessionId)}`);
    if(!response.ok)error=`HTTP ${response.status}: ${await response.text()}`;
    else snapshot=await response.json();
  }catch(e){error=e instanceof Error?e.message:String(e);}
  const messages=Array.isArray(snapshot?.messages)?snapshot.messages:[];
  const users=messages.filter((m:any)=>m?.role==='user');
  const assistants=messages.filter((m:any)=>m?.role==='assistant');
  const expectedTurns=scenario.turns.length;
  const contextVersion=Number(snapshot?.state?.contextVersion??NaN);
  const userSequence=scenario.turns.every((turn,index)=>String(users[index]?.content??'')===String(turn.message));
  const assistantSequence=scenario.turns.every((turn,index)=>String(assistants[index]?.content??'')===String(turn?.observation?.response?.answer??''));
  const checks={
    sessionRead:error==null&&Boolean(snapshot),
    fiveTurnContext:Number.isFinite(contextVersion)&&contextVersion===expectedTurns,
    userRows:users.length===expectedTurns,
    assistantRows:assistants.length===expectedTurns,
    totalMessages:messages.length===expectedTurns*2,
    userSequence,
    assistantSequence,
  };
  const status=Object.values(checks).every(Boolean)?'GREEN':'RED';
  persistenceScenarios.push({id:scenario.id,sessionId:scenario.sessionId,status,error,expectedTurns,contextVersion,messageCount:messages.length,userRows:users.length,assistantRows:assistants.length,checks,finalContext:compactContext(snapshot?.state??{})});
}
const persistenceStatus=persistenceMode==='supabase'&&persistenceScenarios.every(x=>x.status==='GREEN')?'GREEN':'RED';
const persistence={
  runId:result.report.runId,
  persistenceMode,
  status:persistenceStatus,
  source:persistenceMode==='supabase'?'/api/sessions/:id -> SupabaseConversationRepository.getState/getMessages -> ia_contexto + ia_conversaciones':'NOT_SUPABASE: this run does not certify ia_contexto/ia_conversaciones',
  expectedPerScenario:{customerTurns:5,iaConversacionesRows:5,sessionMessages:10,finalContextVersion:5},
  summary:{green:persistenceScenarios.filter(x=>x.status==='GREEN').length,red:persistenceScenarios.filter(x=>x.status==='RED').length},
  scenarios:persistenceScenarios,
};

const latest=resolve('qa-results/full-rag50/latest');
await mkdir(latest,{recursive:true});
await writeFile(resolve(latest,'full-rag50-retrieval-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
await writeFile(resolve(latest,'full-rag50-functional-summary.json'),`${JSON.stringify(functional,null,2)}\n`,'utf8');
await writeFile(resolve(latest,'full-rag50-persistence-summary.json'),`${JSON.stringify(persistence,null,2)}\n`,'utf8');
await writeFile(resolve(latest,'full-rag50-session-ids.txt'),`${persistenceScenarios.map(x=>`${x.id}\t${x.sessionId}`).join('\n')}\n`,'utf8');

console.log(`FULL RAG 50 turns=${FULL_RAG_50_TURN_COUNT} vector product=${summary.vectorProduct} institutional=${summary.vectorInstitutional} fallback=${summary.lexicalFallback} missing=${summary.missingSource}`);
console.log(`FULL RAG 50 FUNCTIONAL GREEN=${functional.summary.green} YELLOW=${functional.summary.yellow} RED=${functional.summary.red}`);
console.log(`FULL RAG 50 PERSISTENCE mode=${persistenceMode} GREEN=${persistence.summary.green} RED=${persistence.summary.red} gate=${persistence.status}`);
console.table(persistenceScenarios.map(x=>({status:x.status,case:x.id,session:x.sessionId,contextVersion:x.contextVersion,messages:x.messageCount})));
console.log('FULL RAG 50 reports: qa-results/full-rag50/latest/full-rag50-retrieval-summary.json + full-rag50-functional-summary.json + full-rag50-persistence-summary.json + full-rag50-session-ids.txt');
process.exitCode=functional.summary.red>0||persistence.status==='RED'?1:0;

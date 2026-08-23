import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acceptance20Scenarios } from '../qa/scenarios/acceptance20.ts';
import { runLiveQa } from './qa-live.ts';

async function responseJson(response:Response):Promise<any>{
  const text=await response.text();
  if(!text)return{};
  try{return JSON.parse(text);}catch{return{error:text};}
}
function hasOwn(value:object,key:string):boolean{return Object.prototype.hasOwnProperty.call(value,key);}
function actualTurnState(turn:any){
  const state=turn?.observation?.response?.state??{};
  const debug=turn?.observation?.response?.debug??{};
  return{
    intent:debug.intent??state.lastIntent??null,
    queryTarget:debug.queryTarget??state.queryTarget??null,
    activeProduct:debug.activeProduct??state.activeProduct??null,
    recommendedProduct:debug.recommendedProduct??state.recommendedProduct??null,
    explicitSwitch:Boolean(debug.explicitSwitch??state.explicitSwitch),
    budget:debug.budget??state.budget??null,
  };
}
function compareExpected(expected:any,actual:any){
  const fields=['intent','queryTarget','activeProduct','recommendedProduct','explicitSwitch','budget'];
  return fields
    .filter(field=>hasOwn(expected??{},field))
    .map(field=>({field,expected:expected[field],actual:actual[field],pass:actual[field]===expected[field]}));
}

const baseUrl=(process.env.QA_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
const result=await runLiveQa({
  scenarios:acceptance20Scenarios,
  outputDir:'qa-results/acceptance20',
});

// Captura final persistida por conversación para contrastar el LIVE con
// ia_contexto + historial expuesto por /api/sessions. No altera Supabase.
const persistedSessions=[];
for(const scenario of result.report.scenarios){
  try{
    const response=await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(scenario.sessionId)}`);
    persistedSessions.push({
      scenarioId:scenario.id,
      sessionId:scenario.sessionId,
      httpStatus:response.status,
      persisted:response.ok?await responseJson(response):null,
    });
  }catch(error){
    persistedSessions.push({
      scenarioId:scenario.id,
      sessionId:scenario.sessionId,
      httpStatus:0,
      error:error instanceof Error?error.message:String(error),
      persisted:null,
    });
  }
}

// Score específico del contrato A20. El QA genérico usa Oracle para algunas
// dimensiones; A20 usa expected state por turno, por eso lo medimos aquí para
// evitar falsos 0/0 y distinguir respuesta de estado persistido.
let checksPass=0;let checksTotal=0;
const contractScenarios=result.report.scenarios.map(reportScenario=>{
  const spec=acceptance20Scenarios.find(item=>item.id===reportScenario.id);
  const turns=reportScenario.turns.map((turn,index)=>{
    const expected=spec?.turns[index]?.expected??{};
    const actual=actualTurnState(turn);
    const checks=compareExpected(expected,actual);
    checksTotal+=checks.length;checksPass+=checks.filter(check=>check.pass).length;
    return{turn:index+1,message:turn.message,expected,actual,checks,pass:checks.every(check=>check.pass)};
  });
  const persisted=persistedSessions.find(item=>item.scenarioId===reportScenario.id);
  return{
    scenarioId:reportScenario.id,
    sessionId:reportScenario.sessionId,
    turnChecks:turns,
    expectedChecks:{pass:turns.flatMap(turn=>turn.checks).filter(check=>check.pass).length,total:turns.flatMap(turn=>turn.checks).length},
    persistence:{available:Boolean(persisted?.persisted?.state),httpStatus:persisted?.httpStatus??0,finalState:persisted?.persisted?.state??null},
  };
});
const persistenceAvailable=persistedSessions.filter(item=>Boolean(item.persisted?.state)).length;
const contractSummary={
  runId:result.report.runId,
  scenarios:contractScenarios.length,
  expectedBackendChecks:{pass:checksPass,total:checksTotal},
  persistenceAvailable:{pass:persistenceAvailable,total:persistedSessions.length},
  scenariosDetail:contractScenarios,
};

const latestDir=resolve('qa-results/acceptance20/latest');
await mkdir(latestDir,{recursive:true});
await writeFile(
  resolve(latestDir,'persisted-sessions.json'),
  `${JSON.stringify({runId:result.report.runId,sessions:persistedSessions},null,2)}\n`,
  'utf8',
);
await writeFile(
  resolve(latestDir,'acceptance-contract-summary.json'),
  `${JSON.stringify(contractSummary,null,2)}\n`,
  'utf8',
);

console.log('Acceptance20 contract: backend/docs/STECH_QA_ACCEPTANCE_20_BACKEND_SUPABASE.md');
console.log(`Expected backend checks=${checksPass}/${checksTotal}`);
console.log(`Persistence snapshots=${persistenceAvailable}/${persistedSessions.length}`);
console.log('Persisted snapshot: qa-results/acceptance20/latest/persisted-sessions.json');
console.log('Contract score: qa-results/acceptance20/latest/acceptance-contract-summary.json');
process.exitCode=result.exitCode;

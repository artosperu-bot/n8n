import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acceptance20Scenarios } from '../qa/scenarios/acceptance20.ts';
import { runLiveQa } from './qa-live.ts';

async function responseJson(response:Response):Promise<any>{
  const text=await response.text();
  if(!text)return{};
  try{return JSON.parse(text);}catch{return{error:text};}
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

const latestDir=resolve('qa-results/acceptance20/latest');
await mkdir(latestDir,{recursive:true});
await writeFile(
  resolve(latestDir,'persisted-sessions.json'),
  `${JSON.stringify({runId:result.report.runId,sessions:persistedSessions},null,2)}\n`,
  'utf8',
);

console.log('Acceptance20 contract: backend/docs/STECH_QA_ACCEPTANCE_20_BACKEND_SUPABASE.md');
console.log('Persisted snapshot: qa-results/acceptance20/latest/persisted-sessions.json');
process.exitCode=result.exitCode;

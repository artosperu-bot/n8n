import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fullRag20Scenarios } from '../qa/scenarios/fullRag20.ts';
import { runLiveQa } from './qa-live.ts';

const result=await runLiveQa({scenarios:fullRag20Scenarios,outputDir:'qa-results/full-rag20'});
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
const summary={runId:result.report.runId,scenarios:result.report.scenarios.length,relevantTurns:relevantTurns.length,vectorProduct:relevantTurns.filter(x=>x.vectorProduct).length,vectorInstitutional:relevantTurns.filter(x=>x.vectorInstitutional).length,lexicalFallback:relevantTurns.filter(x=>x.lexicalFallback).length,missingSource:relevantTurns.filter(x=>!x.sources.length).length,turns:relevantTurns};

const functionalScenarios=result.report.scenarios.map(scenario=>{
  const turns=scenario.turns.map(turn=>{
    const findings=turn.findings.filter(f=>f.code!=='AUTOMATION_DELIVERY_FAILED');
    const status=findings.some(f=>f.level==='RED')?'RED':findings.some(f=>f.level==='YELLOW')?'YELLOW':'GREEN';
    return{turn:turn.turn,message:turn.message,status,findings};
  });
  const status=turns.some(t=>t.status==='RED')?'RED':turns.some(t=>t.status==='YELLOW')?'YELLOW':'GREEN';
  return{id:scenario.id,title:scenario.title,status,turns};
});
const functional={runId:result.report.runId,note:'FULL RAG conversational gate; AUTOMATION_DELIVERY_FAILED is excluded because n8n delivery is outside this gate.',summary:{scenarios:functionalScenarios.length,green:functionalScenarios.filter(x=>x.status==='GREEN').length,yellow:functionalScenarios.filter(x=>x.status==='YELLOW').length,red:functionalScenarios.filter(x=>x.status==='RED').length},scenarios:functionalScenarios};

const latest=resolve('qa-results/full-rag20/latest');
await mkdir(latest,{recursive:true});
await writeFile(resolve(latest,'full-rag-retrieval-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
await writeFile(resolve(latest,'full-rag-functional-summary.json'),`${JSON.stringify(functional,null,2)}\n`,'utf8');
console.log(`FULL RAG vector product=${summary.vectorProduct} institutional=${summary.vectorInstitutional} fallback=${summary.lexicalFallback} missing=${summary.missingSource}`);
console.log(`FULL RAG FUNCTIONAL GREEN=${functional.summary.green} YELLOW=${functional.summary.yellow} RED=${functional.summary.red}`);
console.log('FULL RAG reports: qa-results/full-rag20/latest/full-rag-retrieval-summary.json + full-rag-functional-summary.json');
process.exitCode=functional.summary.red>0?1:0;

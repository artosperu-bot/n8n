import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreScenarios } from '../qa/scenarios/core.ts';
import { imageScenarios } from '../qa/scenarios/images.ts';
import { journeyScenarios } from '../qa/scenarios/journeys.ts';
import { golden100Scenarios } from '../qa/scenarios/golden100.ts';
import { createMessageId, createRunId, createSessionId } from '../qa/id.ts';
import { assessFabGrounding, assessNba, assessSpinUtility, evaluateCommercial } from '../qa/evaluators/commercial.ts';
import { evaluateHard } from '../qa/evaluators/hard.ts';
import { evaluateOracle, evaluatePersistence } from '../qa/evaluators/oracle.ts';
import { OracleResolver } from '../qa/oracle/OracleResolver.ts';
import { renderMarkdown, sanitizeSecrets } from '../qa/report/render.ts';
import { buildRuntime } from '../src/bootstrap.ts';
import type { ConversationState } from '../src/domain/types.ts';
import type { QaDimensionMetrics, QaFinding, QaLevel, QaReport, QaRootCause, QaScenario, QaScenarioResult, QaTurnObservation } from '../qa/types.ts';

export type QaSuite = 'journeys' | 'core' | 'all' | 'golden100';
type Logger = Pick<Console, 'log' | 'table' | 'error'>;
type RunOptions = { baseUrl?:string; scenarios?:QaScenario[]; suite?:QaSuite; fetcher?:typeof fetch; now?:Date; entropy?:string; writeArtifacts?:boolean; outputDir?:string; strict?:boolean; logger?:Logger; oracleResolver?:OracleResolver|null };

export function selectScenarios(suite: QaSuite): QaScenario[] {
  if (suite === 'core') return coreScenarios;
  if (suite === 'golden100') return golden100Scenarios;
  if (suite === 'all') return [...journeyScenarios, ...imageScenarios, ...coreScenarios];
  return [...journeyScenarios, ...imageScenarios];
}
export function parseQaSuite(argv = process.argv.slice(2)): QaSuite {
  const raw = argv.find(arg => arg.startsWith('--suite='))?.split('=')[1] ?? 'journeys';
  if (raw === 'journeys' || raw === 'core' || raw === 'all' || raw === 'golden100') return raw;
  throw new Error(`QA suite desconocida: ${raw}. Usa journeys, core, all o golden100.`);
}
function statusFromFindings(findings: QaFinding[]): QaLevel { if(findings.some(f=>f.level==='RED'))return'RED';if(findings.some(f=>f.level==='YELLOW'))return'YELLOW';return'GREEN'; }
function maxStatus(statuses: QaLevel[]): QaLevel { if(statuses.includes('RED'))return'RED';if(statuses.includes('YELLOW'))return'YELLOW';return'GREEN'; }
function average(values:number[]):number{return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;}
function conversationReport(report:QaReport):string {
  const lines=[`STECH LIVE QA ${report.runId}`,`GREEN=${report.summary.green} YELLOW=${report.summary.yellow} RED=${report.summary.red}`];
  for(const scenario of report.scenarios){
    lines.push('',`${scenario.status} ${scenario.id} — ${scenario.title}`);
    for(const turn of scenario.turns){
      lines.push(`T${String(turn.turn).padStart(2,'0')} CLIENTE: ${turn.message}`);
      lines.push(`T${String(turn.turn).padStart(2,'0')} STECH: ${String(turn.observation.response?.answer??turn.observation.response?.error??'SIN_RESPUESTA')}`);
      for(const finding of turn.findings)lines.push(`  ${finding.level} ${finding.code}: ${finding.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
async function responseJson(response:Response):Promise<any>{const text=await response.text();if(!text)return{};try{return JSON.parse(text);}catch{return{error:text};}}
function llmSteps(turn:QaScenarioResult['turns'][number]):any[]{const debug=turn.observation.response?.debug??{};return[debug.planner,debug.llm].filter(Boolean);}
function inferRootCause(f:QaFinding):QaRootCause|null{
  if(f.rootCause)return f.rootCause;
  if(/INTENT/.test(f.code))return'SEMANTIC';
  if(/QUERY_TARGET|PRODUCT|SWITCH/.test(f.code))return'REFERENCE';
  if(/STATE|BUDGET|CONTEXT/.test(f.code))return'STATE';
  if(/PRICE|STOCK|IMAGE/.test(f.code))return'SQL';
  if(/NBA/.test(f.code))return'NBA';
  if(/HANDOFF|PURCHASE/.test(f.code))return'HANDOFF';
  if(/PERSIST|HTTP_ERROR/.test(f.code))return'PERSISTENCE';
  return null;
}
function dimension(pass:boolean,metric:{pass:number;total:number}){metric.total+=1;if(pass)metric.pass+=1;}
function buildDimensions(results:QaScenarioResult[]):{dimensions:QaDimensionMetrics;rootCauses:Partial<Record<QaRootCause,number>>}{
  const dimensions:QaDimensionMetrics={productIdentity:{pass:0,total:0},referenceAccuracy:{pass:0,total:0},factualAccuracy:{pass:0,total:0},noFabrication:{pass:0,total:0},memoryConsistency:{pass:0,total:0},questionResolved:{pass:0,total:0},nbaQuality:{pass:0,total:0},nbaDecisionQuality:{pass:0,total:0},nbaDeliveryQuality:{pass:0,total:0},nbaActionabilityQuality:{pass:0,total:0},commercialProgression:{pass:0,total:0},spinUtilityQuality:{pass:0,total:0},fabGroundingQuality:{pass:0,total:0},purchaseProgression:{pass:0,total:0},persistence:{pass:0,total:0}};
  const rootCauses:Partial<Record<QaRootCause,number>>={};
  for(const turn of results.flatMap(s=>s.turns)){
    const red=turn.findings.filter(f=>f.level==='RED');
    const roots=new Set(red.map(inferRootCause).filter((x):x is QaRootCause=>Boolean(x)));
    for(const root of roots)rootCauses[root]=(rootCauses[root]??0)+1;
    const card=turn.oracle;
    if(card?.expectedProductName)dimension(!roots.has('REFERENCE'),dimensions.productIdentity);
    if(card?.expectedReferenceBehavior)dimension(!roots.has('REFERENCE')&&!roots.has('STATE'),dimensions.referenceAccuracy);
    if(card&&['SQL','PRODUCT_RAG','INSTITUTIONAL_RAG'].includes(card.authoritativeDomain)&&card.allowedFacts.length)dimension(!roots.has('SQL')&&!roots.has('PRODUCT_RAG')&&!roots.has('INSTITUTIONAL_RAG'),dimensions.factualAccuracy);
    dimension(!turn.findings.some(f=>/UNSUPPORTED|UNSOLICITED_PRICE|STOCK_COUNT_LEAK|UNVERIFIED|IMAGE_URL_MISMATCH/.test(f.code)),dimensions.noFabrication);
    dimension(!roots.has('STATE')&&!roots.has('PERSISTENCE'),dimensions.memoryConsistency);
    dimension(Boolean(String(turn.observation.response?.answer??'').trim())&&!turn.findings.some(f=>f.code==='HTTP_ERROR'),dimensions.questionResolved);
    const nba=turn.nbaEvaluation??assessNba(turn.observation);
    dimension(nba.decisionPass&&nba.deliveryPass&&nba.actionabilityPass,dimensions.nbaQuality);
    dimension(nba.decisionPass,dimensions.nbaDecisionQuality);
    dimension(nba.deliveryPass,dimensions.nbaDeliveryQuality);
    dimension(nba.actionabilityPass,dimensions.nbaActionabilityQuality);
    dimension(nba.progressionPass,dimensions.commercialProgression);
    dimension(assessSpinUtility(turn.observation),dimensions.spinUtilityQuality);
    dimension(assessFabGrounding(turn.observation),dimensions.fabGroundingQuality);
    if(card?.requiresHandoff)dimension(turn.observation.response?.state?.handoffActive===true&&!roots.has('HANDOFF'),dimensions.purchaseProgression);
    if(card)dimension(!roots.has('PERSISTENCE'),dimensions.persistence);
  }
  return{dimensions,rootCauses};
}

export async function runLiveQa(options: RunOptions = {}): Promise<{ report: QaReport; exitCode: number }> {
  const baseUrl=(options.baseUrl??process.env.QA_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
  const suite=options.suite??parseQaSuite();
  const scenarios=options.scenarios??selectScenarios(suite);
  const fetcher=options.fetcher??fetch;const now=options.now??new Date();const runId=createRunId(now,options.entropy);const logger=options.logger??console;
  const strict=options.strict??['1','true','yes','on'].includes(String(process.env.QA_STRICT??'').toLowerCase());
  const writeArtifacts=options.writeArtifacts!==false;const outputDir=resolve(options.outputDir??'qa-results');const latestDir=resolve(outputDir,'latest');
  if(writeArtifacts){await rm(latestDir,{recursive:true,force:true});await mkdir(latestDir,{recursive:true});await writeFile(resolve(latestDir,'trace.jsonl'),'','utf8');}
  let healthResponse:Response;try{healthResponse=await fetcher(`${baseUrl}/health`);}catch(error){throw new Error(`QA health check failed: ${error instanceof Error?error.message:String(error)}`);}
  const health=await responseJson(healthResponse);if(!healthResponse.ok||health.status!=='ok')throw new Error(`QA health check failed HTTP ${healthResponse.status}: ${health.error??'backend no saludable'}`);

  const needsOracle=scenarios.some(s=>s.turns.some(t=>Boolean(t.oracleSpec)));
  let oracleResolver=options.oracleResolver??null;
  if(needsOracle&&!oracleResolver){const runtime=buildRuntime(process.env);oracleResolver=new OracleResolver({erp:runtime.erp,rag:runtime.rag});}

  const scenarioResults:QaScenarioResult[]=[];
  for(const scenario of scenarios){
    const sessionId=createSessionId(runId,scenario.id);const turnResults:QaScenarioResult['turns']=[];
    let oracleState:ConversationState={sessionId:`oracle:${sessionId}`,turnCount:0,comparisonProducts:[],spinFacts:[],priorities:[]};
    let previousPersistedVersion:number|null=null;
    for(let index=0;index<scenario.turns.length;index+=1){
      const turn=scenario.turns[index];const messageId=createMessageId(runId,scenario.id,index+1);const request={sessionId,messageId,message:turn.message};
      let oracle=null;const preFindings:QaFinding[]=[];
      if(turn.oracleSpec){
        if(!oracleResolver)preFindings.push({level:'RED',code:'ORACLE_UNAVAILABLE',message:'El turno requiere Oracle pero no hay resolver configurado.',rootCause:'PERSISTENCE'});
        else try{oracle=await oracleResolver.resolve({message:turn.message,spec:turn.oracleSpec,state:oracleState});}
        catch(error){preFindings.push({level:'RED',code:'ORACLE_BUILD_FAILED',message:error instanceof Error?error.message:String(error),rootCause:turn.oracleSpec.domain==='PRODUCT_RAG'?'PRODUCT_RAG':turn.oracleSpec.domain==='INSTITUTIONAL_RAG'?'INSTITUTIONAL_RAG':turn.oracleSpec.domain==='SQL'?'SQL':'STATE'});}
      }

      const started=performance.now();let observation:QaTurnObservation;
      try{
        const response=await fetcher(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});const payload=await responseJson(response);
        let persisted:null|any=null;
        if(response.ok&&turn.oracleSpec){try{const pr=await fetcher(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`);if(pr.ok)persisted=await responseJson(pr);}catch{persisted=null;}}
        observation={httpStatus:response.status,ok:response.ok,request,response:payload,persisted,roundTripMs:Math.max(0,Math.round(performance.now()-started))};
      }catch(error){observation={httpStatus:0,ok:false,request,response:{error:error instanceof Error?error.message:String(error)},persisted:null,roundTripMs:Math.max(0,Math.round(performance.now()-started))};}

      const findings=[...preFindings,...evaluateHard(turn,observation),...(oracle?evaluateOracle(oracle,observation):[]),...(turn.oracleSpec?evaluatePersistence(observation,previousPersistedVersion):[]),...evaluateCommercial(observation)];
      const status=statusFromFindings(findings);turnResults.push({turn:index+1,message:turn.message,status,observation,findings,oracle,nbaEvaluation:assessNba(observation)});
      if(observation.persisted?.state?.contextVersion!=null){const v=Number(observation.persisted.state.contextVersion);if(Number.isFinite(v))previousPersistedVersion=v;}
      if(oracle)oracleState={...oracleState,...oracle.expectedStateDelta,turnCount:(oracleState.turnCount??0)+1};
      // A failed turn is evidence, not a reason to hide the rest of the journey.
      // Keep the last durable persisted version and continue with deterministic message ids.
    }
    scenarioResults.push({id:scenario.id,family:scenario.family,title:scenario.title,sessionId,status:maxStatus(turnResults.map(t=>t.status)),turns:turnResults});
  }
  const allTurns=scenarioResults.flatMap(s=>s.turns);const scenarioStatuses=scenarioResults.map(s=>s.status);const allLlmSteps=allTurns.flatMap(llmSteps);
  const usage=allLlmSteps.reduce((acc,llm)=>{acc.inputTokens+=Number(llm.inputTokens??0);acc.outputTokens+=Number(llm.outputTokens??0);acc.totalTokens+=Number(llm.totalTokens??0);acc.cachedInputTokens+=Number(llm.cachedInputTokens??0);return acc;},{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0});
  const scored=buildDimensions(scenarioResults);
  const report:QaReport={runId,startedAt:now.toISOString(),finishedAt:new Date().toISOString(),modes:health.modes??{},summary:{scenarios:scenarioResults.length,turns:allTurns.length,green:scenarioStatuses.filter(s=>s==='GREEN').length,yellow:scenarioStatuses.filter(s=>s==='YELLOW').length,red:scenarioStatuses.filter(s=>s==='RED').length},usage,latency:{averageRoundTripMs:average(allTurns.map(t=>t.observation.roundTripMs)),averageLlmMs:average(allLlmSteps.map(x=>Number(x.durationMs)).filter(Number.isFinite))},dimensions:scored.dimensions,rootCauses:scored.rootCauses,scenarios:scenarioResults};
  const safeReport=sanitizeSecrets(report);if(writeArtifacts){
    await mkdir(outputDir,{recursive:true});
    const failures=safeReport.scenarios.flatMap(scenario=>scenario.turns.filter(turn=>turn.findings.length).map(turn=>({scenarioId:scenario.id,sessionId:scenario.sessionId,turn:turn.turn,status:turn.status,findings:turn.findings})));
    const summary={runId:safeReport.runId,startedAt:safeReport.startedAt,finishedAt:safeReport.finishedAt,modes:safeReport.modes,summary:safeReport.summary,usage:safeReport.usage,latency:safeReport.latency,dimensions:safeReport.dimensions,rootCauses:safeReport.rootCauses};
    await writeFile(resolve(outputDir,`${runId}.json`),`${JSON.stringify(safeReport,null,2)}\n`,'utf8');
    await writeFile(resolve(outputDir,`${runId}.md`),renderMarkdown(safeReport),'utf8');
    await writeFile(resolve(latestDir,'summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
    await writeFile(resolve(latestDir,'failures.json'),`${JSON.stringify(failures,null,2)}\n`,'utf8');
    await writeFile(resolve(latestDir,'conversation-report.txt'),conversationReport(safeReport),'utf8');
  }
  logger.log(`STECH Live QA ${runId}`);logger.table(scenarioResults.map(s=>({status:s.status,family:s.family,case:s.id,session:s.sessionId})));logger.log(`GREEN=${report.summary.green} YELLOW=${report.summary.yellow} RED=${report.summary.red} | turns=${report.summary.turns} tokens=${report.usage.totalTokens}`);
  if(report.dimensions){for(const [key,value] of Object.entries(report.dimensions))logger.log(`${key}=${value.pass}/${value.total}`);}
  return{report:safeReport,exitCode:strict&&report.summary.red>0?1:0};
}

const invokedPath=process.argv[1]?pathToFileURL(resolve(process.argv[1])).href:'';
if(import.meta.url===invokedPath){runLiveQa().then(({exitCode})=>{process.exitCode=exitCode;}).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}

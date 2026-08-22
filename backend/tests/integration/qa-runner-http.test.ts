import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLiveQa } from '../../scripts/qa-live.ts';

test('live runner uses HTTP boundary, deterministic ids and aggregates planner plus writer usage', async () => {
  const chats: any[] = [];
  const fetcher: typeof fetch = async (url, init: any = {}) => {
    const target = String(url);
    if (target.endsWith('/health')) {
      return Response.json({ status: 'ok', modes: { llm: 'openai', erp: 'sql-bridge', persistence: 'supabase', n8n: 'n8n' } });
    }
    if (target.endsWith('/api/chat')) {
      const body = JSON.parse(String(init.body));
      chats.push(body);
      return Response.json({
        sessionId: body.sessionId,
        answer: 'El Armor X13 cuesta S/ 899.',
        state: { sessionId: body.sessionId, turnCount: 1, activeProduct: 'Armor X13', queryTarget: 'Armor X13', explicitSwitch: false, lastIntent: 'PRICE', lastNba: 'OFFER_STOCK' },
        debug: {
          intent: 'PRICE', queryTarget: 'Armor X13', explicitSwitch: false, budget: null, priceObjection: false,
          erp: { product: 'Armor X13', price: 899, stock: 4, currency: 'PEN', source: 'SQL_BRIDGE' },
          planner: { model: 'gpt-live', inputTokens: 25, outputTokens: 5, totalTokens: 30, cachedInputTokens: 0, durationMs: 20 },
          llm: { model: 'gpt-live', inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 10, durationMs: 50 },
          totalDurationMs: 70,
          automation: { delivered: true },
        },
      });
    }
    throw new Error('unexpected request');
  };

  const { report, exitCode } = await runLiveQa({
    baseUrl: 'http://test',
    fetcher,
    now: new Date('2026-08-21T00:15:30Z'),
    entropy: 'a7f2',
    writeArtifacts: false,
    logger: { log() {}, table() {}, error() {} } as any,
    scenarios: [{
      id: 'PRICE-1', family: 'TRUTH', title: 'price',
      turns: [{ message: '¿Cuánto cuesta el Armor X13?', expected: { intent: 'PRICE', queryTarget: 'Armor X13', activeProduct: 'Armor X13', explicitSwitch: false } }],
    }],
  });

  assert.equal(exitCode, 0);
  assert.equal(report.runId, 'qa-20260821-001530-a7f2');
  assert.equal(report.summary.green, 1);
  assert.equal(report.summary.red, 0);
  assert.equal(report.usage.totalTokens, 150);
  assert.equal(report.usage.inputTokens, 125);
  assert.equal(report.latency.averageLlmMs, 35);
  assert.equal(chats[0].sessionId, 'qa-20260821-001530-a7f2-PRICE-1');
  assert.equal(chats[0].messageId, 'qa-20260821-001530-a7f2:PRICE-1:t01');
});

test('Golden runner records a failed turn but still executes the rest of the journey',async()=>{
  const chats:any[]=[];
  let chatCount=0;
  const fetcher:typeof fetch=async(url,init:any={})=>{
    const target=String(url);
    if(target.endsWith('/health'))return Response.json({status:'ok',modes:{llm:'openai',erp:'sql-bridge',persistence:'supabase',n8n:'n8n'}});
    if(target.endsWith('/api/chat')){
      const body=JSON.parse(String(init.body));chats.push(body);chatCount+=1;
      if(chatCount===1)return Response.json({error:'simulated turn failure'},{status:500});
      return Response.json({sessionId:body.sessionId,answer:'Listo.',state:{sessionId:body.sessionId,turnCount:1,lastIntent:'OTHER',lastNba:'ANSWER_ONLY'},debug:{intent:'OTHER',queryTarget:null,explicitSwitch:false,budget:null,priceObjection:false}});
    }
    throw new Error('unexpected request');
  };
  const {report}=await runLiveQa({
    baseUrl:'http://test',fetcher,now:new Date('2026-08-21T00:15:30Z'),entropy:'cont',writeArtifacts:false,
    logger:{log(){},table(){},error(){}} as any,
    scenarios:[{id:'CONTINUE',family:'TRUTH',title:'continue',turns:[{message:'turno 1'},{message:'turno 2'},{message:'turno 3'}]}],
  });
  assert.equal(chats.length,3,'un RED no debe ocultar los turnos posteriores del journey');
  assert.equal(report.scenarios[0]?.turns.length,3);
  assert.equal(report.summary.red,1);
});

test('artifact run recreates latest with summary, failures, trace and safe conversation report',async()=>{
  const outputDir=await mkdtemp(join(tmpdir(),'stech-qa-'));
  const latest=join(outputDir,'latest');
  await runLiveQa({
    baseUrl:'http://test',outputDir,logger:{log(){},table(){},error(){}} as any,
    fetcher:async(url,init:any={})=>String(url).endsWith('/health')
      ?Response.json({status:'ok',modes:{}})
      :Response.json({answer:'No pude responder.',state:{lastNba:'ANSWER_ONLY'},debug:{intent:'OTHER'}}),
    scenarios:[{id:'ARTIFACT',family:'RELIABILITY',title:'artifacts',turns:[{message:'consulta segura'}]}],
  });
  for(const file of ['summary.json','failures.json','trace.jsonl','conversation-report.txt']){
    assert.equal(typeof await readFile(join(latest,file),'utf8'),'string',file);
  }
  await writeFile(join(latest,'stale.txt'),'stale','utf8');
  await runLiveQa({
    baseUrl:'http://test',outputDir,logger:{log(){},table(){},error(){}} as any,
    fetcher:async(url)=>String(url).endsWith('/health')?Response.json({status:'ok',modes:{}}):Response.json({answer:'Listo.',state:{lastNba:'ANSWER_ONLY'},debug:{intent:'OTHER'}}),
    scenarios:[{id:'ARTIFACT-2',family:'RELIABILITY',title:'clean latest',turns:[{message:'otra consulta'}]}],
  });
  await assert.rejects(()=>readFile(join(latest,'stale.txt'),'utf8'));
});

test('QA report separates NBA decision, delivery and commercial progression',async()=>{
  const {report}=await runLiveQa({
    baseUrl:'http://test',writeArtifacts:false,logger:{log(){},table(){},error(){}} as any,
    fetcher:async(url)=>String(url).endsWith('/health')
      ?Response.json({status:'ok',modes:{}})
      :Response.json({answer:'Sí, está disponible.',state:{lastNba:'SOFT_CLOSE',interestSignal:true,purchaseSignal:false,activeProduct:'Armor X13',commercialStage:'CONSIDERACION'},debug:{intent:'STOCK'}}),
    scenarios:[{id:'N1',family:'CLOSING',title:'visible N+1',turns:[{message:'si está disponible me interesa'}]}],
  });
  assert.deepEqual(report.dimensions?.nbaDecisionQuality,{pass:1,total:1});
  assert.deepEqual(report.dimensions?.nbaDeliveryQuality,{pass:0,total:1});
  assert.deepEqual(report.dimensions?.nbaActionabilityQuality,{pass:1,total:1});
  assert.deepEqual(report.dimensions?.commercialProgression,{pass:0,total:1});
  assert.deepEqual((report.scenarios[0].turns[0] as any).nbaEvaluation,{
    n1Required:true,n1Delivered:false,n1Reason:'INTEREST_REQUIRES_PROGRESSION',decisionPass:true,deliveryPass:false,actionabilityPass:true,progressionPass:false,
  });
});

test('QA actionability is RED when ANSWER_ONLY invents a demo operation',async()=>{
  const {report}=await runLiveQa({
    baseUrl:'http://test',writeArtifacts:false,logger:{log(){},table(){},error(){}} as any,
    fetcher:async(url)=>String(url).endsWith('/health')
      ?Response.json({status:'ok',modes:{}})
      :Response.json({answer:'Puedo agendar la prueba; yo coordino y te confirmo luego.',state:{lastNba:'ANSWER_ONLY'},debug:{intent:'OTHER'}}),
    scenarios:[{id:'ACTION',family:'COMMERCIAL',title:'actionability',turns:[{message:'¿Pueden agendarme una prueba?'}]}],
  });
  assert.deepEqual(report.dimensions?.nbaActionabilityQuality,{pass:0,total:1});
  assert.equal(report.scenarios[0].turns[0].status,'RED');
  assert.ok(report.scenarios[0].turns[0].findings.some(x=>x.code==='UNSUPPORTED_COMMERCIAL_ACTION'));
});

test('QA exposes SPIN utility and FAB grounding as independent quality dimensions',async()=>{
  let turn=0;
  const {report}=await runLiveQa({
    baseUrl:'http://test',writeArtifacts:false,logger:{log(){},table(){},error(){}} as any,
    fetcher:async(url)=>{
      if(String(url).endsWith('/health'))return Response.json({status:'ok',modes:{}});
      turn+=1;
      return turn===1
        ?Response.json({answer:'¿Cuál es tu presupuesto?',state:{lastNba:'ASK_MISSING_FACT',pendingMissingFact:'presupuesto máximo',budget:1200},debug:{intent:'EVALUATE_USE'}})
        :Response.json({answer:'Tiene RAM.',state:{lastNba:'ANSWER_ONLY',currentAttributes:['RAM']},debug:{intent:'CAPABILITY',ragCount:1,route:'RAG_PRODUCT'}});
    },
    scenarios:[{id:'SPIN-FAB',family:'COMMERCIAL',title:'quality dimensions',turns:[{message:'Máximo 1200'},{message:'¿Cuánta RAM tiene?'}]}],
  });
  assert.deepEqual(report.dimensions?.spinUtilityQuality,{pass:1,total:2});
  assert.deepEqual(report.dimensions?.fabGroundingQuality,{pass:1,total:2});
});

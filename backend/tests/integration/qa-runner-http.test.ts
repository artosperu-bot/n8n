import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(report.results[0]?.turns.length,3);
  assert.equal(report.summary.red,1);
});

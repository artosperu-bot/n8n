import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';
import { SupabaseConversationRepository } from '../../src/adapters/supabase/SupabaseConversationRepository.ts';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import type { TurnDecision } from '../../src/ports/LlmProvider.ts';

const baseDecision: TurnDecision = {
  primaryIntent: 'OTHER', secondaryIntents: [], targetProduct: null, mentionedProducts: [],
  referenceType: null, explicitSwitch: false, selectedProduct: null, comparisonProducts: [],
  attributes: [], customerNeed: null, customerProblem: null, priorities: [], objection: null,
  commercialStage: null, spinContribution: null, nextBestAction: null,
  needsSql: false, needsProductRag: false, needsInstitutionalRag: false, confidence: 0.8,
};

test('invalid GPT control vocabulary falls back to canonical intent and bounded N+1 codes', () => {
  const raw: TurnDecision = {
    ...baseDecision,
    primaryIntent: 'precio_query',
    nextBestAction: 'Preguntar versión, luego consultar precio y quizá disponibilidad.',
  };
  const fallback: TurnDecision = {
    ...baseDecision,
    primaryIntent: 'PRICE',
    nextBestAction: 'ADVANCE_IF_INTEREST',
    needsSql: true,
  };
  const validated = validateTurnDecision(raw, { activeProduct: 'Armor X13' }, ['Armor X13'], fallback);
  assert.equal(validated.primaryIntent, 'PRICE');
  assert.equal(validated.nextBestAction, 'SOFT_CLOSE');
});

test('structured GPT fields reject objects instead of persisting [object Object]', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    status: 'completed', model: 'gpt-5-mini-2025-08-07',
    output_text: JSON.stringify({
      ...baseDecision,
      primaryIntent: 'EVALUATE_USE',
      spinContribution: { fase: 'S', aporte: 'trabajo en construcción' },
      priorities: [{ tipo: 'resistencia' }],
    }),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
  const provider = new OpenAIProvider({ apiKey: 'TEST_ONLY', model: 'gpt-5-mini-2025-08-07', fetcher });
  const result = await provider.decide!({ message: 'Trabajo en construcción', state: {} });
  assert.equal(result.decision.spinContribution, null);
  assert.deepEqual(result.decision.priorities, []);
  assert.equal(JSON.stringify(result.decision).includes('[object Object]'), false);
});

test('Supabase repository exposes atomic turn persistence instead of split context then PATCH', () => {
  const repo = new SupabaseConversationRepository({ url: 'https://example.supabase.co', key: 'TEST_ONLY', fetcher: (async () => Response.json({})) as typeof fetch });
  assert.equal(typeof (repo as any).beginTurn, 'function');
  assert.equal(typeof (repo as any).completeTurn, 'function');
});

test('atomic persistence maps long SPIN facts to the canonical spin_aporte enum', async () => {
  let persistBody: any = null;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/ia_sesiones')) return Response.json([]);
    if (url.includes('/rpc/ia_adquirir_turno')) return Response.json({ ok:true, acquired:true, reason:'ACQUIRED' });
    if (url.includes('/rpc/ia_persistir_turno_atomico')) {
      persistBody = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ ok:true, status:'SAVED', conversation_id:'00000000-0000-0000-0000-000000000001', context_version:1 });
    }
    if (url.includes('/rpc/ia_liberar_turno')) return Response.json({ ok:true, released:true, reason:'OK' });
    return Response.json({});
  };
  const repo = new SupabaseConversationRepository({ url:'https://example.supabase.co', key:'TEST_ONLY', fetcher });
  await repo.beginTurn('s-spin','m-spin','m-spin');
  await repo.completeTurn('s-spin','Trabajo en construcción','Respuesta',{
    sessionId:'s-spin', contextVersion:0, turnCount:1,
    lastIntent:'RECOMMEND', lastRoute:'RAG_PRODUCT', lastNba:'ASK_BUDGET',
    spinFacts:['situacion:trabajo_en_construccion','problema:caidas_frecuentes','necesidad:resistencia_y_bateria'],
    priorities:['resistencia','bateria'], comparisonProducts:[],
  } as any,{ model:'gpt-5-mini-2025-08-07' });
  const value = String(persistBody?.p_conversacion?.spin_aporte ?? '');
  assert.equal(value,'NECESIDAD_SOLUCION');
  assert.ok(value.length <= 30);
});

test('atomic persistence includes compact decision trace inside commercial snapshot without schema changes', async () => {
  let persistBody:any=null;
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/rest/v1/ia_sesiones'))return Response.json([]);
    if(url.includes('/rpc/ia_adquirir_turno'))return Response.json({ok:true,acquired:true,reason:'ACQUIRED'});
    if(url.includes('/rpc/ia_persistir_turno_atomico')){persistBody=JSON.parse(String(init?.body??'{}'));return Response.json({ok:true,status:'SAVED',context_version:1});}
    if(url.includes('/rpc/ia_liberar_turno'))return Response.json({ok:true,released:true,reason:'OK'});
    return Response.json({});
  };
  const repo=new SupabaseConversationRepository({url:'https://example.supabase.co',key:'TEST_ONLY',fetcher});
  const trace:any={deterministicIntent:'CAPABILITY',plannerIntent:'CAPABILITY',finalIntent:'RECOMMEND',route:'RAG_RECOMMENDATION',nextBestAction:'RECOMMEND',recommendation:{eligibleCandidates:[{product:'Armor 22'}],winner:'Armor 22',sectionsRequested:['CAMARA','RESISTENCIA'],rankedCandidates:[{product:'Armor 22',score:1}]}};
  await repo.beginTurn('s-trace','m-trace','m-trace');
  await repo.completeTurn('s-trace','quiero uno para fotos','Armor 22',{
    sessionId:'s-trace',contextVersion:0,turnCount:1,lastIntent:'RECOMMEND',lastRoute:'RAG_RECOMMENDATION',lastNba:'RECOMMEND',recommendedProduct:'Armor 22',comparisonProducts:[],priorities:['camara'],spinFacts:[],lastDecisionTrace:trace,
  } as any,{model:'gpt-test'});
  assert.deepEqual(persistBody?.p_conversacion?.contexto_comercial_snapshot?.debug_trace,trace);
  assert.deepEqual(persistBody?.p_contexto?.contexto?.debug_trace,trace);
});

test('hybrid engine marks acquired turn failed when processing throws before persistence', async () => {
  let failCalled = false;
  const conversations: any = {
    async beginTurn() {},
    async completeTurn() { throw new Error('forced persistence failure'); },
    async failTurn() { failCalled = true; },
    async getState() { return { turnCount:0, comparisonProducts:[], spinFacts:[], priorities:[] }; },
    async saveState() {},
    async appendMessage() {},
    async getMessages() { return []; },
    async reset() {},
  };
  const engine = new HybridConversationEngine({
    conversations,
    telemetry:new NoopTelemetryRepository(),
    erp:new FakeErpRepository(),
    rag:new FakeRagRepository(),
    llm:new FakeLlmProvider(),
    automation:new NoopAutomationBus(),
  });
  await assert.rejects(() => engine.processTurn({sessionId:'s-fail',message:'Hola',messageId:'m-fail'}), /forced persistence failure/);
  assert.equal(failCalled,true);
});

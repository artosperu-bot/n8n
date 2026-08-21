import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationEngine } from '../../src/conversation/ConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';

function build(repo = new MemoryConversationRepository(), events:any[] = []) {
  return {
    repo,
    engine:new ConversationEngine({
      conversations:repo,
      telemetry:new NoopTelemetryRepository(),
      erp:new FakeErpRepository(),
      rag:new FakeRagRepository(),
      llm:new FakeLlmProvider(),
      automation:{ async publish(event:any){ events.push(event); return {delivered:true}; } },
    }),
  };
}

test('purchase referent uses recent explicit selection and starts personal reservation instead of handoff', async()=>{
  const events:any[]=[];
  const {repo,engine}=build(new MemoryConversationRepository(),events);
  await repo.saveState('select-recent',{
    sessionId:'select-recent',turnCount:8,
    activeProduct:'Armor 22',salientProduct:'Armor 22',selectedProduct:'Armor 22',
    recommendedProduct:'Armor 25T Pro',comparisonProducts:['Armor X13','Armor 22'],
    spinFacts:[],priorities:['bateria'],
  });
  const r=await engine.processTurn({sessionId:'select-recent',message:'Entonces me quedo con ese.'});
  assert.equal(r.debug.queryTarget,'Armor 22');
  assert.equal(r.state.selectedProduct,'Armor 22');
  assert.equal(r.state.handoffActive,false);
  assert.equal(r.state.blockAutomaticReply,false);
  assert.equal(r.state.lastNba,'COLLECT_RESERVATION_DATA');
  assert.equal(r.state.reservationStage,'NEED_DOCUMENT');
  assert.match(r.answer,/Armor 22/);
  assert.match(r.answer,/DNI|Carn[eé] de Extranjer/i);
  assert.equal(events.at(-1)?.type,'conversation.turn.completed');
});

test('comparison pair survives a non-switch mention and resolves los dos without re-asking models',async()=>{
  const {engine}=build();
  const a=await engine.processTurn({sessionId:'pair',message:'Estoy viendo el Armor X13'});
  assert.equal(a.state.activeProduct,'Armor X13');
  const b=await engine.processTurn({sessionId:'pair',message:'También estoy viendo el Armor 22'});
  assert.deepEqual(b.state.comparisonProducts,['Armor X13','Armor 22']);
  assert.equal(b.state.activeProduct,'Armor X13');
  assert.equal(b.state.salientProduct,'Armor 22');
  const c=await engine.processTurn({sessionId:'pair',message:'¿Qué diferencia hay entre los dos?'});
  assert.equal(c.debug.intent,'COMPARE');
  assert.deepEqual(c.state.comparisonProducts,['Armor X13','Armor 22']);
  assert.doesNotMatch(c.answer,/qué dos modelos/i);
});

test('attribute preference does not switch active product',async()=>{
  const {repo,engine}=build();
  await repo.saveState('attribute-pref',{
    sessionId:'attribute-pref',turnCount:2,activeProduct:'Armor X13',salientProduct:'Armor X13',
    comparisonProducts:['Armor X13','Armor 22'],spinFacts:[],priorities:[],
  });
  const r=await engine.processTurn({sessionId:'attribute-pref',message:'Prefiero la batería del Armor 22.'});
  assert.equal(r.state.activeProduct,'Armor X13');
  assert.equal(r.debug.queryTarget,'Armor 22');
  assert.equal(r.debug.explicitSwitch,false);
});

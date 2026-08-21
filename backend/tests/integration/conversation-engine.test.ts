import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationEngine } from '../../src/conversation/ConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';

function engine() {
  return new ConversationEngine({ conversations:new MemoryConversationRepository(), telemetry:new NoopTelemetryRepository(), erp:new FakeErpRepository(), rag:new FakeRagRepository(), llm:new FakeLlmProvider(), automation:new NoopAutomationBus() });
}

test('multi-turn chat preserves product and answers price from ERP evidence', async () => {
  const e=engine();
  const a=await e.processTurn({sessionId:'s1',message:'Hola, estoy viendo el Armor 22'});
  assert.equal(a.state.activeProduct,'Armor 22');
  const b=await e.processTurn({sessionId:'s1',message:'¿Cuánto cuesta?'});
  assert.equal(b.debug.intent,'PRICE');
  assert.equal(b.debug.queryTarget,'Armor 22');
  assert.match(b.answer,/1199/);
  assert.equal(b.debug.llm, undefined);
});

test('stock never exposes raw inventory count', async()=>{
  const e=engine();
  const r=await e.processTurn({sessionId:'stock-safe',message:'¿Tienen stock del Armor X13?'});
  assert.equal(r.answer,'Sí, está disponible.');
  assert.doesNotMatch(r.answer,/\b4\b|unidad/i);
  assert.equal(r.debug.llm,undefined);
});

test('budget turn persists budget without creating price objection',async()=>{
  const r=await engine().processTurn({sessionId:'s2',message:'Podría gastar hasta S/ 1,500.'});
  assert.equal(r.state.budget,1500);assert.equal(r.debug.priceObjection,false);assert.equal(r.debug.intent,'BUDGET_CONSTRAINT');
});

test('direct budget-fit request recommends an in-budget product',async()=>{
  const e=engine();await e.processTurn({sessionId:'s3',message:'Tengo máximo S/ 1,500.'});
  const r=await e.processTurn({sessionId:'s3',message:'¿Cuál entra en mi presupuesto?'});
  assert.equal(r.debug.intent,'RECOMMEND_WITHIN_BUDGET');assert.equal(r.state.recommendedProduct,'Armor 22');assert.match(r.answer,/Armor 22/);
});

test('records LLM usage only on a turn that needs generation',async()=>{
  const metrics:any[]=[];
  const e=new ConversationEngine({conversations:new MemoryConversationRepository(),telemetry:{async recordLlmUsage(m:any){metrics.push(m);}},erp:new FakeErpRepository(),rag:new FakeRagRepository(),llm:new FakeLlmProvider(),automation:new NoopAutomationBus()});
  const r=await e.processTurn({sessionId:'qa-live-telemetry-case',message:'Trabajo en campo y necesito un equipo confiable',messageId:'qa-run-001:TEL-001:t01'});
  assert.equal(metrics.length,1);assert.equal(metrics[0].messageId,'qa-run-001:TEL-001:t01');assert.equal(r.debug.llm?.model,'fake-test-llm');
});

test('telemetry failure does not destroy a generated commercial turn',async()=>{
  const e=new ConversationEngine({conversations:new MemoryConversationRepository(),telemetry:{async recordLlmUsage(){throw new Error('metrics down');}},erp:new FakeErpRepository(),rag:new FakeRagRepository(),llm:new FakeLlmProvider(),automation:new NoopAutomationBus()});
  const r=await e.processTurn({sessionId:'s-telemetry-fail',message:'Trabajo en campo y necesito algo resistente'});
  assert.ok(r.answer.length>0);assert.equal(r.debug.telemetry?.delivered,false);assert.match(r.debug.telemetry?.error??'',/metrics down/);
});

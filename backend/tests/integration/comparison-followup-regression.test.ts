import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';
import type { RagEvidence } from '../../src/domain/types.ts';

function decision(primaryIntent:string,targetProduct:string|null,attributes:string[]=[]){return {
  primaryIntent,secondaryIntents:[],targetProduct,mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',
  explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes,customerNeed:null,customerProblem:null,
  priorities:[],objection:null,commercialStage:'EVALUACION',spinContribution:null,nextBestAction:'ANSWER_ONLY',
  needsSql:false,needsProductRag:true,needsInstitutionalRag:false,confidence:0.95,
};}

test('comparison pair followup retrieves the requested section for both products',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-pair',{
    activeProduct:'Armor X13',activeProductId:'P-ARMOR-X13',salientProduct:'Armor X13',
    comparisonProducts:['Armor X13','Armor 22'],lastIntent:'COMPARE',priorities:[],spinFacts:[],turnCount:2,
  });
  const calls:Array<{productId:string;sections:string[]}>=[];
  const rag={
    async search(){return[] as RagEvidence[];},
    async searchProduct(_query:string,productId:string,sections:string[]){
      calls.push({productId,sections});
      return [{text:`${productId} ${sections[0]} evidencia`,source:`TEST:${sections[0]}`,score:1,productId,section:sections[0],domain:'PRODUCT' as const}];
    },
  };
  let writeInput:LlmWriteInput|null=null;
  const llm:LlmProvider={
    async decide(){return {decision:decision('CAPABILITY','Armor X13',['BATERIA']),model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    async write(input){writeInput=input;return {text:'Comparación lista.',model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
  };
  const engine=new HybridConversationEngine({conversations,telemetry:new NoopTelemetryRepository(),erp:new FakeErpRepository(),rag,llm,automation:new NoopAutomationBus()});
  const result=await engine.processTurn({sessionId:'s-pair',message:'cual tiene mejor bateria?'});
  assert.equal(result.debug.intent,'COMPARE');
  assert.deepEqual(new Set(calls.map(x=>x.productId)),new Set(['P-ARMOR-X13','P-ARMOR-22-256G']));
  assert.ok(calls.every(x=>x.sections.includes('BATERIA')));
  assert.deepEqual(new Set((writeInput?.rag??[]).map(x=>x.productId)),new Set(['P-ARMOR-X13','P-ARMOR-22-256G']));
});

test('stale planner target cannot defeat deterministic el otro reference',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-other',{
    activeProduct:'Armor X13',activeProductId:'P-ARMOR-X13',queryTarget:'Armor X13',salientProduct:'Armor X13',
    comparisonProducts:['Armor X13','Armor 22'],lastIntent:'PRICE',priorities:[],spinFacts:[],turnCount:4,
  });
  const llm:LlmProvider={
    async decide(){return {decision:{...decision('PRICE','Armor X13'),nextBestAction:'ANSWER_ONLY'},model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    async write(){return {text:'x',model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
  };
  const engine=new HybridConversationEngine({conversations,telemetry:new NoopTelemetryRepository(),erp:new FakeErpRepository(),rag:{async search(){return[];}},llm,automation:new NoopAutomationBus()});
  const result=await engine.processTurn({sessionId:'s-other',message:'y el otro?'});
  assert.equal(result.debug.intent,'PRICE');
  assert.equal(result.debug.queryTarget,'Armor 22');
  assert.match(result.answer,/1199/);
});

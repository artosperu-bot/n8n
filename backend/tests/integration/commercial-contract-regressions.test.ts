import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmDecisionInput, LlmDecisionResult, LlmProvider, LlmWriteInput, TurnDecision } from '../../src/ports/LlmProvider.ts';
import type { RagRepository } from '../../src/ports/RagRepository.ts';

const usage = { inputTokens:10, outputTokens:5, totalTokens:15, cachedInputTokens:0 };
function result(decision:TurnDecision):LlmDecisionResult {
  return { decision, model:'gpt-5-mini-test', usage, durationMs:1 };
}
function baseDecision(patch:Partial<TurnDecision>):TurnDecision {
  return {
    primaryIntent:'OTHER', secondaryIntents:[], targetProduct:null, mentionedProducts:[], referenceType:null,
    explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:null,
    customerProblem:null, priorities:[], objection:null, commercialStage:null, spinContribution:null,
    nextBestAction:'WAIT_FOR_NEXT_QUESTION', needsSql:false, needsProductRag:false,
    needsInstitutionalRag:false, confidence:0.95, ...patch,
  };
}
function deps(llm:LlmProvider, conversations=new MemoryConversationRepository()) {
  return {
    conversations,
    telemetry:new NoopTelemetryRepository(),
    erp:new FakeErpRepository(),
    rag:new FakeRagRepository(),
    llm,
    automation:new NoopAutomationBus(),
  };
}

test('mere mention of a second product does not force comparison or switch active product', async () => {
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-mention',{
    sessionId:'s-mention', contextVersion:0, turnCount:2,
    activeProduct:'Armor X13', activeProductId:'P-ARMOR-X13', activeProductCode:'P000048',
    salientProduct:'Armor X13', comparisonProducts:[], spinFacts:[], priorities:[],
  });
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(_input:LlmDecisionInput){
      return result(baseDecision({
        primaryIntent:'COMPARE', targetProduct:'Armor X13', mentionedProducts:['Armor 22'],
        referenceType:'ACTIVE_PRODUCT_FALLBACK', comparisonProducts:['Armor 22'],
        needsSql:true, needsProductRag:true, nextBestAction:'GUIDE_SELECTION',
      }));
    },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-mention', message:'También estoy viendo el Armor 22.', messageId:'m-mention',
  });
  assert.notEqual(r.debug.intent,'COMPARE');
  assert.doesNotMatch(r.answer,/qué dos modelos quieres comparar/i);
  assert.equal(r.state.activeProduct,'Armor X13');
  assert.equal(r.state.queryTarget,'Armor 22');
  assert.equal(r.state.salientProduct,'Armor 22');
  assert.deepEqual(r.state.comparisonProducts,['Armor X13','Armor 22']);
  assert.equal(r.state.explicitSwitch,false);
});

test('unknown product with neutral alternatives never assigns one before an ambiguous price followup', async () => {
  const conversations=new MemoryConversationRepository();
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(input:LlmDecisionInput){
      if(/armor 30/i.test(input.message)){
        return result(baseDecision({
          primaryIntent:'PRODUCT_INFO', targetProduct:'Armor 30', mentionedProducts:['Armor 30'],
          referenceType:'NAMED', needsSql:true, needsProductRag:true,
          customerNeed:'trabajo', priorities:['resistencia'], nextBestAction:'OFFER_ALTERNATIVES',
        }));
      }
      return result(baseDecision({
        primaryIntent:'PRICE', targetProduct:'Armor 30', referenceType:'ACTIVE_PRODUCT_FALLBACK',
        needsSql:true, nextBestAction:'ADVANCE_IF_INTEREST',
      }));
    },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const engine=new HybridConversationEngine(deps(llm,conversations));
  const first=await engine.processTurn({sessionId:'s-unknown-follow',message:'¿Tienen Armor 30 para trabajo?',messageId:'m-u1'});
  assert.equal(first.state.recommendedProduct,null);
  assert.equal(first.debug.decisionTrace.recommendation?.winner,null);
  assert.equal(first.debug.decisionTrace.recommendation?.winnerReason,'NO_COMPARABLE_EVIDENCE');

  const second=await engine.processTurn({sessionId:'s-unknown-follow',message:'¿Cuánto cuesta?',messageId:'m-u2'});
  assert.equal(second.debug.intent,'PRICE');
  assert.equal(second.state.recommendedProduct,null);
  assert.equal(second.debug.route,'UNKNOWN_TO_ALTERNATIVES');
  assert.doesNotMatch(second.answer,/S\/\s*\d+/);
});

test('current valid product mention overrides a stale unknown-recovery recommendation', async () => {
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-unknown-explicit-recovery',{
    sessionId:'s-unknown-explicit-recovery',contextVersion:0,turnCount:1,
    activeProduct:null,queryTarget:'Armor 30',salientProduct:'Armor 30',selectedProduct:null,
    recommendedProduct:'Armor 22',comparisonProducts:[],spinFacts:[],priorities:[],
  });
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(input:LlmDecisionInput){
      if(input.message!=='mejor dime del Armor X13')return writer.decide!(input);
      return result(baseDecision({
        primaryIntent:'INQUIRE_PRODUCT' as any,targetProduct:'Armor 22',mentionedProducts:[],
        referenceType:'RECOMMENDED_FALLBACK',nextBestAction:'ANSWER_ONLY',
      }));
    },
    write(input:LlmWriteInput){return writer.write(input);},
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-unknown-explicit-recovery',message:'mejor dime del Armor X13',messageId:'m-recover-x13',
  });
  assert.equal(r.debug.intent,'PRODUCT_INFO');
  assert.equal(r.debug.queryTarget,'Armor X13');
  assert.equal(r.state.activeProduct,'Armor X13');
  assert.equal(r.state.recommendedProduct,null);
  assert.equal(r.state.selectedProduct,null);
  assert.equal(r.debug.route,'RAG_PRODUCT');

  const capability=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-unknown-explicit-recovery',message:'aguanta caidas?',messageId:'m-recover-capability'});
  assert.equal(capability.debug.queryTarget,'Armor X13');
  assert.equal(capability.state.activeProduct,'Armor X13');

  const purchase=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-unknown-explicit-recovery',message:'ya ese quiero',messageId:'m-recover-purchase'});
  assert.equal(purchase.debug.queryTarget,'Armor X13');
  assert.equal(purchase.state.selectedProduct,'Armor X13');
  assert.match(purchase.answer,/reserva de Armor X13/i);
});

test('strong institutional pre-router wins when semantic planner returns OTHER', async () => {
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){ return result(baseDecision({ primaryIntent:'OTHER', nextBestAction:'DISCOVER_ONE_FACT' })); },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm)).processTurn({
    sessionId:'s-institutional-prerouter', message:'hasta q hora atienden?', messageId:'m-institutional-prerouter',
  });
  assert.equal(r.debug.intent,'POLICY');
  assert.equal(r.debug.route,'RAG_INSTITUTIONAL');
  assert.equal(r.state.requiresRag,true);
});

test('el otro inherits the previous factual intent while resolving the comparison alternative', async () => {
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-intent-inheritance',{
    sessionId:'s-intent-inheritance', contextVersion:0, turnCount:3,
    activeProduct:'Armor X13', activeProductId:'P-ARMOR-X13', activeProductCode:'P000048',
    queryTarget:'Armor X13', salientProduct:'Armor X13', comparisonProducts:['Armor X13','Armor 22'],
    lastIntent:'PRICE', spinFacts:[], priorities:[],
  });
  const writer=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){ return result(baseDecision({ primaryIntent:'OTHER', nextBestAction:'DISCOVER_ONE_FACT' })); },
    write(input:LlmWriteInput){ return writer.write(input); },
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-intent-inheritance', message:'y el otro?', messageId:'m-intent-inheritance',
  });
  assert.equal(r.debug.intent,'PRICE');
  assert.equal(r.debug.queryTarget,'Armor 22');
  assert.match(r.answer,/S\/\s*1199/);
});

test('natural weight question routes to FISICO product evidence',async()=>{
  const r=await new HybridConversationEngine(deps(new FakeLlmProvider())).processTurn({
    sessionId:'s-weight',message:'¿Cuánto pesa el Armor 22?',messageId:'m-weight',
  });
  assert.equal(r.debug.intent,'CAPABILITY');
  assert.equal(r.debug.route,'RAG_PRODUCT');
  assert.equal(r.debug.queryTarget,'Armor 22');
  assert.ok(r.debug.ragSources?.some(source=>/FISICO/.test(source)));
});

test('interest level rewards useful progression without inflating repeated technical questions',async()=>{
  const conversations=new MemoryConversationRepository();
  const engine=new HybridConversationEngine(deps(new FakeLlmProvider(),conversations));
  const first=await engine.processTurn({sessionId:'s-interest-level',message:'¿Cuánta RAM tiene el Armor 22?',messageId:'m-interest-1'});
  const repeated=await engine.processTurn({sessionId:'s-interest-level',message:'¿Cuánta RAM tiene el Armor 22?',messageId:'m-interest-2'});
  const price=await engine.processTurn({sessionId:'s-interest-level',message:'¿Cuánto cuesta?',messageId:'m-interest-3'});
  const purchase=await engine.processTurn({sessionId:'s-interest-level',message:'Ya ese quiero, ¿cómo compro?',messageId:'m-interest-4'});

  assert.equal(first.state.levelOfInterest,4);
  assert.equal(repeated.state.levelOfInterest,4);
  assert.equal(price.state.levelOfInterest,12);
  assert.equal(purchase.state.levelOfInterest,57);
  assert.equal(purchase.state.purchaseSignal,true);
});

test('a supplied budget resolves the active price objection in current context',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-objection-resolved',{
    sessionId:'s-objection-resolved',turnCount:2,activeProduct:'Armor 22',objection:'precio',
    pendingMissingFact:'presupuesto máximo',pendingCommercialAction:'ASK_MISSING_FACT',lastNba:'ASK_MISSING_FACT',
    comparisonProducts:[],spinFacts:[],priorities:['precio'],
  });
  const result=await new HybridConversationEngine(deps(new FakeLlmProvider(),conversations)).processTurn({
    sessionId:'s-objection-resolved',message:'Máximo 1200',messageId:'m-objection-budget',
  });
  assert.equal(result.state.budget,1200);
  assert.equal(result.state.objection,null);
});

test('budget reranking communicates the verified differentiator before ese can select the new product',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-continuity',{
    sessionId:'s-continuity',contextVersion:0,turnCount:2,
    activeProduct:'Armor X12 Pro',queryTarget:'Armor X12 Pro',salientProduct:'Armor X12 Pro',
    recommendedProduct:'Armor X12 Pro',customerVisibleRecommendedProduct:'Armor X12 Pro',
    useCase:'trabajo',problem:'caidas_frecuentes',priorities:['resistencia','bateria'],spinFacts:[],
  });
  const rag:RagRepository={
    async search(){return[];},
    async searchInstitutional(){return[];},
    async searchProduct(_query,productId,sections){
      const battery=productId.includes('22-')?'Batería: 6600 mAh. Carga cableada: 33 W.'
        :productId.includes('X13')?'Batería: 6320 mAh. Carga cableada: 10 W.'
          :'Batería: 4860 mAh. Carga cableada: 10 W.';
      return sections.map(section=>({
        text:section==='BATERIA'?battery:'Resistencia a caídas: 1.5 m. Profundidad IP68: 1.5 m. IP68: Sí.',
        source:`TEST:${section}`,score:10,productId,section,domain:'PRODUCT' as const,
      }));
    },
  };
  const engine=new HybridConversationEngine({...deps(new FakeLlmProvider(),conversations),rag});
  const budget=await engine.processTurn({sessionId:'s-continuity',message:'máximo 1500',messageId:'m-continuity-budget'});
  assert.equal(budget.state.recommendedProduct,'Armor 22');
  assert.equal(budget.state.customerVisibleRecommendedProduct,'Armor 22');
  assert.equal(budget.state.recommendationChanged,true);
  assert.equal(budget.state.recommendationChangeCommunicated,true);
  assert.match(String(budget.state.recommendationChangeReason),/bater[ií]a|6600|33 W/i);
  assert.match(budget.answer,/Armor X12 Pro/i);
  assert.match(budget.answer,/Armor 22/i);
  assert.match(budget.answer,/bater[ií]a|6600|33 W/i);

  const purchase=await engine.processTurn({sessionId:'s-continuity',message:'ya ese quiero, ¿cómo compro?',messageId:'m-continuity-purchase'});
  assert.equal(purchase.state.selectedProduct,'Armor 22');
  assert.match(purchase.answer,/reserva de Armor 22/i);
});

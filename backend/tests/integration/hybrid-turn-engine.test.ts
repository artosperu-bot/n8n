import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { FakeLlmProvider } from '../../src/adapters/fake/FakeLlmProvider.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmProvider, LlmDecisionInput, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

function deps(llm: LlmProvider, conversations = new MemoryConversationRepository()) {
  return { conversations, telemetry:new NoopTelemetryRepository(), erp:new FakeErpRepository(), rag:new FakeRagRepository(), llm, automation:new NoopAutomationBus() };
}

async function engineWithPendingReservation(sessionId:string){
  const conversations=new MemoryConversationRepository();
  await conversations.saveState(sessionId,{
    activeProduct:'Armor 22',selectedProduct:'Armor 22',queryTarget:'Armor 22',salientProduct:'Armor 22',
    reservationStage:'NEED_DOCUMENT',purchaseSignal:true,commercialStage:'CIERRE',turnCount:2,
  });
  return new HybridConversationEngine(deps(new FakeLlmProvider(),conversations));
}

test('hybrid engine preserves recent selection and starts personal reservation on purchase', async () => {
  const conversations = new MemoryConversationRepository();
  await conversations.saveState('s-hybrid', {
    activeProduct:'Armor 22', selectedProduct:'Armor 22', salientProduct:'Armor 22', recommendedProduct:'Armor 25T Pro',
    comparisonProducts:['Armor X13','Armor 22'], turnCount:4
  });
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide(_input: LlmDecisionInput) {
      return { decision:{
        primaryIntent:'PURCHASE', secondaryIntents:[], targetProduct:'Armor 25T Pro', mentionedProducts:[], referenceType:'SELECTION',
        explicitSwitch:false, selectedProduct:'Armor 25T Pro', comparisonProducts:['Armor X13','Armor 22'], attributes:[],
        customerNeed:null, customerProblem:null, priorities:[], objection:null, commercialStage:'DECISION', spinContribution:null,
        nextBestAction:'ASK_BUDGET', needsSql:true, needsProductRag:false, needsInstitutionalRag:false, confidence:0.98
      }, model:'gpt-5-mini-test', usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:0}, durationMs:1 };
    },
    write(input: LlmWriteInput){ return base.write(input); }
  };
  const engine = new HybridConversationEngine(deps(llm, conversations));
  const r = await engine.processTurn({sessionId:'s-hybrid',message:'Entonces me quedo con ese'});
  assert.equal(r.state.selectedProduct,'Armor 22');
  assert.equal(r.state.activeProduct,'Armor 22');
  assert.equal(r.state.lastNba,'COLLECT_RESERVATION_DATA');
  assert.equal(r.state.handoffActive,false);
  assert.equal(r.state.reservationStage,'NEED_DOCUMENT');
  assert.match(r.answer,/Armor 22/);
  assert.match(r.answer,/DNI|Carn[eé] de Extranjer/i);
});

test('unknown requested product recovers with verified catalog alternatives instead of a dead end', async () => {
  const base = new FakeLlmProvider();
  const llm: LlmProvider = {
    async decide() {
      return { decision:{
        primaryIntent:'PRODUCT_INFO', secondaryIntents:[], targetProduct:'Armor 30', mentionedProducts:['Armor 30'], referenceType:'NAMED',
        explicitSwitch:false, selectedProduct:null, comparisonProducts:[], attributes:[], customerNeed:'construccion', customerProblem:'caidas frecuentes',
        priorities:['resistencia','bateria'], objection:null, commercialStage:'DESCUBRIMIENTO', spinContribution:'problema:caidas', nextBestAction:'OFFER_ALTERNATIVES',
        needsSql:true, needsProductRag:true, needsInstitutionalRag:false, confidence:0.96
      }, model:'gpt-5-mini-test', usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:0}, durationMs:1 };
    },
    write(input: LlmWriteInput){ return base.write(input); }
  };
  const engine = new HybridConversationEngine(deps(llm));
  const r = await engine.processTurn({sessionId:'s-unknown',message:'Busco el Armor 30 para construcción'});
  assert.doesNotMatch(r.answer,/no tengo ese dato confirmado todavía/i);
  assert.match(r.answer,/Armor X12 Pro|Armor X13|Armor 22|Armor 25T Pro/);
  assert.equal(r.state.lastNba,'OFFER_ALTERNATIVE');
});

test('direct image request remains a deterministic URL-only fast path', async () => {
  const engine = new HybridConversationEngine(deps(new FakeLlmProvider()));
  const r = await engine.processTurn({sessionId:'s-images',message:'Mándame imágenes del Armor 22'});
  assert.match(r.answer,/^https:\/\//);
  assert.doesNotMatch(r.answer,/aqui|imagen|foto/i);
});

test('B2B multi-candidate handoff preserves context without inventing a selected product', async () => {
  const conversations = new MemoryConversationRepository();
  await conversations.saveState('s-b2b', {
    activeProduct:'Armor X13',
    selectedProduct:null,
    recommendedProduct:'Armor 22',
    comparisonProducts:['Armor X13','Armor 22'],
    customerType:'BUSINESS',
    quantity:12,
    invoiceRequired:true,
    turnCount:4,
  });
  const events:any[]=[];
  const base = new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){
      return {decision:{
        primaryIntent:'HUMAN',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
        explicitSwitch:false,selectedProduct:null,comparisonProducts:['Armor X13','Armor 22'],attributes:[],
        customerNeed:'tecnicos de campo',customerProblem:null,priorities:['resistencia','bateria'],objection:null,
        commercialStage:'CIERRE_ASISTIDO',spinContribution:null,nextBestAction:'ASSISTED_HANDOFF',
        needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.99,
      },model:'gpt-5-mini-test',usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:0},durationMs:1};
    },
    write(input:LlmWriteInput){return base.write(input);},
  };
  const engine=new HybridConversationEngine({
    conversations,
    telemetry:new NoopTelemetryRepository(),
    erp:new FakeErpRepository(),
    rag:new FakeRagRepository(),
    llm,
    automation:{async publish(event:any){events.push(event);return {delivered:true};}},
  });

  const r=await engine.processTurn({sessionId:'s-b2b',message:'quiero q un asesor siga con la compra'});
  const event=events.at(-1);
  assert.equal(event?.type,'handoff.requested');
  assert.equal(event?.payload?.product,null);
  assert.equal(event?.payload?.selectedProduct,null);
  assert.equal(event?.payload?.activeProduct,'Armor X13');
  assert.equal(event?.payload?.recommendedProduct,'Armor 22');
  assert.deepEqual(event?.payload?.comparisonProducts,['Armor X13','Armor 22']);
  assert.equal(event?.payload?.quantity,12);
  assert.equal(event?.payload?.invoiceRequired,true);
  assert.equal(r.state.selectedProduct,null);
});

test('explicit budget with known use cannot be degraded to OTHER by semantic planner', async () => {
  const conversations = new MemoryConversationRepository();
  await conversations.saveState('s-budget-authority', {
    useCase:'delivery', priorities:['bateria','resistencia'], turnCount:2,
  });
  const base = new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){return {decision:{
      primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
      explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:'delivery',customerProblem:null,
      priorities:['bateria','resistencia'],objection:null,commercialStage:'EVALUACION',spinContribution:null,
      nextBestAction:'ASK_MISSING_FACT',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.7,
    },model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    write(input:LlmWriteInput){return base.write(input);},
  };
  const engine=new HybridConversationEngine(deps(llm,conversations));
  const r=await engine.processTurn({sessionId:'s-budget-authority',message:'tengo 1000 maximo'});
  assert.equal(r.state.budget,1000);
  assert.equal(r.debug.intent,'RECOMMEND_WITHIN_BUDGET');
  assert.notEqual(r.debug.route,'GENERAL_COMMERCIAL');
  assert.ok(r.state.recommendedProduct);
});

test('explicit budget authority cannot be degraded to CAPABILITY by semantic planner',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-budget-capability',{
    activeProduct:'Armor X12 Pro',queryTarget:'Armor X12 Pro',salientProduct:'Armor X12 Pro',
    useCase:'delivery',priorities:['bateria','resistencia'],turnCount:2,
  });
  const base=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){return {decision:{
      primaryIntent:'CAPABILITY',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
      explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:['BATERIA'],customerNeed:'delivery',customerProblem:null,
      priorities:['bateria','resistencia'],objection:null,commercialStage:'EVALUACION',spinContribution:null,
      nextBestAction:'ANSWER_ONLY',needsSql:false,needsProductRag:true,needsInstitutionalRag:false,confidence:0.91,
    },model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    write(input:LlmWriteInput){return base.write(input);},
  };
  const result=await new HybridConversationEngine(deps(llm,conversations)).processTurn({
    sessionId:'s-budget-capability',message:'máximo 1500 soles',
  });
  assert.equal(result.state.budget,1500);
  assert.equal(result.debug.decisionTrace.deterministicIntent,'RECOMMEND_WITHIN_BUDGET');
  assert.equal(result.debug.decisionTrace.plannerIntent,'CAPABILITY');
  assert.equal(result.debug.intent,'RECOMMEND_WITHIN_BUDGET');
  assert.equal(result.debug.route,'RAG_RECOMMENDATION');
  assert.ok(result.debug.recommendationCriteria.includes('BATERIA'));
});

test('explicit human request outranks stale STOCK planner intent and closes as assisted handoff', async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-human-authority',{
    activeProduct:'Armor 22',recommendedProduct:'Armor 22',quantity:12,customerType:'BUSINESS',purchaseSignal:true,turnCount:4,
  });
  const base=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){return {decision:{
      primaryIntent:'STOCK',secondaryIntents:[],targetProduct:'Armor 22',mentionedProducts:[],referenceType:'RECENT',
      explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:'tecnicos',customerProblem:null,
      priorities:['resistencia'],objection:null,commercialStage:'CONSIDERACION',spinContribution:null,nextBestAction:'ANSWER_ONLY',
      needsSql:true,needsProductRag:false,needsInstitutionalRag:false,confidence:0.92,
    },model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    write(input:LlmWriteInput){return base.write(input);},
  };
  const engine=new HybridConversationEngine(deps(llm,conversations));
  const r=await engine.processTurn({sessionId:'s-human-authority',message:'quiero q un asesor siga con la compra'});
  assert.equal(r.debug.intent,'HUMAN');
  assert.equal(r.debug.route,'ASSISTED_HANDOFF');
  assert.equal(r.state.lastNba,'ASSISTED_HANDOFF');
  assert.equal(r.state.handoffActive,true);
  assert.equal(r.state.commercialStage,'CIERRE_ASISTIDO');
});

test('purchase intent owns CIERRE stage even when planner proposes an older stage',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-purchase-stage',{activeProduct:'Armor X13',turnCount:3});
  const base=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){return {decision:{
      primaryIntent:'PURCHASE',secondaryIntents:[],targetProduct:'Armor X13',mentionedProducts:[],referenceType:'RECENT',
      explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,priorities:[],
      objection:null,commercialStage:'DESCUBRIMIENTO',spinContribution:null,nextBestAction:'COLLECT_RESERVATION_DATA',needsSql:true,
      needsProductRag:false,needsInstitutionalRag:false,confidence:0.95,
    },model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    write(input:LlmWriteInput){return base.write(input);},
  };
  const r=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-purchase-stage',message:'ya lo quiero comprar'});
  assert.equal(r.debug.intent,'PURCHASE');
  assert.equal(r.state.reservationStage,'NEED_DOCUMENT');
  assert.equal(r.state.commercialStage,'CIERRE');
});

test('comparison resolves both planner products even when whole-message SQL lookup misses the pair',async()=>{
  const baseErp=new FakeErpRepository();
  const erp:any={
    ...baseErp,
    async searchProducts(text:string,max=20){
      if(text.toLowerCase().includes('estoy entre'))return [];
      return baseErp.searchProducts(text,max);
    },
    getProductQuote:baseErp.getProductQuote.bind(baseErp),
    listProductsWithinBudget:baseErp.listProductsWithinBudget.bind(baseErp),
  };
  const base=new FakeLlmProvider();
  const llm:LlmProvider={
    async decide(){return {decision:{
      primaryIntent:'COMPARE',secondaryIntents:[],targetProduct:'Armor X13',mentionedProducts:['Armor X13','Armor 22'],referenceType:'MULTI_PRODUCT_MENTION',
      explicitSwitch:false,selectedProduct:null,comparisonProducts:['Armor X13','Armor 22'],attributes:['BATERIA'],customerNeed:null,customerProblem:null,
      priorities:['bateria'],objection:null,commercialStage:'EVALUACION',spinContribution:null,nextBestAction:'COMPARE',needsSql:true,needsProductRag:true,
      needsInstitutionalRag:false,confidence:0.98,
    },model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};},
    write(input:LlmWriteInput){return base.write(input);},
  };
  const conversations=new MemoryConversationRepository();
  const engine=new HybridConversationEngine({conversations,telemetry:new NoopTelemetryRepository(),erp,rag:new FakeRagRepository(),llm,automation:new NoopAutomationBus()});
  const r=await engine.processTurn({sessionId:'s-compare-seed',message:'estoy entre Armor X13 y Armor 22, comparalos'});
  assert.equal(r.debug.intent,'COMPARE');
  assert.equal(r.debug.route,'RAG_COMPARISON');
  assert.deepEqual(r.state.comparisonProducts,['Armor X13','Armor 22']);
  assert.doesNotMatch(r.answer,/Qué dos modelos quieres comparar/i);
});

test('valid competing intents interrupt reservation data capture and preserve the pending stage',async()=>{
  const warranty=await (await engineWithPendingReservation('s-reservation-warranty')).processTurn({
    sessionId:'s-reservation-warranty',message:'¿Cuál es la garantía del Armor 22?',
  });
  assert.equal(warranty.debug.intent,'WARRANTY');
  assert.equal(warranty.debug.route,'RAG_INSTITUTIONAL');
  assert.equal(warranty.state.reservationStage,'NEED_DOCUMENT');
  assert.doesNotMatch(warranty.answer,/Necesito un DNI/i);

  const human=await (await engineWithPendingReservation('s-reservation-human')).processTurn({
    sessionId:'s-reservation-human',message:'prefiero hablar con un asesor',
  });
  assert.equal(human.debug.intent,'HUMAN');
  assert.equal(human.debug.route,'ASSISTED_HANDOFF');
  assert.equal(human.state.reservationStage,'NEED_DOCUMENT');
  assert.doesNotMatch(human.answer,/Necesito un DNI/i);
});

test('explicit product decision during reservation returns to the normal switch pipeline',async()=>{
  const result=await (await engineWithPendingReservation('s-reservation-switch')).processTurn({
    sessionId:'s-reservation-switch',message:'me quedo con el Armor X13',
  });
  assert.equal(result.debug.intent,'PURCHASE');
  assert.equal(result.state.selectedProduct,'Armor X13');
  assert.equal(result.state.activeProduct,'Armor X13');
  assert.equal(result.state.reservationStage,'NEED_DOCUMENT');
  assert.equal(result.debug.queryTarget,'Armor X13');
});

test('explicit abandonment clears local reservation data while valid document advances one stage',async()=>{
  const abandoned=await (await engineWithPendingReservation('s-reservation-abandon')).processTurn({
    sessionId:'s-reservation-abandon',message:'ya no quiero continuar con la reserva',
  });
  assert.equal(abandoned.debug.route,'RESERVATION_CANCELLED');
  assert.equal(abandoned.state.reservationStage,null);
  assert.equal(abandoned.state.purchaseSignal,false);
  assert.equal(abandoned.state.reservationDocument,null);
  assert.doesNotMatch(abandoned.answer,/reserva (?:qued[oó]|fue) cancelada/i,'must not claim an external cancellation');

  const advanced=await (await engineWithPendingReservation('s-reservation-document')).processTurn({
    sessionId:'s-reservation-document',message:'12345678',
  });
  assert.equal(advanced.debug.route,'RESERVATION_DATA');
  assert.equal(advanced.state.reservationStage,'NEED_NAME');
  assert.equal(advanced.state.reservationDocument,'12345678');
});

test('structurally valid name and address continue reservation despite incidental policy words',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-reservation-fields',{
    activeProduct:'Armor 22',selectedProduct:'Armor 22',reservationStage:'NEED_NAME',reservationDocument:'12345678',
    purchaseSignal:true,commercialStage:'CIERRE',turnCount:3,
  });
  const engine=new HybridConversationEngine(deps(new FakeLlmProvider(),conversations));
  const named=await engine.processTurn({sessionId:'s-reservation-fields',message:'Juan Pérez Torres'});
  assert.equal(named.state.reservationStage,'NEED_ADDRESS');
  assert.equal(named.state.reservationCustomerName,'Juan Pérez Torres');

  const addressed=await engine.processTurn({sessionId:'s-reservation-fields',message:'Calle Lima 123'});
  assert.equal(addressed.debug.route,'RESERVATION_READY');
  assert.equal(addressed.state.reservationStage,'READY');
  assert.equal(addressed.state.reservationAddress,'Calle Lima 123');
  assert.match(addressed.answer,/todav[ií]a no est[aá] confirmada/i);
});

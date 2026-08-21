import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import type { LlmProvider, TurnDecision } from '../../src/ports/LlmProvider.ts';

const usage={inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0};
function decision(patch:Partial<TurnDecision>):TurnDecision{return {
  primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
  explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,
  priorities:[],objection:null,commercialStage:null,spinContribution:null,nextBestAction:'ANSWER_ONLY',
  needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:.99,...patch,
};}

const rag:any={
  async search(){return[];},
  async searchInstitutional(){return[];},
  async searchProduct(_q:string,productId:string,sections:string[]){
    return sections.map(section=>{
      let text=`Sección ${section} confirmada.`;
      if(section==='CAMARA') text=productId.includes('22')?'Cámara principal: 64 MP. Cámara nocturna: 64 MP.':'Cámara principal: 50 MP. Cámara nocturna: 24 MP.';
      if(section==='RESISTENCIA') text=productId.includes('25T')?'Certificación IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 2 m.':'Certificación IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m.';
      if(section==='BATERIA') text='Capacidad de batería: 6320 mAh. Carga cableada: 10 W.';
      if(section==='TERMICA') text=productId.includes('25T')?'Cámara térmica: Sí. Frecuencia térmica: 25 Hz. Resolución térmica horizontal: 160 px. Resolución térmica vertical: 120 px. Temperatura máxima térmica: 550 °C.':'Cámara térmica: No.';
      return {text,source:`TEST:${productId}:${section}`,score:.5,productId,section,domain:'PRODUCT' as const};
    });
  },
};

function llmFor(d:TurnDecision):LlmProvider{return {
  async decide(){return {decision:d,model:'gpt-test',usage,durationMs:1};},
  async write(){return {text:'Para ese uso conviene elegir según las características confirmadas.',model:'gpt-test',usage,durationMs:1};},
};}

function engine(llm:LlmProvider){return new HybridConversationEngine({
  conversations:new MemoryConversationRepository(),telemetry:new NoopTelemetryRepository(),erp:new FakeErpRepository(),rag,llm,automation:new NoopAutomationBus(),
});}

test('camera + sharing + resistance need does not repeat generic discovery and enters recommendation',async()=>{
  const llm=llmFor(decision({
    primaryIntent:'CAPABILITY',attributes:['CAMARA','RESISTENCIA'],customerNeed:'tomar fotos de trabajos y subirlas a redes',
    customerProblem:'necesita un equipo resistente',priorities:['camara','resistencia'],nextBestAction:'ANSWER_ONLY',needsProductRag:true,
  }));
  const r=await engine(llm).processTurn({sessionId:'live-camera-need',message:'necesito tomar fotos de trabajos y subirlas a redes, pero quiero algo resistente'});
  assert.equal(r.debug.route,'RAG_RECOMMENDATION');
  assert.ok(r.state.recommendedProduct);
  assert.doesNotMatch(r.answer,/qué aspecto es más importante/i);
});

test('recommendation turn exposes a compact decision trace for Supabase diagnosis',async()=>{
  const llm=llmFor(decision({
    primaryIntent:'EVALUATE_USE',customerNeed:'construccion',customerProblem:'caidas_frecuentes',priorities:['resistencia'],nextBestAction:'RECOMMEND',needsSql:true,needsProductRag:true,
  }));
  const r=await engine(llm).processTurn({sessionId:'live-trace',message:'trabajo en construccion y se me cae seguido, quiero uno resistente'});
  const trace=(r.debug as any).decisionTrace;
  assert.equal(trace.finalIntent,'EVALUATE_USE');
  assert.ok(Array.isArray(trace.recommendation?.eligibleCandidates));
  assert.ok(trace.recommendation?.eligibleCandidates.length>=1);
  assert.ok(trace.recommendation?.winner);
  assert.deepEqual((r.state as any).lastDecisionTrace,trace);
});

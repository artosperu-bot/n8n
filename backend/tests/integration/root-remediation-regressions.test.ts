import test from 'node:test';
import assert from 'node:assert/strict';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';
import { NoopAutomationBus } from '../../src/adapters/fake/NoopAutomationBus.ts';
import { NoopTelemetryRepository } from '../../src/adapters/fake/NoopTelemetryRepository.ts';
import { institutionalResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, LlmWriteInput, TurnDecision } from '../../src/ports/LlmProvider.ts';

const usage={inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0};
function decision(patch:Partial<TurnDecision>):TurnDecision{return {
  primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:null,
  explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,
  priorities:[],objection:null,commercialStage:null,spinContribution:null,nextBestAction:'ANSWER_ONLY',
  needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:.99,...patch,
};}
function llmFor(turn:TurnDecision,answer='Respuesta comercial.'):LlmProvider{return {
  async decide(){return {decision:turn,model:'gpt-test',usage,durationMs:1};},
  async write(){return {text:answer,model:'gpt-test',usage,durationMs:1};},
};}
function deps(llm:LlmProvider,conversations=new MemoryConversationRepository(),rag:any=new FakeRagRepository()){
  return {conversations,telemetry:new NoopTelemetryRepository(),erp:new FakeErpRepository(),rag,llm,automation:new NoopAutomationBus()};
}

test('institutional response accepts vector evidence by domain, not transport prefix',()=>{
  const answer=institutionalResponse([{
    text:'Atendemos de 10:00 a 17:00.',source:'SUPABASE_VECTOR_INSTITUCIONAL:ubicacion:horario',score:.92,domain:'INSTITUTIONAL',
  }]);
  assert.equal(answer,'Atendemos de 10:00 a 17:00.');
});

test('ANSWER_ONLY is an output authority: writer cannot append a commercial question',async()=>{
  const writer:LlmProvider={async write(){return {text:'Sí, tiene NFC. ¿Quieres que te confirme precio?',model:'gpt-test',usage,durationMs:1};}};
  const input:any={message:'tiene nfc?',intent:'CAPABILITY',state:{},decision:decision({primaryIntent:'CAPABILITY',nextBestAction:'ANSWER_ONLY'}),deterministicAnswer:'Sí, tiene NFC.'};
  const result=await safeWrite(writer,input,'Sí, tiene NFC.');
  assert.equal(result.answer,'Sí, tiene NFC.');
  assert.equal(result.fallback.error,'NBA_ANSWER_ONLY_QUESTION');
});

test('writer rejects a product offer outside the SQL/context allowlist',async()=>{
  const writer:LlmProvider={async write(){return {text:'Te recomiendo el Armor X10 por resistencia.',model:'gpt-test',usage,durationMs:1};}};
  const input:any={message:'cual recomiendas?',intent:'RECOMMEND',state:{},decision:decision({primaryIntent:'RECOMMEND',nextBestAction:'RECOMMEND'}),deterministicAnswer:'Te recomiendo el Armor X13.',allowedProducts:['Armor X13','Armor 22']};
  const result=await safeWrite(writer,input,'Te recomiendo el Armor X13.');
  assert.equal(result.answer,'Te recomiendo el Armor X13.');
  assert.equal(result.fallback.error,'PRODUCT_OUTSIDE_ALLOWLIST');
});

test('use-case with sufficient decision context enters structured recommendation instead of generic reasoning',async()=>{
  const rag={
    async search(){return[];},
    async searchProduct(_q:string,pid:string,sections:string[]){
      return sections.map(section=>({
        text:section==='RESISTENCIA'
          ? `Certificación IP68: Sí. Certificación IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: ${pid.includes('25T')?'2':'1.5'} m.`
          : 'Capacidad de batería: 6320 mAh. Carga cableada: 10 W.',
        source:`TEST:${section}`,score:.5,productId:pid,section,domain:'PRODUCT' as const,
      }));
    },
  };
  const llm=llmFor(decision({primaryIntent:'EVALUATE_USE',customerNeed:'construccion',customerProblem:'caidas_frecuentes',priorities:['resistencia'],nextBestAction:'RECOMMEND'}),'Para obra te conviene priorizar resistencia.');
  const result=await new HybridConversationEngine(deps(llm,new MemoryConversationRepository(),rag)).processTurn({sessionId:'s-use-rank',message:'Trabajo en construcción y se me cae seguido, quiero uno resistente.'});
  assert.ok(result.state.recommendedProduct,'debe seleccionar un candidato SQL real');
  assert.notEqual(result.debug.route,'COMMERCIAL_REASONING');
});

test('personal purchase of one resolved unit starts reservation data collection, not handoff',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-buy-one',{sessionId:'s-buy-one',turnCount:2,activeProduct:'Armor X13',activeProductId:'P-ARMOR-X13',selectedProduct:'Armor X13',queryTarget:'Armor X13',priorities:[],spinFacts:[]});
  const llm=llmFor(decision({primaryIntent:'PURCHASE',targetProduct:'Armor X13',selectedProduct:'Armor X13',referenceType:'SELECTION_REFERENT',nextBestAction:'ASSISTED_HANDOFF'}));
  const result=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-buy-one',message:'ya ese quiero, como compro?'});
  assert.equal(result.state.handoffActive,false);
  assert.equal((result.state as any).reservationStage,'NEED_DOCUMENT');
  assert.match(result.answer,/DNI|carn[eé].*extranjer/i);
});

test('purchase of two or more units remains assisted handoff with context',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-buy-two',{sessionId:'s-buy-two',turnCount:2,activeProduct:'Armor X13',activeProductId:'P-ARMOR-X13',selectedProduct:'Armor X13',queryTarget:'Armor X13',priorities:[],spinFacts:[]});
  const llm=llmFor(decision({primaryIntent:'PURCHASE',targetProduct:'Armor X13',selectedProduct:'Armor X13',referenceType:'SELECTION_REFERENT',nextBestAction:'ASSISTED_HANDOFF'}));
  const result=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-buy-two',message:'quiero 2 unidades de ese'});
  assert.equal(result.state.quantity,2);
  assert.equal(result.state.handoffActive,true);
});

test('technical RAG use is exposed through ragSources for Oracle/Supabase audit',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('s-rag-source',{sessionId:'s-rag-source',turnCount:1,activeProduct:'Armor X13',activeProductId:'P-ARMOR-X13',queryTarget:'Armor X13',priorities:[],spinFacts:[]});
  const llm=llmFor(decision({primaryIntent:'CAPABILITY',targetProduct:'Armor X13',attributes:['BATERIA'],needsProductRag:true,nextBestAction:'ANSWER_ONLY'}),'Tiene batería documentada.');
  const result=await new HybridConversationEngine(deps(llm,conversations)).processTurn({sessionId:'s-rag-source',message:'que bateria trae?'});
  assert.ok((result.debug.ragSources??[]).length>0);
});

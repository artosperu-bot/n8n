import test from 'node:test';
import assert from 'node:assert/strict';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { HybridConversationEngine } from '../../src/conversation/HybridConversationEngine.ts';
import { MemoryConversationRepository } from '../../src/adapters/fake/MemoryConversationRepository.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';

const usage={inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0};
const resistanceFacts=[
  {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
] as any;

test('discovery pain cannot leak quote price or availability through the fallback path',async()=>{
  const delegate={
    async write(){
      return{text:'El Armor 22 ayuda con las caídas. Está a S/ 1399 y tenemos disponibilidad.',model:'test-writer',usage,durationMs:0};
    },
  };
  const llm=new FullRagLlmProvider(delegate as any);
  const result=await safeWrite(llm,{
    message:'Se me cae mucho',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',queryTarget:'Armor 22',useCase:'trabajo',problem:'caidas_frecuentes',spinFacts:['uso:trabajo','problema:caidas_frecuentes'],commercialStrategy:'FAB_SPIN'},
    resolvedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',productCode:'P000049',productRagId:'P-ARMOR-22-256G',price:1399,stock:9,currency:'PEN',source:'TEST'} as any,
    verifiedFeatures:resistanceFacts,verifiedFacts:resistanceFacts,
    decision:{nextBestAction:'ASK_MISSING_FACT'} as any,
    nextBestAction:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',missingFact:'impacto',
  } as any,'');

  assert.doesNotMatch(result.answer,/S\/\s*1399|precio|stock|disponib/i);
  assert.match(result.answer,/ca[ií]d|golp/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
  assert.match(result.answer,/genera|afecta|pierdes?|interrump|parar|detener/i);
});

test('a pure situation answer such as para mi trabajo does not query broad product RAG',async()=>{
  const conversations=new MemoryConversationRepository();
  await conversations.saveState('qa-discovery-work',{
    sessionId:'qa-discovery-work',contextVersion:1,turnCount:2,
    activeProduct:'Armor 22',activeProductId:'P-ARMOR-22-256G',activeProductCode:'P000049',
    queryTarget:'Armor 22',salientProduct:'Armor 22',selectedProduct:null,recommendedProduct:null,
    spinFacts:[],comparisonProducts:[],lastIntent:'PRODUCT_INFO',lastRoute:'RAG_PRODUCT',
    lastNba:'ASK_MISSING_FACT',pendingCommercialAction:'ASK_MISSING_FACT',pendingMissingFact:'uso principal',
    commercialStage:'DESCUBRIMIENTO',commercialStrategy:'FAB_SPIN',
  } as any);

  let productRagCalls=0;
  const rag={
    async search(){productRagCalls+=1;return[];},
    async searchProduct(){productRagCalls+=1;return[{text:'BATERIA_MAH: 6600 mAh. CARGA: 33 W.',source:'TEST:BATERIA',score:10,productId:'P-ARMOR-22-256G',section:'BATERIA',domain:'PRODUCT'}];},
    async searchInstitutional(){return[];},
  };
  const delegate={
    async decide(){return{decision:{primaryIntent:'EVALUATE_USE',secondaryIntents:[],targetProduct:'Armor 22',mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:'trabajo',customerProblem:null,priorities:[],objection:null,commercialStage:'DESCUBRIMIENTO',spinContribution:'uso:trabajo',nextBestAction:'ASK_MISSING_FACT',needsSql:false,needsProductRag:true,needsInstitutionalRag:false,confidence:0.95},model:'test-planner',usage,durationMs:0};},
    async write(input:any){return{text:String(input.deterministicAnswer??''),model:'test-writer',usage,durationMs:0};},
  };
  const engine=new HybridConversationEngine({
    conversations,
    telemetry:{async recordLlmUsage(){}},
    erp:new FakeErpRepository(),
    rag:rag as any,
    llm:new FullRagLlmProvider(delegate as any),
    automation:{async publish(){return{delivered:true};}},
  } as any);

  const result=await engine.processTurn({sessionId:'qa-discovery-work',message:'Para mi trabajo',messageId:'qa:work'} as any);
  assert.equal(productRagCalls,0);
  assert.equal(result.state.useCase,'trabajo');
  assert.equal(result.state.problem??null,null);
  assert.equal(result.debug.nextBestAction,'ASK_MISSING_FACT');
  assert.notEqual(result.debug.route,'RAG_PRODUCT');
  assert.doesNotMatch(result.answer,/6600|33\s*W|bater[ií]a|RAM|S\/|precio|stock|disponib/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
  assert.match(result.answer,/complica|problema|falla|ocurre/i);
});

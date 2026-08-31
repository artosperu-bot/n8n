import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';
import type { LlmDecisionResult, LlmProvider, LlmResult, LlmWriteInput, TurnDecision } from '../../src/ports/LlmProvider.ts';

const usage={inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0};

function decision(primaryIntent:string,overrides:Partial<TurnDecision>={}):TurnDecision{
  return {
    primaryIntent,
    secondaryIntents:[],
    targetProduct:'Armor 22',
    mentionedProducts:[],
    referenceType:'ACTIVE_PRODUCT_FALLBACK',
    explicitSwitch:false,
    selectedProduct:null,
    comparisonProducts:[],
    attributes:[],
    customerNeed:null,
    customerProblem:null,
    priorities:[],
    objection:null,
    commercialStage:null,
    spinContribution:null,
    nextBestAction:'ANSWER_ONLY',
    needsSql:false,
    needsProductRag:false,
    needsInstitutionalRag:false,
    confidence:0.95,
    ...overrides,
  };
}

class StubLlm implements LlmProvider{
  constructor(
    readonly decided:TurnDecision=decision('OTHER'),
    readonly written='Lo tienes pensado para trabajo construccion.',
  ){}
  async decide():Promise<LlmDecisionResult>{
    return{decision:this.decided,model:'stub',usage,durationMs:0};
  }
  async write(_input:LlmWriteInput):Promise<LlmResult>{
    return{text:this.written,model:'stub',usage,durationMs:0};
  }
}

test('fulfillment cannot close while discovery still has a missing fact',()=>{
  const state={
    activeProduct:'Armor 22',
    useCase:'trabajo',
    problem:'caidas_frecuentes',
    lastIntent:'EVALUATE_USE',
    lastNba:'ASK_MISSING_FACT',
    pendingCommercialAction:'ASK_MISSING_FACT',
    pendingMissingFact:'impacto',
    commercialStage:'DESCUBRIMIENTO',
  } as any;
  assert.equal(nextBestAction('FULFILLMENT_SELECTION',state),'ANSWER_ONLY');
});

test('unauthorized fulfillment keeps the pending discovery turn instead of advancing logistics',()=>{
  const state={
    activeProduct:'Armor 22',
    useCase:'trabajo',
    problem:'caidas_frecuentes',
    lastIntent:'EVALUATE_USE',
    lastNba:'ASK_MISSING_FACT',
    pendingCommercialAction:'ASK_MISSING_FACT',
    pendingMissingFact:'impacto',
    commercialStage:'DESCUBRIMIENTO',
  } as any;
  const incoming=decision('FULFILLMENT_SELECTION',{nextBestAction:'SOFT_CLOSE'});
  const validated=validateTurnDecision(incoming,state,['Armor 22'],incoming);
  assert.equal(validated.primaryIntent,'EVALUATE_USE');
  assert.equal(validated.nextBestAction,'ASK_MISSING_FACT');
});

test('current authorized fulfillment outranks stale planner price intent',()=>{
  const state={
    activeProduct:'Armor 22',
    lastIntent:'PRICE',
    lastNba:'SOFT_CLOSE',
    pendingCommercialAction:'SOFT_CLOSE',
    lastAssistantMessage:'Está disponible. ¿Prefieres envío o recojo?',
    commercialStage:'CONSIDERACION',
  } as any;
  const planner=decision('PRICE',{needsSql:true,nextBestAction:'SOFT_CLOSE'});
  const current=decision('FULFILLMENT_SELECTION',{needsSql:false,nextBestAction:'SOFT_CLOSE'});
  const validated=validateTurnDecision(planner,state,['Armor 22'],current);
  assert.equal(validated.primaryIntent,'FULFILLMENT_SELECTION');
  assert.equal(validated.nextBestAction,'SOFT_CLOSE');
});

test('pickup confirmation asks reservation for the same pickup choice',async()=>{
  const provider=new FullRagLlmProvider(new StubLlm());
  const result=await provider.write({
    message:'Prefiero recogerlo en su local.',
    intent:'FULFILLMENT_SELECTION',
    state:{activeProduct:'Armor 22',lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE'},
    resolvedProduct:'Armor 22',
    nextBestAction:'SOFT_CLOSE',
  });
  assert.match(result.text,/recogerlo|recojo/i);
  assert.match(result.text,/reserv/i);
  assert.doesNotMatch(result.text,/sería con envío/i);
});

test('short affirmative after an explicit reservation question becomes purchase',async()=>{
  const provider=new FullRagLlmProvider(new StubLlm(decision('OTHER')));
  const result=await provider.decide({
    message:'Dale',
    state:{
      activeProduct:'Armor 22',
      lastNba:'SOFT_CLOSE',
      pendingCommercialAction:'SOFT_CLOSE',
      lastAssistantMessage:'Perfecto, puedes recogerlo en nuestro local. ¿Quieres que te reserve Armor 22 para recojo?',
    },
  });
  assert.equal(result.decision.primaryIntent,'PURCHASE');
});

test('pain discovery fallback remains human and still asks exactly one pending question',async()=>{
  const provider=new FullRagLlmProvider(new StubLlm(decision('EVALUATE_USE'),'Lo tienes pensado para trabajo construccion.'));
  const verifiedFeatures=[
    {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',source:'test'},
    {domain:'PRODUCT_RAG',key:'IP68',value:'IP68',source:'test'},
    {domain:'PRODUCT_RAG',key:'IP69K',value:'IP69K',source:'test'},
    {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'MIL-STD-810H',source:'test'},
  ] as any;
  const result=await provider.write({
    message:'Se me cae mucho.',
    intent:'EVALUATE_USE',
    state:{
      activeProduct:'Armor 22',
      useCase:'trabajo',
      problem:'caidas_frecuentes',
      lastNba:'ASK_MISSING_FACT',
      pendingCommercialAction:'ASK_MISSING_FACT',
      pendingMissingFact:'impacto',
      commercialStrategy:'FAB_SPIN',
    },
    resolvedProduct:'Armor 22',
    verifiedFacts:verifiedFeatures,
    verifiedFeatures,
    directAnswer:'Armor 22 tiene resistencia verificada para uso exigente.',
    nextBestAction:'ASK_MISSING_FACT',
    finalExecutableNba:'ASK_MISSING_FACT',
    missingFact:'impacto',
    useCase:'trabajo',
    problem:'caidas_frecuentes',
  });
  assert.doesNotMatch(result.text,/Lo tienes pensado para trabajo/i);
  assert.match(result.text,/cae|caídas|golpes|trabajo|repar/i);
  assert.equal((result.text.match(/\?/g)??[]).length,1);
});

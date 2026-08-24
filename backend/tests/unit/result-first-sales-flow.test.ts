import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { normalizeUseCaseSpinFact } from '../../src/conversation/commercial/UseCaseNormalizer.ts';
import { priceResponse, stockResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';

test('a known work pain with a resolved fit stops SPIN and opens the commercial close',()=>{
  const state={
    activeProduct:'Armor 22',recommendedProduct:'Armor 22',
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    spinFacts:['uso:trabajo_construccion','problema:caidas_frecuentes'],
  } as any;
  assert.equal(nextBestAction('EVALUATE_USE',state),'SOFT_CLOSE');
});

test('a completed recommendation is allowed to advance instead of being frozen at RECOMMEND',()=>{
  const progression=evaluatePostAnswerCommercialProgression({
    intent:'EVALUATE_USE',
    currentNba:'RECOMMEND',
    state:{useCase:'trabajo_construccion',problem:'caidas_frecuentes',recommendedProduct:'Armor 22'} as any,
    resolvedProduct:'Armor 22',
    verifiedCurrentAnswer:true,
  });
  assert.equal(progression.candidateNba,'SOFT_CLOSE');
});

test('fit with a verified SQL quote gives price plus availability immediately and asks fulfillment',()=>{
  const plan=buildCommercialResponsePlan({
    message:'Trabajo en construcción y ya rompí dos celulares.',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    quote:{shortName:'Armor 22',product:'Armor 22',price:1399,stock:9,currency:'PEN'} as any,
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'}],
    finalExecutableNba:'SOFT_CLOSE',
  } as any,'Armor 22 tiene resistencia a caídas de 1.5 m.');
  assert.equal(plan.closePurpose,'FULFILLMENT');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/precio.*disponibilidad|disponibilidad.*precio/i);
  assert.match(instruction,/env[ií]o/i);
  assert.match(instruction,/recoger|recojo|local/i);
  assert.doesNotMatch(instruction,/quieres que te pase precio/i);
});

test('a first direct price answer advances to fulfillment without needing prior interest',()=>{
  const progression=evaluatePostAnswerCommercialProgression({
    intent:'PRICE',currentNba:'ANSWER_ONLY',state:{} as any,resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,relatedValueAvailable:true,
  });
  assert.equal(progression.candidateNba,'SOFT_CLOSE');
});

test('deterministic price policy returns price plus availability and asks fulfillment in one response',()=>{
  const answer=priceResponse({product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'FAKE_TEST_DATA'},true);
  assert.match(answer,/S\/\s*1399/i);
  assert.match(answer,/disponib/i);
  assert.match(answer,/env[ií]o/i);
  assert.match(answer,/recoger|recojo|local/i);
  assert.doesNotMatch(answer,/revisar stock|quieres avanzar/i);
});

test('deterministic stock policy also returns known price and fulfillment instead of another stock question',()=>{
  const answer=stockResponse({product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'FAKE_TEST_DATA'},null,true);
  assert.match(answer,/S\/\s*1399/i);
  assert.match(answer,/disponib/i);
  assert.match(answer,/env[ií]o/i);
  assert.match(answer,/recoger|recojo|local/i);
});

test('a fulfillment selection advances to reservation',()=>{
  const state={activeProduct:'Armor 22',pendingCommercialAction:'SOFT_CLOSE',lastNba:'SOFT_CLOSE'} as any;
  assert.equal(nextBestAction('POLICY',state),'SOFT_CLOSE');
  const plan=buildCommercialResponsePlan({
    message:'Envío a Ate.',intent:'POLICY',resolvedCurrentIntent:'POLICY',state,finalExecutableNba:'SOFT_CLOSE',
  } as any,'Sí, hacemos envíos.');
  assert.equal(plan.closePurpose,'RESERVATION');
  assert.match(buildCommercialResponseInstruction(plan),/reserv/i);
});

test('a short yes after a visible reservation question is promoted to PURCHASE by the contextual planner guard',async()=>{
  const delegate={
    async decide(){
      return{
        decision:{primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:'invented need',customerProblem:'invented problem',priorities:['invented'],objection:null,commercialStage:null,spinContribution:'implication: invented',nextBestAction:'ASK_MISSING_FACT',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.8},
        model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0,
      } as any;
    },
    async write(){throw new Error('not used');},
  };
  const provider=new FullRagLlmProvider(delegate as any);
  const result=await provider.decide({message:'Sí',state:{activeProduct:'Armor 22',lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE',lastAssistantMessage:'¿Quieres que te lo reserve?'}} as any);
  assert.equal(result.decision.primaryIntent,'PURCHASE');
  assert.equal(result.decision.customerNeed,null);
  assert.equal(result.decision.customerProblem,null);
  assert.deepEqual(result.decision.priorities,[]);
  assert.equal(result.decision.spinContribution,null);
});

test('repeated repair pain is captured as a customer problem instead of a neutral capability',()=>{
  const facts=extractCommercialFacts('Ya mandé reparar mi celular dos veces por caídas.',{} as any);
  assert.equal(facts.problem,'reparaciones_repetidas');
  assert.ok(facts.spinFacts.includes('problema:reparaciones_repetidas'));
});

test('free-form planner SPIN prose is rejected by the canonical spin fact normalizer',()=>{
  assert.equal(normalizeUseCaseSpinFact('situation: trabaja en construcción; problem: caídas frecuentes; implication: riesgo de daño y reemplazo'),null);
});

test('canonical persisted SPIN facts remain accepted',()=>{
  assert.equal(normalizeUseCaseSpinFact('uso:trabajo_construccion'),'uso:trabajo_construccion');
  assert.equal(normalizeUseCaseSpinFact('problema:caidas_frecuentes'),'problema:caidas_frecuentes');
  assert.equal(normalizeUseCaseSpinFact('implicacion:perdida_tiempo_interrupcion'),'implicacion:perdida_tiempo_interrupcion');
});

test('purchase remains false for a short affirmative unless the previous visible question was reservation',()=>{
  const previousFulfillment={lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE',lastAssistantMessage:'¿Prefieres envío o recogerlo en nuestro local?',purchaseSignal:false} as any;
  assert.equal(extractCommercialFacts('Sí',previousFulfillment).purchaseSignal,false);
  const previousReservation={lastNba:'SOFT_CLOSE',pendingCommercialAction:'SOFT_CLOSE',lastAssistantMessage:'¿Quieres que te lo reserve?',purchaseSignal:false} as any;
  assert.equal(extractCommercialFacts('Sí',previousReservation).purchaseSignal,true);
});

test('commercial write contract keeps a verified close executable',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Trabajo en construcción y ya rompí dos celulares.',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo_construccion',problem:'caidas_frecuentes'},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,
    resolvedProduct:'Armor 22',recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{shortName:'Armor 22',product:'Armor 22',price:1399,stock:9,currency:'PEN'} as any,
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'}],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'},
      {domain:'SQL',key:'PRECIO',value:'1399',productId:'P-ARMOR-22-256G',source:'TEST'},
      {domain:'SQL',key:'DISPONIBILIDAD',value:'9',productId:'P-ARMOR-22-256G',source:'TEST'},
    ],
  } as any);
  assert.equal(prepared.nextBestAction,'SOFT_CLOSE');
});

test('rugged pain keeps resistance certifications and translates them into FAB value',async()=>{
  const delegate={
    async write(input:any){
      return{text:String(input.directAnswer??''),model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};
    },
  };
  const provider=new FullRagLlmProvider(delegate as any);
  const verifiedFeatures=[
    {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'},
  ] as any;
  const result=await provider.write({
    message:'Ya mandé reparar mi celular dos veces por caídas.',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo_construccion',problem:'reparaciones_repetidas'},
    resolvedProduct:'Armor 22',recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{shortName:'Armor 22',product:'Armor 22',price:1399,stock:9,currency:'PEN'} as any,
    verifiedFeatures,
    verifiedFacts:[...verifiedFeatures,{domain:'SQL',key:'PRECIO',value:'1399',productId:'P-ARMOR-22-256G',source:'TEST'},{domain:'SQL',key:'DISPONIBILIDAD',value:'9',productId:'P-ARMOR-22-256G',source:'TEST'}] as any,
    finalExecutableNba:'SOFT_CLOSE',nextBestAction:'SOFT_CLOSE',
    directAnswer:'Armor 22 encaja para trabajo exigente.',
  } as any);
  assert.match(result.text,/IP68/i);
  assert.match(result.text,/IP69K/i);
  assert.match(result.text,/MIL-STD-810H/i);
  assert.match(result.text,/golpes|ca[ií]das/i);
  assert.match(result.text,/agua|polvo/i);
  assert.match(result.text,/S\/\s*1399/i);
  assert.match(result.text,/env[ií]o/i);
  assert.match(result.text,/recoger|recojo|local/i);
});

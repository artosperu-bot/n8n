import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { normalizeUseCaseSpinFact } from '../../src/conversation/commercial/UseCaseNormalizer.ts';

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

test('a fulfillment selection advances to reservation',()=>{
  const state={activeProduct:'Armor 22',pendingCommercialAction:'SOFT_CLOSE',lastNba:'SOFT_CLOSE'} as any;
  assert.equal(nextBestAction('POLICY',state),'SOFT_CLOSE');
  const plan=buildCommercialResponsePlan({
    message:'Envío a Ate.',intent:'POLICY',resolvedCurrentIntent:'POLICY',state,finalExecutableNba:'SOFT_CLOSE',
  } as any,'Sí, hacemos envíos.');
  assert.equal(plan.closePurpose,'RESERVATION');
  assert.match(buildCommercialResponseInstruction(plan),/reserv/i);
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

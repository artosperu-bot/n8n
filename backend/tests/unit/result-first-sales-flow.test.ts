import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBestAction } from '../../src/conversation/nba/NextBestAction.ts';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';

test('a known work pain with a resolved fit moves to price plus availability instead of forcing more SPIN',()=>{
  const state={
    activeProduct:'Armor 22',recommendedProduct:'Armor 22',
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    spinFacts:['uso:trabajo_construccion','problema:caidas_frecuentes'],
  } as any;
  assert.equal(nextBestAction('EVALUATE_USE',state),'SOFT_CLOSE');
});

test('an explicit recommendation with enough context can offer price plus availability as the next result',()=>{
  const state={
    activeProduct:'Armor 22',recommendedProduct:'Armor 22',
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
  } as any;
  assert.equal(nextBestAction('RECOMMEND',state),'SOFT_CLOSE');
});

test('pre-price soft close is executable from verified fit evidence without SQL price yet',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'Trabajo en construcción y ya rompí dos celulares.',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo_construccion',problem:'caidas_frecuentes'},
    decision:{nextBestAction:'SOFT_CLOSE'} as any,
    resolvedProduct:'Armor 22',recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'}],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'}],
  } as any);
  assert.equal(prepared.nextBestAction,'SOFT_CLOSE');
});

test('pain soft close requires human scene, natural persuasion and one price-availability micro-step',()=>{
  const plan=buildCommercialResponsePlan({
    message:'Trabajo en construcción y ya rompí dos celulares.',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'}],
    finalExecutableNba:'SOFT_CLOSE',
  } as any,'Armor 22 tiene resistencia a caídas de 1.5 m.');
  assert.equal(plan.closePurpose,'PRICE_AVAILABILITY');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/mini[- ]escena|escena cotidiana|visualiza/i);
  assert.match(instruction,/beneficio|vida real|tranquilidad|seguir con el mismo problema/i);
  assert.match(instruction,/precio y disponibilidad/i);
  assert.match(instruction,/1 o 2|uno o dos/i);
});

test('price and availability still move together to fulfillment after the offer',()=>{
  const plan=buildCommercialResponsePlan({
    message:'¿Cuánto está el Armor 22?',intent:'PRICE',resolvedCurrentIntent:'PRICE',
    state:{activeProduct:'Armor 22'},finalExecutableNba:'SOFT_CLOSE',
  } as any,'Armor 22 está a S/ 1399 y está disponible.');
  assert.equal(plan.closePurpose,'FULFILLMENT');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/precio y disponibilidad.*juntos|juntos/i);
  assert.match(instruction,/env[ií]o/i);
  assert.match(instruction,/recoger|recojo|local/i);
});

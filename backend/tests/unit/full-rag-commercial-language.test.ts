import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCommercialMove } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { buildColdRagComparison } from '../../src/conversation/commercial/FullRagComparison.ts';
import { applyFullRagWritePolicy } from '../../src/conversation/commercial/FullRagWritePolicy.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import type { CommercialMove } from '../../src/ports/LlmProvider.ts';

test('FULL RAG contextual FAB sounds like customer value, not evaluator language',()=>{
  const move:CommercialMove={action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'BATERIA',verifiedFacts:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh',productId:'P-ARMOR-22-256G',source:'TEST'}],relevantCustomerContext:{useCase:'trabajo en campo',problem:'pocas oportunidades de cargar',priorities:['batería'],budget:null,objection:null}};
  const text=renderCommercialMove(move,'CAPABILITY')??'';
  assert.match(text,/trabajo|campo|cargar|bater/i);assert.doesNotMatch(text,/ese dato (?:sí )?pesa|te ayuda a decidir|criterios ya confirmados|alineado con/i);
});

test('broad PRODUCT_INFO with no customer context opens one useful discovery step even if planner said ANSWER_ONLY',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'PRODUCT_INFO',currentNba:'ANSWER_ONLY',state:{priorities:[],spinFacts:[]},resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,verifiedAlternatives:0,relatedValueAvailable:true});
  assert.equal(result.candidateNba,'ASK_MISSING_FACT');
});

test('isolated capability question remains factual without artificial discovery',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'CAPABILITY',currentNba:'ANSWER_ONLY',state:{priorities:[],spinFacts:[]},resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,verifiedAlternatives:0});
  assert.equal(result.candidateNba,'ANSWER_ONLY');
});

test('broad product overview is a concise commercial summary instead of a six-section ficha dump',()=>{
  const facts:any[]=[
    {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'8 GB',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'RAM_VIRTUAL',value:'8 GB',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'ALMACENAMIENTO',value:'256 GB',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'CARGA_W',value:'33 W',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'CAMARA_PRINCIPAL_MP',value:'64 MP',productId:'P-22',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'PANTALLA_HZ',value:'120 Hz',productId:'P-22',source:'TEST'},
  ];
  const prepared=applyFullRagWritePolicy({message:'Hola, estoy viendo el Armor 22, qué tal es?',intent:'PRODUCT_INFO',state:{activeProduct:'Armor 22'},activeProduct:'Armor 22',resolvedProduct:'Armor 22',verifiedFacts:facts} as any);
  const answer=prepared.directAnswer??'';
  assert.match(answer,/Armor 22/i);
  assert.match(answer,/8 GB|6600 mAh|IP68/i);
  assert.doesNotMatch(answer,/cámaras ofrece|pantalla es/i);
  assert.ok(answer.length<500,`overview demasiado largo: ${answer.length}`);
});

test('cold comparison is composed from RAG facts instead of an empty fallback',()=>{
  const rows:any[]=[
    {productId:'P-X13',section:'BATERIA',source:'TEST',text:'Producto: Armor X13\nCapacidad de batería: 6320 mAh.\nCarga cableada: 10 W.'},
    {productId:'P-X13',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor X13\nCertificación IP68: Sí.\nCertificación IP69K: Sí.\nMIL-STD-810H: Sí.\nResistencia a caídas: 1.5 m.'},
    {productId:'P-22',section:'BATERIA',source:'TEST',text:'Producto: Armor 22\nCapacidad de batería: 6600 mAh.\nCarga cableada: 33 W.'},
    {productId:'P-22',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor 22\nCertificación IP68: Sí.\nCertificación IP69K: Sí.\nMIL-STD-810H: Sí.\nResistencia a caídas: 1.5 m.'},
  ];
  const answer=buildColdRagComparison(rows)??'';
  assert.match(answer,/Armor X13/i);assert.match(answer,/6320 mAh/i);assert.match(answer,/Armor 22/i);assert.match(answer,/6600 mAh/i);assert.match(answer,/IP68/i);assert.doesNotMatch(answer,/Ejecutar|COMPARE:/i);
});

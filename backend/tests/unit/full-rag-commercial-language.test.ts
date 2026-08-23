import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCommercialMove } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { buildColdRagComparison } from '../../src/conversation/commercial/FullRagComparison.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import type { CommercialMove } from '../../src/ports/LlmProvider.ts';

test('FULL RAG contextual FAB sounds like customer value, not evaluator language',()=>{
  const move:CommercialMove={action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'BATERIA',verifiedFacts:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'6600 mAh',productId:'P-ARMOR-22-256G',source:'TEST'}],relevantCustomerContext:{useCase:'trabajo en campo',problem:'pocas oportunidades de cargar',priorities:['batería'],budget:null,objection:null}};
  const text=renderCommercialMove(move,'CAPABILITY')??'';
  assert.match(text,/trabajo|campo|cargar|bater/i);assert.doesNotMatch(text,/ese dato (?:sí )?pesa|te ayuda a decidir|criterios ya confirmados|alineado con/i);
});

test('FULL RAG product overview keeps one useful discovery question instead of arbitrary related-value filler',()=>{
  const result=evaluatePostAnswerCommercialProgression({intent:'PRODUCT_INFO',currentNba:'ASK_MISSING_FACT',state:{priorities:[],spinFacts:[]},resolvedProduct:'Armor 22',verifiedCurrentAnswer:true,verifiedAlternatives:0,relatedValueAvailable:true});
  assert.equal(result.candidateNba,'ASK_MISSING_FACT');
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

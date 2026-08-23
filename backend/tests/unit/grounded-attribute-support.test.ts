import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';

test('drop-resistance answer includes verified certification support from the same attribute family',()=>{
  const answer=buildGroundedDirectAnswer({
    message:'¿Aguanta caídas?',
    intent:'CAPABILITY',
    attribute:'RESISTENCIA',
    resolvedProduct:'Armor X12 Pro',
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-X12',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-X12',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-X12',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',productId:'P-X12',source:'TEST'},
      {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'4 GB',productId:'P-X12',source:'TEST'},
    ],
  } as any)??'';

  assert.match(answer,/1\.5\s*m/i);
  assert.match(answer,/IP68/i);
  assert.match(answer,/IP69K/i);
  assert.match(answer,/MIL-STD-810H/i);
  assert.doesNotMatch(answer,/4\s*GB/i,'support facts must stay inside the active attribute family');
});

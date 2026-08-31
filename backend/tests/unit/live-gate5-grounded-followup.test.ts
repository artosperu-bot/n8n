import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';

test('pain referent follow-up uses prior water-dust problem to produce a grounded resistance benefit',()=>{
  const answer=buildGroundedDirectAnswer({
    message:'¿Qué tiene el Armor X13 para evitar que me vuelva a pasar?',
    intent:'EVALUATE_USE',
    attribute:null,
    resolvedProduct:'Armor X13',
    useCase:'trabajo_en_campo',
    problem:'exposicion_agua_polvo',
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',source:'qa'},
      {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',source:'qa'},
      {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',source:'qa'},
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',source:'qa'},
    ] as any,
  } as any);
  assert.ok(answer);
  assert.match(answer!,/Armor X13/i);
  assert.match(answer!,/IP68|IP69K|MIL-STD|ca[ií]d|resisten/i);
  assert.doesNotMatch(answer!,/No tengo confirmado/i);
});

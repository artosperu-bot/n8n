import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';

test('PRODUCT_INFO never returns raw structured RAG metadata as direct answer',()=>{
  const rag:any[]=[{
    text:[
      'Producto: Armor X13',
      'Producto ID: P-ARMOR-X13',
      'Código: P000048',
      'SKU: ARMOR-X13',
      'Sección: BATERIA',
      'Grupo técnico: bateria',
      'Título: Batería',
      'Contenido: Batería de 6320 mAh con carga de 10 W.',
    ].join('\n'),
    source:'SUPABASE_DOCUMENTS:BATERIA',section:'BATERIA',productId:'P-ARMOR-X13',domain:'PRODUCT',
  }];
  const verifiedFacts=normalizeEvidence({intent:'PRODUCT_INFO',rag});
  const answer=buildGroundedDirectAnswer({message:'Estoy viendo el Armor X13',intent:'PRODUCT_INFO',attribute:null,resolvedProduct:'Armor X13',rag,verifiedFacts});
  assert.equal(answer,'Batería de 6320 mAh con carga de 10 W.');
  assert.doesNotMatch(answer??'',/Producto ID|Código|SKU|Sección|Grupo técnico|Título|Contenido:/i);
});

test('exact weight extraction stays preferred over generic display fact',()=>{
  const rag:any[]=[{text:'Peso del producto: 324 g.',source:'SUPABASE_DOCUMENTS:FISICO',section:'FISICO',productId:'P-22',domain:'PRODUCT'}];
  const verifiedFacts=normalizeEvidence({intent:'CAPABILITY',rag});
  const answer=buildGroundedDirectAnswer({message:'¿Cuánto pesa el Armor 22?',intent:'CAPABILITY',attribute:'FISICO',resolvedProduct:'Armor 22',rag,verifiedFacts});
  assert.equal(answer,'Armor 22 pesa 324 g.');
});

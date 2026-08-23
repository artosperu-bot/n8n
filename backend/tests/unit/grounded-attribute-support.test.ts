import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';

const resistanceFacts:any[]=[
  {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'PROFUNDIDAD_IP68',value:'1.5 m',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'TIEMPO_IP68',value:'30 min',productId:'P-X12',source:'TEST'},
  {domain:'PRODUCT_RAG',key:'RAM_FISICA',value:'4 GB',productId:'P-X12',source:'TEST'},
];

test('resistance answer includes complete verified family without unrelated facts',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿Qué tan resistente es?',intent:'CAPABILITY',attribute:'RESISTENCIA',resolvedProduct:'Armor 22',verifiedFacts:resistanceFacts} as any)??'';
  assert.match(answer,/IP68/i);assert.match(answer,/IP69K/i);assert.match(answer,/MIL-STD-810H/i);assert.match(answer,/1\.5\s*m/i);assert.match(answer,/30\s*min/i);assert.doesNotMatch(answer,/4\s*GB/i);
});

test('camera answer reads naturally and groups main front and night cameras',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿Qué cámaras tiene el Armor 22?',intent:'CAPABILITY',attribute:'CAMARA',resolvedProduct:'Armor 22',verifiedFacts:[
    {domain:'PRODUCT_RAG',key:'CAMARA_PRINCIPAL_MP',value:'64 MP',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'CAMARA_FRONTAL_MP',value:'8 MP',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'VISION_NOCTURNA',value:'Sí',source:'TEST'},
    {domain:'PRODUCT_RAG',key:'CAMARA_NOCTURNA_MP',value:'64 MP',source:'TEST'},
  ]} as any)??'';
  assert.match(answer,/c[aá]mara principal de 64 MP/i);assert.match(answer,/frontal de 8 MP/i);assert.match(answer,/visi[oó]n nocturna de 64 MP/i);assert.doesNotMatch(answer,/Camara principal:/i);
});

test('NFC falls back to explicit RAG row truth when normalized fact is absent',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿El Armor 22 tiene NFC?',intent:'CAPABILITY',attribute:'NFC',resolvedProduct:'Armor 22',verifiedFacts:[],rag:[{domain:'PRODUCT',section:'CONECTIVIDAD',source:'TEST',text:'Características confirmadas. - NFC: Sí. - Bluetooth: Sí.'}]} as any)??'';
  assert.equal(answer,'Sí, Armor 22 tiene NFC.');
});

test('5G unknown does not dump 4G bands and states confirmed network safely',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿El Armor X13 tiene 5G?',intent:'CAPABILITY',attribute:'5G',resolvedProduct:'Armor X13',verifiedFacts:[{domain:'PRODUCT_RAG',key:'4G_LTE',value:'Sí',source:'TEST'}]} as any)??'';
  assert.match(answer,/No tengo 5G confirmado/i);assert.match(answer,/4G LTE/i);assert.doesNotMatch(answer,/B1|B2|B3|bandas/i);
});

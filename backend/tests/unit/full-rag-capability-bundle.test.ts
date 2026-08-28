import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
import { buildColdRagComparison } from '../../src/conversation/commercial/FullRagComparison.ts';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';

test('thermal yes answer includes the most useful verified thermal characteristics',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿El Armor 25T Pro tiene cámara térmica?',intent:'CAPABILITY',attribute:'TERMICA',resolvedProduct:'Armor 25T Pro',verifiedFacts:[],rag:[{domain:'PRODUCT',section:'TERMICA',source:'TEST',productId:'P-25T',text:'Producto: Armor 25T Pro\n- Cámara térmica: Sí.\n- Frecuencia térmica: 25 Hz.\n- Resolución térmica horizontal: 160 px.\n- Resolución térmica vertical: 120 px.\n- Temperatura máxima térmica: 550 °C.\n- Temperatura mínima térmica: -10 °C.\n- Aplicación térmica: ThermoVue App.'}]} as any)??'';
  assert.match(answer,/c[aá]mara t[eé]rmica/i);assert.match(answer,/25\s*Hz/i);assert.match(answer,/160\s*[x×]\s*120/i);assert.match(answer,/-10\s*°?C/i);assert.match(answer,/550\s*°?C/i);assert.match(answer,/ThermoVue/i);
});

test('NFC yes answer may add useful same-capability detail but not unrelated specs',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿El Armor 22 tiene NFC?',intent:'CAPABILITY',attribute:'NFC',resolvedProduct:'Armor 22',verifiedFacts:[],rag:[{domain:'PRODUCT',section:'CONECTIVIDAD',source:'TEST',productId:'P-22',text:'- NFC: Sí.\n- Google Pay: Sí.\n- Bluetooth: Sí.\n- Versión Bluetooth: 5.2.\n- Wi-Fi 5 GHz: Sí.'}]} as any)??'';
  assert.match(answer,/NFC/i);assert.match(answer,/Google Pay/i);assert.doesNotMatch(answer,/Bluetooth 5\.2/i);assert.doesNotMatch(answer,/Wi-?Fi 5 GHz/i);
});

test('gaming use retrieves performance memory display and battery evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'gaming',problem:null,priorities:[]} as any);
  assert.ok(sections.includes('RENDIMIENTO'));assert.ok(sections.includes('MEMORIA'));assert.ok(sections.includes('PANTALLA'));assert.ok(sections.includes('BATERIA'));
});

test('field work use retrieves resistance and battery evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'trabajo_en_campo',problem:null,priorities:[]} as any);
  assert.ok(sections.includes('RESISTENCIA'));assert.ok(sections.includes('BATERIA'));
});

test('delivery use retrieves battery positioning and network evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'delivery',problem:null,priorities:[]} as any);
  assert.ok(sections.includes('BATERIA'));assert.ok(sections.includes('POSICIONAMIENTO'));assert.ok(sections.includes('REDES'));
});

test('gaming answer explains suitability from verified hardware without inventing FPS',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿Con este puedo jugar Free Fire?',intent:'EVALUATE_USE',attribute:null,resolvedProduct:'Armor 22',useCase:'gaming',verifiedFacts:[],rag:[
    {domain:'PRODUCT',section:'RENDIMIENTO',source:'TEST',text:'Producto: Armor 22\nProcesador: MediaTek Helio G96.'},
    {domain:'PRODUCT',section:'MEMORIA',source:'TEST',text:'Producto: Armor 22\nRAM física: 8 GB.\nAlmacenamiento interno: 256 GB.'},
    {domain:'PRODUCT',section:'PANTALLA',source:'TEST',text:'Producto: Armor 22\nFrecuencia de refresco: 120 Hz.'},
    {domain:'PRODUCT',section:'BATERIA',source:'TEST',text:'Producto: Armor 22\nCapacidad de batería: 6600 mAh.'},
  ]} as any)??'';
  assert.match(answer,/Helio G96/i);assert.match(answer,/8 GB/i);assert.match(answer,/120 Hz/i);assert.match(answer,/6600 mAh/i);assert.match(answer,/Free Fire/i);assert.match(answer,/benchmark|FPS/i);assert.doesNotMatch(answer,/60 FPS|90 FPS|120 FPS/i);
});

test('field work answer prioritizes ruggedness and battery rather than unrelated camera facts',()=>{
  const answer=buildGroundedDirectAnswer({message:'¿El Armor 22 me sirve para trabajo en campo?',intent:'EVALUATE_USE',attribute:null,resolvedProduct:'Armor 22',useCase:'trabajo_en_campo',verifiedFacts:[],rag:[
    {domain:'PRODUCT',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor 22\nCertificación IP68: Sí.\nCertificación IP69K: Sí.\nMIL-STD-810H: Sí.\nResistencia a caídas: 1.5 m.'},
    {domain:'PRODUCT',section:'BATERIA',source:'TEST',text:'Producto: Armor 22\nCapacidad de batería: 6600 mAh.\nCarga cableada: 33 W.'},
    {domain:'PRODUCT',section:'CAMARA',source:'TEST',text:'Producto: Armor 22\nCámara principal: 64 MP.'},
  ]} as any)??'';
  assert.match(answer,/IP68/i);assert.match(answer,/IP69K/i);assert.match(answer,/MIL-STD-810H/i);assert.match(answer,/6600 mAh/i);assert.match(answer,/33 W/i);assert.doesNotMatch(answer,/64 MP/i);
});

test('battery comparison focuses on battery and gives a grounded numeric conclusion',()=>{
  const rows:any[]=[
    {productId:'P-X13',section:'BATERIA',source:'TEST',text:'Producto: Armor X13\nCapacidad de batería: 6320 mAh.\nCarga cableada: 10 W.'},
    {productId:'P-X13',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor X13\nResistencia a caídas: 1.5 m.'},
    {productId:'P-22',section:'BATERIA',source:'TEST',text:'Producto: Armor 22\nCapacidad de batería: 6600 mAh.\nCarga cableada: 33 W.'},
    {productId:'P-22',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor 22\nResistencia a caídas: 1.5 m.'},
  ];
  const answer=(buildColdRagComparison as any)(rows,{message:'Entre el X13 y el Armor 22 cuál tiene mejor batería?',attributes:['BATERIA']})??'';
  assert.match(answer,/6320 mAh/i);assert.match(answer,/6600 mAh/i);assert.match(answer,/33 W/i);assert.match(answer,/Armor 22/i);assert.match(answer,/mayor bater[ií]a|m[aá]s capacidad/i);assert.doesNotMatch(answer,/ca[ií]das/i);
});

test('gaming comparison uses performance memory and display instead of unrelated families',()=>{
  const rows:any[]=[
    {productId:'P-X13',section:'RENDIMIENTO',source:'TEST',text:'Producto: Armor X13\nProcesador: MediaTek Helio G36.'},
    {productId:'P-X13',section:'MEMORIA',source:'TEST',text:'Producto: Armor X13\nRAM física: 6 GB.'},
    {productId:'P-X13',section:'PANTALLA',source:'TEST',text:'Producto: Armor X13\nFrecuencia de refresco: 60 Hz.'},
    {productId:'P-22',section:'RENDIMIENTO',source:'TEST',text:'Producto: Armor 22\nProcesador: MediaTek Helio G96.'},
    {productId:'P-22',section:'MEMORIA',source:'TEST',text:'Producto: Armor 22\nRAM física: 8 GB.'},
    {productId:'P-22',section:'PANTALLA',source:'TEST',text:'Producto: Armor 22\nFrecuencia de refresco: 120 Hz.'},
    {productId:'P-22',section:'CAMARA',source:'TEST',text:'Producto: Armor 22\nCámara principal: 64 MP.'},
  ];
  const answer=(buildColdRagComparison as any)(rows,{message:'Cuál de los dos es mejor para jugar Free Fire?',attributes:['RENDIMIENTO']})??'';
  assert.match(answer,/Helio G36/i);assert.match(answer,/Helio G96/i);assert.match(answer,/6 GB/i);assert.match(answer,/8 GB/i);assert.match(answer,/60 Hz/i);assert.match(answer,/120 Hz/i);assert.doesNotMatch(answer,/64 MP/i);
});

test('commercial facts preserve thermal and NFC as explicit hard priorities',()=>{
  const thermal=extractCommercialFacts('Necesito un celular con cámara térmica, cuál tienen?',{} as any);assert.ok(thermal.priorities.includes('termica'));
  const nfc=extractCommercialFacts('Necesito NFC sí o sí',{} as any);assert.ok(nfc.priorities.includes('nfc'));
});

test('gaming language is preserved as a genuine use case',()=>{const facts=extractCommercialFacts('Lo quiero para jugar Free Fire',{} as any);assert.equal(facts.useCase,'gaming');});

test('natural product info language maps to PRODUCT_INFO',()=>{assert.equal(resolveIntentPlan('Buenas, qué tal es el Armor X13?').primary,'PRODUCT_INFO');});

test('battery question between two models remains comparison',()=>{assert.equal(resolveIntentPlan('Entre el X13 y el Armor 22 cuál tiene mejor batería?').primary,'COMPARE');});

test('dual SIM answer uses SIM-family evidence instead of unrelated 4G claim',()=>{
  const answer=buildGroundedDirectAnswer({message:'El X13 es dual SIM?',intent:'CAPABILITY',attribute:'SIM',resolvedProduct:'Armor X13',verifiedFacts:[],rag:[{domain:'PRODUCT',section:'SIM',source:'TEST',text:'- Cantidad de SIM: 2 unidades.\n- Tipo de SIM: Nano-SIM.\n- Dual 4G: Sí.\n- Cantidad total de ranuras: 3 unidades.'}]} as any)??'';
  assert.match(answer,/Dual SIM/i);assert.match(answer,/2/i);assert.match(answer,/Nano-SIM/i);assert.doesNotMatch(answer,/tiene 4G LTE/i);
});

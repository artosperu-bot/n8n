import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
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

test('gaming use retrieves performance memory and display evidence',()=>{
  const sections=productEvidenceSections({primary:'EVALUATE_USE'}, {useCase:'jugar Free Fire',problem:null,priorities:[]} as any);
  assert.ok(sections.includes('RENDIMIENTO'));assert.ok(sections.includes('MEMORIA'));assert.ok(sections.includes('PANTALLA'));
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

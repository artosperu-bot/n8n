import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductFactStores } from '../../src/conversation/commercial/FullRagFactKernel.ts';
import { buildFullRagAnswer } from '../../src/conversation/commercial/FullRagAnswerKernel.ts';

const rows:any[]=[
  {domain:'PRODUCT',productId:'P-22',section:'MEMORIA',source:'TEST',text:'Producto: Armor 22\nRAM física: 8 GB.\nRAM virtual máxima: 8 GB.\nAlmacenamiento interno: 256 GB.'},
  {domain:'PRODUCT',productId:'P-22',section:'BATERIA',source:'TEST',text:'Producto: Armor 22\nCapacidad de batería: 6600 mAh.\nCarga cableada: 33 W.'},
  {domain:'PRODUCT',productId:'P-22',section:'RESISTENCIA',source:'TEST',text:'Producto: Armor 22\nCertificación IP68: Sí.\nCertificación IP69K: Sí.\nMIL-STD-810H: Sí.\nResistencia a caídas: 1.5 m.\nProfundidad IP68: 1.5 m.\nTiempo IP68: 30 min.'},
  {domain:'PRODUCT',productId:'P-22',section:'CAMARA',source:'TEST',text:'Producto: Armor 22\nCámara principal: 64 MP.\nSensor cámara principal: Sony IMX686.\nCámara frontal: 8 MP.\nVisión nocturna: 64 MP.\nSensor cámara nocturna: OV64B.\nResolución máxima de video: 2K.'},
  {domain:'PRODUCT',productId:'P-22',section:'CONECTIVIDAD',source:'TEST',text:'Producto: Armor 22\nNFC: Sí.\nGoogle Pay: Sí.\nVersión Bluetooth: 5.2.\nWi-Fi 5 GHz: Sí.\nEstándares Wi-Fi: 802.11 a/b/g/n/ac.'},
  {domain:'PRODUCT',productId:'P-22',section:'PANTALLA',source:'TEST',text:'Producto: Armor 22\nPantalla: 6.58 pulgadas.\nFrecuencia de refresco: 120 Hz.'},
  {domain:'PRODUCT',productId:'P-22',section:'RENDIMIENTO',source:'TEST',text:'Producto: Armor 22\nProcesador: MediaTek Helio G96.'},
  {domain:'PRODUCT',productId:'P-X13',section:'BATERIA',source:'TEST',text:'Producto: Armor X13\nCapacidad de batería: 6320 mAh.\nCarga cableada: 10 W.'},
  {domain:'PRODUCT',productId:'P-X13',section:'MEMORIA',source:'TEST',text:'Producto: Armor X13\nRAM física: 6 GB.\nAlmacenamiento interno: 64 GB.'},
  {domain:'PRODUCT',productId:'P-X13',section:'PANTALLA',source:'TEST',text:'Producto: Armor X13\nFrecuencia de refresco: 60 Hz.'},
  {domain:'PRODUCT',productId:'P-X13',section:'RENDIMIENTO',source:'TEST',text:'Producto: Armor X13\nProcesador: MediaTek Helio G36.'},
  {domain:'PRODUCT',productId:'P-25T',section:'TERMICA',source:'TEST',text:'Producto: Armor 25T Pro\nCámara térmica: Sí.\nFrecuencia térmica: 25 Hz.\nResolución térmica horizontal: 160 px.\nResolución térmica vertical: 120 px.\nTemperatura mínima térmica: -10 °C.\nTemperatura máxima térmica: 550 °C.\nAplicación térmica: ThermoVue App.'},
];

function input(overrides:any):any{return{message:'',intent:'CAPABILITY',state:{priorities:[]},rag:rows,verifiedFacts:[],...overrides};}

test('fact kernel extracts stable typed product facts',()=>{
  const stores=buildProductFactStores(rows);const armor=stores.find(s=>s.product==='Armor 22');assert.ok(armor);
  assert.equal(armor!.memory.ramPhysical,'8 GB');assert.equal(armor!.battery.capacity,'6600 mAh');assert.equal(armor!.resistance.ip68,true);assert.equal(armor!.camera.mainSensor,'Sony IMX686');assert.equal(armor!.connectivity.nfc,true);assert.equal(armor!.performance.processor,'MediaTek Helio G96');
});

test('NFC answer stays inside the NFC capability bundle',()=>{
  const result=buildFullRagAnswer(input({message:'El Armor 22 tiene NFC?',intent:'CAPABILITY',attribute:'NFC',resolvedProduct:'Armor 22'}));assert.ok(result);
  assert.match(result!.answer,/NFC/i);assert.match(result!.answer,/Google Pay/i);assert.doesNotMatch(result!.answer,/Bluetooth|Wi.?Fi/i);
});

test('resistance answer returns certifications plus drop and immersion evidence',()=>{
  const result=buildFullRagAnswer(input({message:'Qué tan resistente es el Armor 22?',intent:'CAPABILITY',attribute:'RESISTENCIA',resolvedProduct:'Armor 22'}));assert.ok(result);
  assert.match(result!.answer,/IP68/i);assert.match(result!.answer,/IP69K/i);assert.match(result!.answer,/MIL-STD-810H/i);assert.match(result!.answer,/1\.5 m/i);assert.match(result!.answer,/30 min/i);
});

test('camera answer groups camera facts naturally without raw labels',()=>{
  const result=buildFullRagAnswer(input({message:'Qué cámaras tiene el Armor 22?',intent:'CAPABILITY',attribute:'CAMARA',resolvedProduct:'Armor 22'}));assert.ok(result);
  assert.match(result!.answer,/64 MP/i);assert.match(result!.answer,/Sony IMX686/i);assert.match(result!.answer,/OV64B/i);assert.match(result!.answer,/2K/i);assert.doesNotMatch(result!.answer,/Cámara principal:/i);
});

test('gaming suitability uses verified processor RAM display and avoids invented FPS',()=>{
  const result=buildFullRagAnswer(input({message:'Con el Armor 22 puedo jugar Free Fire?',intent:'EVALUATE_USE',resolvedProduct:'Armor 22',useCase:'gaming'}));assert.ok(result);
  assert.match(result!.answer,/Helio G96/i);assert.match(result!.answer,/8 GB/i);assert.match(result!.answer,/120 Hz/i);assert.match(result!.answer,/Free Fire/i);assert.match(result!.answer,/benchmark|FPS/i);assert.doesNotMatch(result!.answer,/60 FPS|90 FPS|120 FPS/i);
});

test('battery comparison computes a grounded winner and omits unrelated camera facts',()=>{
  const result=buildFullRagAnswer(input({message:'Entre el X13 y el Armor 22 cuál tiene mejor batería?',intent:'COMPARE',decision:{attributes:['BATERIA']}}));assert.ok(result);
  assert.match(result!.answer,/6320/i);assert.match(result!.answer,/6600/i);assert.match(result!.answer,/33/i);assert.match(result!.answer,/Armor 22 tiene más capacidad/i);assert.doesNotMatch(result!.answer,/Sony|64 MP/i);
});

test('gaming comparison uses processor RAM and display only',()=>{
  const result=buildFullRagAnswer(input({message:'Entre el X13 y el Armor 22 cuál conviene más para jugar Free Fire?',intent:'COMPARE',decision:{attributes:['RENDIMIENTO']},useCase:'gaming'}));assert.ok(result);
  assert.match(result!.answer,/Helio G36/i);assert.match(result!.answer,/Helio G96/i);assert.match(result!.answer,/6 GB/i);assert.match(result!.answer,/8 GB/i);assert.match(result!.answer,/60 Hz/i);assert.match(result!.answer,/120 Hz/i);assert.doesNotMatch(result!.answer,/64 MP|Sony/i);
});

test('thermal recommendation prefers the store that actually has thermal capability',()=>{
  const result=buildFullRagAnswer(input({message:'Necesito un celular con cámara térmica, cuál tienen?',intent:'RECOMMEND',recommendedProduct:'Armor 22',priorities:['termica']}));assert.ok(result);
  assert.match(result!.answer,/Armor 25T Pro/i);assert.match(result!.answer,/25 Hz/i);assert.match(result!.answer,/160×120/i);assert.doesNotMatch(result!.answer,/Armor 22:.*térmica/i);
});

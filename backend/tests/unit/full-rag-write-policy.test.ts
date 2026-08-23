import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFullRagWritePolicy } from '../../src/conversation/commercial/FullRagWritePolicy.ts';

const f=(key:string,value:string)=>({domain:'PRODUCT_RAG' as const,key,value,productId:'P-22',source:'TEST'});
const facts=[f('RAM_FISICA','8 GB'),f('RAM_VIRTUAL','hasta 8 GB'),f('ALMACENAMIENTO','256 GB'),f('BATERIA_MAH','6600 mAh'),f('CARGA_W','33 W'),f('IP68','Sí'),f('IP69K','Sí'),f('MIL_STD_810H','Sí'),f('CAMARA_PRINCIPAL_MP','64 MP'),f('VISION_NOCTURNA','Sí'),f('PANTALLA_HZ','120 Hz'),f('PROCESADOR','MediaTek Helio G96')];

test('product info becomes a five-plus-highlight overview',()=>{
  const input:any={message:'Háblame del Armor 22',intent:'PRODUCT_INFO',state:{},resolvedProduct:'Armor 22',verifiedFacts:facts,verifiedFeatures:facts,nextBestAction:'ANSWER_ONLY'};
  const out=applyFullRagWritePolicy(input);
  assert.equal(out.presentationMode,'PRODUCT_OVERVIEW');
  assert.ok((out.productHighlights?.length??0)>=5);
  assert.match(out.directAnswer??'',/RAM física/i);
  assert.match(out.directAnswer??'',/RAM virtual/i);
  assert.match(out.directAnswer??'',/Batería/i);
});

test('single capability stays focused and does not become overview',()=>{
  const input:any={message:'¿Tiene NFC?',intent:'CAPABILITY',attribute:'NFC',state:{},resolvedProduct:'Armor 22',verifiedFacts:[...facts,f('NFC','Sí')],directAnswer:'Sí, tiene NFC.',nextBestAction:'ANSWER_ONLY'};
  const out=applyFullRagWritePolicy(input);
  assert.equal(out.presentationMode,'ATTRIBUTE');
  assert.equal(out.directAnswer,'Sí, tiene NFC.');
  assert.ok((out.productHighlights?.length??0)<=2);
});

test('institutional response is not rewritten as product overview',()=>{
  const input:any={message:'¿Dónde queda la tienda?',intent:'POLICY',state:{},verifiedFacts:[{domain:'INSTITUTIONAL_RAG',key:'DIRECCION',value:'Av. Honorio Delgado 224',source:'TEST'}],directAnswer:'Av. Honorio Delgado 224',nextBestAction:'ANSWER_ONLY'};
  const out=applyFullRagWritePolicy(input);
  assert.equal(out.presentationMode,'INSTITUTIONAL');
  assert.equal(out.directAnswer,'Av. Honorio Delgado 224');
});

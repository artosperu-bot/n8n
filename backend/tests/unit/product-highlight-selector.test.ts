import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProductHighlights } from '../../src/conversation/commercial/ProductHighlightSelector.ts';

const fact=(key:string,value:string)=>({domain:'PRODUCT_RAG' as const,key,value,productId:'P-22',source:'TEST'});
const facts=[
  fact('RAM_FISICA','8 GB'),fact('RAM_VIRTUAL','hasta 8 GB'),fact('ALMACENAMIENTO','256 GB'),
  fact('BATERIA_MAH','6600 mAh'),fact('CARGA_W','33 W'),
  fact('IP68','Sí'),fact('IP69K','Sí'),fact('MIL_STD_810H','Sí'),fact('RESISTENCIA_CAIDAS','1.5 m'),
  fact('CAMARA_PRINCIPAL_MP','64 MP'),fact('VISION_NOCTURNA','Sí'),fact('CAMARA_NOCTURNA_MP','64 MP'),
  fact('PANTALLA_HZ','120 Hz'),fact('PANTALLA_TAMANO','6.58 pulgadas'),
  fact('PROCESADOR','MediaTek Helio G96'),fact('NFC','Sí'),
];

test('overview selects at least five diverse families when evidence exists',()=>{
  const result=selectProductHighlights({intent:'PRODUCT_INFO',attribute:null,facts});
  assert.ok(result.length>=5);
  assert.equal(new Set(result.map(x=>x.family)).size,result.length);
  assert.ok(result.some(x=>x.family==='MEMORY'));
  assert.ok(result.some(x=>x.family==='BATTERY'));
  assert.ok(result.some(x=>x.family==='RESISTANCE'));
  assert.ok(result.some(x=>x.family==='CAMERA'));
  assert.ok(result.some(x=>x.family==='DISPLAY'));
});

test('memory highlight combines physical virtual RAM and storage',()=>{
  const result=selectProductHighlights({intent:'PRODUCT_INFO',attribute:null,facts});
  const memory=result.find(x=>x.family==='MEMORY');
  assert.match(memory?.summary??'',/8 GB de RAM física/i);
  assert.match(memory?.summary??'',/hasta 8 GB de RAM virtual/i);
  assert.match(memory?.summary??'',/256 GB/i);
});

test('attribute mode stays focused instead of returning an overview dump',()=>{
  const result=selectProductHighlights({intent:'CAPABILITY',attribute:'NFC',facts});
  assert.ok(result.length<=2);
  assert.equal(result[0]?.family,'CONNECTIVITY');
  assert.match(result[0]?.summary??'',/NFC/i);
});

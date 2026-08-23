import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';

const row=(section:string,text:string)=>({text,source:`SUPABASE_VECTOR_DOCUMENTS:${section}`,section,productId:'P-22',domain:'PRODUCT' as const});

test('full RAG normalizer extracts overview-grade atomic facts',()=>{
  const facts=normalizeEvidence({intent:'PRODUCT_INFO',rag:[
    row('MEMORIA','RAM física: 8 GB. RAM virtual máxima: 8 GB. Almacenamiento interno: 256 GB. microSD máxima: 512 GB.'),
    row('BATERIA','Batería: 6600 mAh. Carga cableada: 33 W.'),
    row('RESISTENCIA','IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí. Resistencia a caídas: 1.5 m.'),
    row('CAMARA','Cámara principal: 64 MP. Visión nocturna: 64 MP. Cámara frontal: 8 MP.'),
    row('PANTALLA','Pantalla: 6.58 pulgadas. Frecuencia: 120 Hz. Resolución: 1080 x 2408 px.'),
    row('RENDIMIENTO','Procesador: MediaTek Helio G96.'),
    row('CONECTIVIDAD','NFC: Sí. Bluetooth: Sí. Versión Bluetooth: 5.2.'),
  ]});
  const byKey=new Map(facts.map(f=>[f.key,f.value]));
  assert.equal(byKey.get('RAM_FISICA'),'8 GB');
  assert.equal(byKey.get('RAM_VIRTUAL'),'hasta 8 GB');
  assert.equal(byKey.get('ALMACENAMIENTO'),'256 GB');
  assert.equal(byKey.get('BATERIA_MAH'),'6600 mAh');
  assert.equal(byKey.get('CARGA_W'),'33 W');
  assert.equal(byKey.get('CAMARA_PRINCIPAL_MP'),'64 MP');
  assert.equal(byKey.get('VISION_NOCTURNA'),'Sí');
  assert.equal(byKey.get('PANTALLA_HZ'),'120 Hz');
  assert.equal(byKey.get('PANTALLA_TAMANO'),'6.58 pulgadas');
  assert.equal(byKey.get('PROCESADOR'),'MediaTek Helio G96');
  assert.equal(byKey.get('NFC'),'Sí');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvidence } from '../../src/conversation/evidence/EvidenceNormalizer.ts';

const quote:any={ product:'Armor 22', shortName:'Armor 22', productRagId:'P-ARMOR-22-256G', price:1399, stock:9, currency:'PEN', source:'SQL_BRIDGE' };

test('normalizer does not leak unsolicited price or raw stock', () => {
  const facts=normalizeEvidence({intent:'PRODUCT_INFO',quote,rag:[]});
  assert.ok(facts.some(x=>x.key==='PRODUCTO'));
  assert.equal(facts.some(x=>x.key==='PRECIO'),false);
  assert.equal(facts.some(x=>/\b9\b/.test(x.value)),false);
});

test('price and stock are exposed only through authorized compact facts', () => {
  const price=normalizeEvidence({intent:'PRICE',quote,rag:[]});
  assert.equal(price.find(x=>x.key==='PRECIO')?.value,'PEN 1399.00');
  const stock=normalizeEvidence({intent:'STOCK',quote,rag:[]});
  assert.equal(stock.find(x=>x.key==='DISPONIBILIDAD')?.value,'DISPONIBLE');
  assert.equal(stock.some(x=>/\b9\b/.test(x.value)),false);
});

test('RAG evidence is compacted and keeps product/domain provenance', () => {
  const long='Batería de 6600 mAh. '.repeat(40);
  const facts=normalizeEvidence({intent:'CAPABILITY',quote:null,rag:[{text:long,source:'SUPABASE_DOCUMENTS:BATERIA',section:'BATERIA',productId:'P-ARMOR-22-256G',domain:'PRODUCT'}]});
  assert.equal(facts[0]?.domain,'PRODUCT_RAG');
  assert.equal(facts[0]?.key,'BATERIA');
  assert.equal(facts[0]?.productId,'P-ARMOR-22-256G');
  assert.ok((facts[0]?.value.length??0)<=320);
});

test('structured RAG envelope metadata is not promoted into display fact value',()=>{
  const raw=[
    'Producto: Armor X13',
    'Producto ID: P-ARMOR-X13',
    'Código: P000048',
    'SKU: ARMOR-X13',
    'Sección: BATERIA',
    'Grupo técnico: bateria',
    'Título: Batería',
    'Contenido: Batería de 6320 mAh con carga de 10 W.',
  ].join('\n');
  const facts=normalizeEvidence({intent:'PRODUCT_INFO',rag:[{text:raw,source:'SUPABASE_DOCUMENTS:BATERIA',section:'BATERIA',productId:'P-ARMOR-X13',domain:'PRODUCT'}]});
  const battery=facts.find(x=>x.domain==='PRODUCT_RAG'&&x.key==='BATERIA');
  assert.equal(battery?.value,'Batería de 6320 mAh con carga de 10 W.');
  assert.doesNotMatch(battery?.value??'',/Producto ID|Código|SKU|Sección|Grupo técnico|Título|Contenido:/i);
});

test('structured RAG keyword footer is never promoted into customer-facing display text',()=>{
  const raw=[
    'Producto: Armor X13',
    'Producto ID: P-ARMOR-X13',
    'Código: P000048',
    'SKU: ARMOR-X13',
    'Sección: PANTALLA',
    'Grupo técnico: pantalla',
    'Título: Pantalla',
    'Contenido: Pantalla de 6.52 pulgadas, HD+, IPS LCD, 720 x 1600 px.',
    'Palabras clave: pantalla_tamano_pulgadas, pantalla_resolucion_clase, pantalla_tipo',
  ].join('\n');
  const facts=normalizeEvidence({intent:'PRODUCT_INFO',rag:[{text:raw,source:'SUPABASE_DOCUMENTS:PANTALLA',section:'PANTALLA',productId:'P-ARMOR-X13',domain:'PRODUCT'}]});
  const display=facts.find(x=>x.domain==='PRODUCT_RAG'&&x.key==='PANTALLA')?.value??'';
  assert.match(display,/6\.52 pulgadas/i);
  assert.doesNotMatch(display,/Palabras clave|pantalla_tamano_pulgadas|pantalla_resolucion_clase/i);
});

test('RAM projection accepts physical and maximum virtual values from authority wording',()=>{
  const facts=normalizeEvidence({intent:'CAPABILITY',rag:[{text:'RAM física: 8 GB. RAM virtual máxima: 8 GB.',source:'TEST:MEMORIA',section:'MEMORIA',productId:'P-22',domain:'PRODUCT'}]});
  assert.equal(facts.find(x=>x.key==='RAM_FISICA')?.value,'8 GB');
  assert.equal(facts.find(x=>x.key==='RAM_VIRTUAL')?.value,'hasta 8 GB');
});

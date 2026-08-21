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

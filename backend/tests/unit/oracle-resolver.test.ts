import test from 'node:test';
import assert from 'node:assert/strict';
import { OracleResolver } from '../../qa/oracle/OracleResolver.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';

const oracle=new OracleResolver({erp:new FakeErpRepository(),rag:new FakeRagRepository()});

test('oracle builds price truth from ERP without chatbot output',async()=>{
  const card=await oracle.resolve({message:'¿Cuánto cuesta el Armor X13?',spec:{domain:'SQL',intentClass:'PRICE',product:'Armor X13'}});
  assert.equal(card.expectedProductId,'P-ARMOR-X13');
  assert.ok(card.allowedFacts.some(x=>x.includes('PRECIO=PEN 899.00')));
  assert.equal(card.authoritativeDomain,'SQL');
});

test('oracle builds product technical truth by canonical product id and sections',async()=>{
  const card=await oracle.resolve({message:'¿Tiene NFC el Armor X13?',spec:{domain:'PRODUCT_RAG',intentClass:'CAPABILITY',product:'Armor X13',sections:['CONECTIVIDAD','FUNCIONES']}});
  assert.equal(card.expectedProductId,'P-ARMOR-X13');
  assert.ok(card.sourceRefs.some(x=>x.includes('CONECTIVIDAD')));
  assert.equal(card.authoritativeDomain,'PRODUCT_RAG');
});

test('oracle resolves every product in a comparison as one authoritative set',async()=>{
  const card=await oracle.resolve({
    message:'Compara Armor X13 y Armor 22',
    spec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['BATERIA']},
  });
  assert.deepEqual(card.expectedProducts,[
    {id:'P-ARMOR-X13',name:'Armor X13'},
    {id:'P-ARMOR-22-256G',name:'Armor 22'},
  ]);
  assert.ok(card.sourceRefs.some(x=>x.includes('BATERIA')));
  assert.ok(card.allowedFacts.some(x=>x.includes('P-ARMOR-X13')));
  assert.ok(card.allowedFacts.some(x=>x.includes('P-ARMOR-22-256G')));
  assert.ok(card.allowedFacts.some(x=>x.startsWith('PANTALLA=')&&x.includes('P-ARMOR-22-256G')),'incluye pantalla recuperable del producto B');
  assert.ok(card.allowedFacts.some(x=>x.startsWith('MEMORIA=')&&x.includes('P-ARMOR-X13')),'incluye memoria recuperable del producto A');
  assert.ok(card.allowedFacts.some(x=>x.startsWith('FISICO=')&&x.includes('P-ARMOR-X13')),'incluye físico del producto A');
  assert.ok(card.allowedFacts.some(x=>x.startsWith('FISICO=')&&x.includes('P-ARMOR-22-256G')),'incluye físico del producto B');
});

test('oracle keeps policy and handoff domains independent',async()=>{
  const policy=await oracle.resolve({message:'¿Cuánto demora el envío a Lima?',spec:{domain:'INSTITUTIONAL_RAG',intentClass:'POLICY'}});
  assert.equal(policy.authoritativeDomain,'INSTITUTIONAL_RAG');
  assert.ok(policy.allowedFacts.length>0);
  const handoff=await oracle.resolve({message:'Ya quiero comprarlo',spec:{domain:'HANDOFF',intentClass:'PURCHASE',requiresHandoff:true,expectedNba:'ASSISTED_HANDOFF'}});
  assert.equal(handoff.requiresHandoff,true);
  assert.equal(handoff.expectedNbaClass,'ASSISTED_HANDOFF');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider{return {async write(){return {text,model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};}
const base:any={message:'quiero uno resistente',intent:'RECOMMEND',state:{},decision:null,deterministicAnswer:'x'};

test('rejects robotic evidence/catalog meta-language from customer-facing writer',async()=>{
  const r=await safeWrite(llm('Según el catálogo verificado, esta es la mejor opción.'),base,'Te recomiendo esta opción por su resistencia confirmada.');
  assert.equal(r.answer,'Te recomiendo esta opción por su resistencia confirmada.');
  assert.equal(r.fallback.delivered,false);
  assert.equal(r.fallback.error,'ROBOTIC_META_LANGUAGE');
});

test('rejects absolute superlative when only one product has evidence',async()=>{
  const r=await safeWrite(llm('Es el más resistente que tenemos.'),{
    ...base,
    rag:[{text:'IP68: Sí',source:'TEST',productId:'P-A',section:'RESISTENCIA',domain:'PRODUCT'}],
  },'Es una opción resistente; puedo compararla con las demás si quieres.');
  assert.equal(r.fallback.error,'UNSUPPORTED_SUPERLATIVE');
});

test('allows a direct benefit-oriented recommendation without robotic filler',async()=>{
  const r=await safeWrite(llm('Para trabajo en campo te conviene priorizar resistencia y batería; este modelo encaja bien por esos dos puntos.'),{
    ...base,
    rag:[{text:'resistencia y batería confirmadas',source:'TEST',productId:'P-A',section:'RESISTENCIA',domain:'PRODUCT'}],
  },'fallback');
  assert.equal(r.fallback.delivered,true);
  assert.match(r.answer,/trabajo en campo/i);
});

test('ANSWER_ONLY keeps the grounded answer and removes an appended follow-up question',async()=>{
  const r=await safeWrite(llm('Sí, tiene NFC. ¿Quieres que te diga el precio?'),{
    ...base,intent:'CAPABILITY',nextBestAction:'ANSWER_ONLY',finalExecutableNba:'ANSWER_ONLY',executableNba:'ANSWER_ONLY',directAnswer:'Sí, tiene NFC.',commercialContractPrepared:true,
  } as any,'Sí, tiene NFC.');
  assert.equal(r.answer,'Sí, tiene NFC.');
});

test('rejects speculative tradeoffs that are not present in verified evidence',async()=>{
  const r=await safeWrite(llm('Ganas resistencia, pero probablemente sacrificas cámara.'),{
    ...base,intent:'COMPARE',allowedProducts:['Armor X13','Armor 22'],
    rag:[{text:'Armor X13 IP68. Armor 22 IP68.',source:'TEST',productId:'P-X13',section:'RESISTENCIA',domain:'PRODUCT'}],
  } as any,'La diferencia confirmada está en resistencia.');
  assert.equal(r.fallback.delivered,false);
});

test('duplicate grounded fact is a style issue and must not destroy an otherwise valid answer',async()=>{
  const r=await safeWrite(llm('Tiene NFC. Tiene NFC.'),{
    ...base,intent:'CAPABILITY',message:'¿Tiene NFC?',allowedProducts:['Armor 22'],
    rag:[{text:'NFC: Sí',source:'TEST',productId:'P-ARMOR-22-256G',section:'CONECTIVIDAD',domain:'PRODUCT'}],
  } as any,'Sí, tiene NFC.');
  assert.match(r.answer,/NFC/i);
});

test('mentioning WhatsApp as the customer use does not require app compatibility evidence unless compatibility is claimed',async()=>{
  const r=await safeWrite(llm('Para tu uso de WhatsApp y llamadas, este equipo encaja por la batería confirmada.'),{
    ...base,intent:'RECOMMEND',message:'Lo uso para WhatsApp y llamadas',allowedProducts:['Armor X13'],recommendedProduct:'Armor X13',
    rag:[{text:'Batería: 6320 mAh',source:'TEST',productId:'P-X13',section:'BATERIA',domain:'PRODUCT'}],
  } as any,'fallback');
  assert.notEqual(r.fallback.error,'UNSUPPORTED_APP_COMPATIBILITY');
});

test('verified price is allowed inside budget recommendation instead of forcing an unsolicited-price fallback',async()=>{
  const r=await safeWrite(llm('El Armor X13 encaja en tu tope: cuesta S/ 899.'),{
    ...base,
    intent:'RECOMMEND_WITHIN_BUDGET',
    state:{budget:1000},
    allowedProducts:['Armor X13'],
    quote:{product:'Armor X13',shortName:'Armor X13',price:899,stock:4,currency:'PEN',source:'TEST'},
    rag:[{text:'IP68: Sí',source:'TEST',productId:'P-X13',section:'RESISTENCIA',domain:'PRODUCT'}],
  } as any,'fallback');
  assert.equal(r.fallback.delivered,true);
  assert.notEqual(r.fallback.error,'UNSOLICITED_PRICE');
});

test('rejects rounded technical values that change authoritative RAG facts',async()=>{
  const authoritative='Armor 22 tiene una frecuencia máxima de CPU de 2.05 GHz.';
  const r=await safeWrite(llm('El Armor 22 alcanza una frecuencia máxima de 2.0 GHz.'),{
    ...base,
    message:'¿Cuál es la frecuencia máxima del procesador del Armor 22?',
    intent:'CAPABILITY',
    state:{activeProduct:'Armor 22'},
    resolvedProduct:'Armor 22',
    allowedProducts:['Armor 22'],
    directAnswer:authoritative,
    rag:[{text:'Frecuencia máxima CPU: 2.05 GHz.',source:'TEST',productId:'P-ARMOR-22-256G',section:'RENDIMIENTO',domain:'PRODUCT'}],
  } as any,authoritative);
  assert.match(r.answer,/2[.,]05 GHz/i);
  assert.equal(r.fallback.error,'UNSUPPORTED_NUMERIC_FACT');
});

test('normalizes chat lists to three plain useful bullets',async()=>{
  const answer='Armor X13 — ficha rápida:\n* **Pantalla:** HD+.\n* **Resistencia:** IP68.\n* **Batería:** autonomía amplia.\n* **Cámara:** principal.\n* **Memoria:** ampliable.\n* **Procesador:** Helio.';
  const r=await safeWrite(llm(answer),{
    ...base,intent:'PRODUCT_INFO',allowedProducts:['Armor X13'],
    rag:[{text:'Pantalla HD+. Resistencia IP68. Batería de autonomía amplia. Cámara principal. Memoria ampliable. Procesador Helio.',source:'TEST',productId:'P-X13',section:'GENERAL',domain:'PRODUCT'}],
  } as any,'fallback');
  assert.equal((r.answer.match(/^\s*-\s+/gm)??[]).length,3);
  assert.doesNotMatch(r.answer,/\*\*/);
  assert.doesNotMatch(r.answer,/Memoria|Procesador/);
});
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
  const r=await safeWrite(llm('El Armor 22 tiene lector de huella lateral. ¿Quieres que te confirme también el precio?'),{
    message:'tiene huella?',
    intent:'CAPABILITY',
    state:{activeProduct:'Armor 22'},
    decision:{nextBestAction:'ANSWER_ONLY'},
    allowedProducts:['Armor 22'],
    rag:[{text:'Lector de huella lateral: Sí',source:'TEST',productId:'P-ARMOR-22-256G',section:'SEGURIDAD',domain:'PRODUCT'}],
    deterministicAnswer:'Responde solo la característica consultada.',
  } as any,'Puedo ayudarte a evaluar Armor 22; prefiero no afirmar una característica que no tenga confirmada.');
  assert.equal(r.answer,'El Armor 22 tiene lector de huella lateral.');
  assert.equal(r.fallback.delivered,true);
  assert.equal(r.fallback.error,undefined);
});

test('rejects speculative tradeoffs that are not present in verified evidence',async()=>{
  const r=await safeWrite(llm('El Armor 22 tiene más resolución nocturna; probablemente también consume más batería.'),{
    ...base,
    allowedProducts:['Armor 22','Armor X13'],
    rag:[
      {text:'Armor 22: cámara principal 64 MP. Cámara nocturna 64 MP.',source:'TEST',productId:'P-A22',section:'CAMARA',domain:'PRODUCT'},
      {text:'Armor X13: cámara principal 50 MP. Cámara nocturna 24 MP.',source:'TEST',productId:'P-X13',section:'CAMARA',domain:'PRODUCT'},
    ],
  } as any,'Armor 22 tiene mayor resolución nocturna en los datos comparados.');
  assert.equal(r.answer,'Armor 22 tiene mayor resolución nocturna en los datos comparados.');
  assert.equal(r.fallback.error,'UNSUPPORTED_SPECULATION');
});

test('duplicate grounded fact is a style issue and must not destroy an otherwise valid answer',async()=>{
  const text='El Armor 22 tiene batería de 6600 mAh. * **Batería:** 6600 mAh y carga de 33 W.';
  const r=await safeWrite(llm(text),{
    ...base,
    allowedProducts:['Armor 22'],
    rag:[{text:'bateria_capacidad = 6600 mAh; carga = 33 W',source:'TEST',productId:'P-ARMOR-22-256G',section:'BATERIA',domain:'PRODUCT'}],
  } as any,'fallback destructivo');
  assert.notEqual(r.answer,'fallback destructivo');
  assert.notEqual(r.fallback.error,'DUPLICATE_FACT');
});

test('mentioning WhatsApp as the customer use does not require app compatibility evidence unless compatibility is claimed',async()=>{
  const r=await safeWrite(llm('Para llamadas y WhatsApp, el Armor X12 Pro encaja por la resistencia que pediste.'),{
    ...base,
    message:'solo llamadas whatsapp y que sea resistente',
    allowedProducts:['Armor X12 Pro'],
    rag:[{text:'IP68: Sí; IP69K: Sí',source:'TEST',productId:'P-X12',section:'RESISTENCIA',domain:'PRODUCT'}],
  } as any,'fallback');
  assert.equal(r.fallback.delivered,true);
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
  const r=await safeWrite(llm('El Armor 22 alcanza una frecuencia máxima de 2.0 GHz.'),{
    ...base,
    intent:'CAPABILITY',
    allowedProducts:['Armor 22'],
    rag:[{text:'Frecuencia máxima CPU: 2.05 GHz.',source:'TEST',productId:'P-ARMOR-22-256G',section:'RENDIMIENTO',domain:'PRODUCT'}],
  } as any,'Puedo confirmar la frecuencia exacta en la ficha técnica.');
  assert.equal(r.answer,'Puedo confirmar la frecuencia exacta en la ficha técnica.');
  assert.equal(r.fallback.error,'UNSUPPORTED_NUMERIC_FACT');
});

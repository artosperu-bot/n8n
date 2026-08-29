import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider{return {async write(){return {text,model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};}

const rugged=`Producto: Armor 22
Sección: RESISTENCIA
Contenido:
- Certificación IP68: Sí.
- Certificación IP69K: Sí.
- MIL-STD-810H: Sí.
- Resistencia a caídas: 1.5 m.`;

test('seller-led fulfillment soft close may include verified price and availability',async()=>{
  const answer='Si ya lo reparaste varias veces, cada nueva caída puede terminar otra vez en gasto y en quedarte sin celular justo cuando lo necesitas. En ese caso me iría por Armor 22: tiene resistencia a caídas de 1.5 m y certificaciones IP68, IP69K y MIL-STD-810H. En palabras simples, está mucho mejor preparado para golpes, caídas, agua y polvo; eso ayuda a reducir el riesgo de volver al mismo ciclo de caída, reparación y quedarte sin equipo. Armor 22 está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recogerlo en nuestro local?';
  const r=await safeWrite(llm(answer),{
    message:'Estoy viendo el Armor 22 para trabajo. Ya mandé reparar mi celular dos veces por caídas.',
    intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',useCase:'trabajo',problem:'reparaciones_repetidas'},
    resolvedProduct:'Armor 22',
    allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'TEST'},
    rag:[{text:rugged,source:'TEST',productId:'P-ARMOR-22-256G',section:'RESISTENCIA',domain:'PRODUCT'}],
    nextBestAction:'SOFT_CLOSE',finalExecutableNba:'SOFT_CLOSE',executableNba:'SOFT_CLOSE',
    commercialResponsePlan:{mode:'SOFT_CLOSE',strategy:'FAB_SPIN',shouldUseLlm:true,acknowledgeContext:true,contextFocus:['trabajo','reparaciones_repetidas'],factualCore:'',exactNba:'SOFT_CLOSE',closePurpose:'FULFILLMENT',maxQuestions:1,allowedActions:['SOFT_CLOSE'],forbiddenClaims:[]},
    commercialContractPrepared:false,
  } as any,'fallback');
  assert.equal(r.fallback.delivered,true);
  assert.notEqual(r.fallback.error,'UNSOLICITED_PRICE');
  assert.match(r.answer,/S\/\s*1399/i);
  assert.match(r.answer,/disponib/i);
});

test('ordinary EVALUATE_USE answer still rejects an unsolicited price when fulfillment close is not authorized',async()=>{
  const r=await safeWrite(llm('Armor 22 tiene resistencia a caídas de 1.5 m. Cuesta S/ 1399.'),{
    message:'¿Aguanta caídas?',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22'},resolvedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'TEST'},
    rag:[{text:rugged,source:'TEST',productId:'P-ARMOR-22-256G',section:'RESISTENCIA',domain:'PRODUCT'}],
    nextBestAction:'ANSWER_ONLY',finalExecutableNba:'ANSWER_ONLY',executableNba:'ANSWER_ONLY',
  } as any,'Armor 22 tiene resistencia a caídas de 1.5 m.');
  assert.equal(r.fallback.delivered,false);
  assert.equal(r.fallback.error,'UNSOLICITED_PRICE');
});

test('discovery with a known use and fall problem cannot leak price availability or fulfillment',async()=>{
  const fallback='El Armor 22 tiene resistencia a caídas de 1.5 m y está preparado para golpes, agua y polvo. ¿Cuando se te cae termina dañándose o te hace perder tiempo en el trabajo?';
  const r=await safeWrite(llm('El Armor 22 aguanta caídas de 1.5 m. Está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recojo?'),{
    message:'se me cae mucho',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',useCase:'trabajo',problem:'caidas_frecuentes',spinFacts:['uso:trabajo','problema:caidas_frecuentes']},
    resolvedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'TEST'},
    rag:[{text:rugged,source:'TEST',productId:'P-ARMOR-22-256G',section:'RESISTENCIA',domain:'PRODUCT'}],
    nextBestAction:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',missingFact:'impacto',
  } as any,fallback);
  assert.equal(r.fallback.delivered,false);
  assert.equal(r.fallback.error,'UNSOLICITED_PRICE');
  assert.doesNotMatch(r.answer,/S\/\s*1399|disponib|env[ií]o|recojo/i);
  assert.match(r.answer,/ca[ií]da|golpe/i);
  assert.equal((r.answer.match(/\?/g)??[]).length,1);
});

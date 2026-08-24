import test from 'node:test';
import assert from 'node:assert/strict';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';

function result(text:string){return{text,model:'test-llm',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}

const ruggedFacts=[{
  domain:'PRODUCT_RAG',key:'RESISTENCIA',
  value:'Resistencia a caídas: 1.5 m. IP68: Sí. IP69K: Sí. MIL-STD-810H: Sí.',
  productId:'P-ARMOR-22-256G',source:'TEST',
}] as any;

test('repeated-repair seller-led answer is compact while preserving human FAB, price, availability and fulfillment',async()=>{
  const provider=new FullRagLlmProvider({async write(){return result('respuesta que no debe gobernar este dolor');}} as any);
  const out=await provider.write({
    message:'Estoy viendo el Armor 22 para trabajo. Ya mandé reparar mi celular dos veces por caídas.',
    intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',queryTarget:'Armor 22',useCase:'trabajo',problem:'reparaciones_repetidas'},
    resolvedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{product:'Armor 22',shortName:'Armor 22',price:1399,stock:9,currency:'PEN',source:'TEST'},
    verifiedFeatures:ruggedFacts,verifiedFacts:ruggedFacts,
    directAnswer:'Armor 22 encaja para ese uso.',
    nextBestAction:'SOFT_CLOSE',finalExecutableNba:'SOFT_CLOSE',executableNba:'SOFT_CLOSE',
  } as any);
  assert.match(out.text,/si ya lo reparaste/i);
  assert.match(out.text,/1\.5 m/i);
  assert.match(out.text,/IP68/i);
  assert.match(out.text,/IP69K/i);
  assert.match(out.text,/MIL-STD-810H/i);
  assert.match(out.text,/golpes?/i);
  assert.match(out.text,/agua/i);
  assert.match(out.text,/polvo/i);
  assert.match(out.text,/S\/\s*1399/i);
  assert.match(out.text,/disponib/i);
  assert.match(out.text,/env[ií]o/i);
  assert.match(out.text,/recojo|recoger/i);
  assert.ok(out.text.length<=390,`respuesta demasiado larga: ${out.text.length}`);
});

test('policy overlay never replays old pain and deterministically resumes fulfillment',async()=>{
  const provider=new FullRagLlmProvider({async write(){return result('La dirección está confirmada. ¿Te sirve?');}} as any);
  const out=await provider.write({
    message:'¿Dónde queda su local?',intent:'POLICY',
    state:{activeProduct:'Armor 22',queryTarget:'Armor 22',useCase:'trabajo',problem:'reparaciones_repetidas',pendingCommercialAction:'SOFT_CLOSE',lastNba:'SOFT_CLOSE'},
    resolvedProduct:'Armor 22',allowedProducts:['Armor 22'],
    verifiedFeatures:ruggedFacts,verifiedFacts:[{domain:'INSTITUTIONAL_RAG',key:'UBICACION',value:'STECH PERÚ atiende en Av. Honorio Delgado 224, San Martín de Porres, Lima, código postal 15102.',source:'TEST'}] as any,
    directAnswer:'STECH PERÚ atiende en Av. Honorio Delgado 224, San Martín de Porres, Lima, código postal 15102.',
    nextBestAction:'SOFT_CLOSE',finalExecutableNba:'SOFT_CLOSE',executableNba:'SOFT_CLOSE',
  } as any);
  assert.doesNotMatch(out.text,/reparaste|nueva ca[ií]da|mismo gasto/i);
  assert.match(out.text,/Honorio Delgado 224/i);
  assert.match(out.text,/env[ií]o/i);
  assert.match(out.text,/recoger|recojo/i);
  assert.ok(out.text.length<=220,`POLICY demasiado largo: ${out.text.length}`);
});

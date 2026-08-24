import test from 'node:test';
import assert from 'node:assert/strict';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';

function spyDelegate(text='Respuesta comercial contextual.'){
  let calls=0;let received:any=null;
  return{
    provider:{async write(input:any){calls++;received=input;return{text,model:'fake',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}},
    calls:()=>calls,
    received:()=>received,
  };
}

const resistanceRag=[{
  domain:'PRODUCT',section:'RESISTENCIA',source:'TEST',productId:'P-ARMOR-22-256G',
  text:'Producto: Armor 22\nCertificación IP68: Sí.\nCertificación IP69K: Sí.\nMIL-STD-810H: Sí.\nResistencia a caídas: 1.5 m.',
}];

const resistanceFact={domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'};

test('contextual FULL RAG reaches the commercial writer with immutable factual core',async()=>{
  const spy=spyDelegate('Para tu trabajo en construcción, esa resistencia sí aporta frente a las caídas que mencionas.');
  const llm=new FullRagLlmProvider(spy.provider as any);
  const input:any={
    message:'Trabajo en construcción y se me cae mucho el Armor 22, ¿aguanta caídas?',intent:'CAPABILITY',
    state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},activeProduct:'Armor 22',resolvedProduct:'Armor 22',attribute:'RESISTENCIA',
    useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],rag:resistanceRag,
    verifiedFacts:[resistanceFact],verifiedFeatures:[resistanceFact],finalExecutableNba:'RELATED_VALUE',nextBestAction:'RELATED_VALUE',
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA',verifiedFacts:[resistanceFact],relevantCustomerContext:{useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],budget:null,objection:null}},
  };
  const result=await llm.write(input);
  assert.equal(spy.calls(),1);
  assert.ok(spy.received()?.directAnswer);
  assert.match(String(spy.received()?.directAnswer),/1[.,]5\s*m/i);
  assert.equal(spy.received()?.commercialResponsePlan?.mode,'CONTEXTUAL_FAB');
  assert.match(String(spy.received()?.deterministicAnswer),/contexto|necesidad|criterio/i);
  assert.doesNotMatch(String(spy.received()?.deterministicAnswer),/CONTEXTUAL_FAB|FAKE_SCARCITY|FAKE_URGENCY/i);
  assert.match(result.text,/construcción/i);
});

test('isolated factual FULL RAG keeps deterministic bypass and does not invent a CTA',async()=>{
  const spy=spyDelegate('No debería llamarse.');
  const llm=new FullRagLlmProvider(spy.provider as any);
  const input:any={
    message:'¿El Armor 22 tiene NFC?',intent:'CAPABILITY',state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    activeProduct:'Armor 22',resolvedProduct:'Armor 22',attribute:'NFC',finalExecutableNba:'ANSWER_ONLY',nextBestAction:'ANSWER_ONLY',
    rag:[{domain:'PRODUCT',section:'CONECTIVIDAD',source:'TEST',productId:'P-ARMOR-22-256G',text:'Producto: Armor 22\nNFC: Sí.\nGoogle Pay: Sí.'}],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'NFC',value:'Sí',productId:'P-ARMOR-22-256G',source:'TEST'}],
  };
  const result=await llm.write(input);
  assert.equal(spy.calls(),0);
  assert.match(result.text,/NFC/i);
  assert.doesNotMatch(result.text,/stock|disponibilidad|quieres|recomiendo/i);
  assert.equal(input.commercialResponsePlan?.mode,'FACTUAL_DIRECT');
});

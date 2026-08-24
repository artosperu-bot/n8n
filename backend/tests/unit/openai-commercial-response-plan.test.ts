import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('writer receives bounded commercial response plan without widening factual authority',async()=>{
  let body:any;
  const fetcher:typeof fetch=async(_url,init)=>{
    body=JSON.parse(String(init?.body));
    return Response.json({model:'gpt-5-mini',output_text:'Para tu trabajo en construcción, esa resistencia sí suma.',usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
  };
  const llm=new OpenAIProvider({apiKey:'x',model:'gpt-5-mini',fetcher});
  const fact:any={domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'};
  await llm.write({
    message:'Trabajo en construcción y se me cae mucho el celular.',intent:'CAPABILITY',state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'} as any,
    directAnswer:'Armor 22 cuenta con resistencia a caídas de 1.5 m.',deterministicAnswer:'Armor 22 cuenta con resistencia a caídas de 1.5 m.',
    verifiedFacts:[fact],verifiedFeatures:[fact],resolvedProduct:'Armor 22',useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],
    executableNba:'RELATED_VALUE',finalExecutableNba:'RELATED_VALUE',supportedCapabilities:['RELATED_VERIFIED_VALUE'],
    commercialResponsePlan:{mode:'CONTEXTUAL_FAB',strategy:'FAB_SPIN',shouldUseLlm:true,acknowledgeContext:true,contextFocus:['trabajo en construcción','caídas frecuentes','resistencia'],factualCore:'Armor 22 cuenta con resistencia a caídas de 1.5 m.',exactNba:'RELATED_VALUE',maxQuestions:0,allowedActions:['RELATED_VALUE'],forbiddenClaims:['UNVERIFIED_FACT','FAKE_SCARCITY','FAKE_URGENCY','INVENTED_SOCIAL_PROOF','UNSUPPORTED_PERFORMANCE','UNAUTHORIZED_ACTION']},
  } as any);

  assert.equal(typeof body?.input,'string');
  assert.match(body.input,/CONTEXTUAL_FAB/);
  assert.match(body.input,/Armor 22 cuenta con resistencia a caídas de 1\.5 m\./);
  assert.match(body.input,/RELATED_VALUE/);
  assert.match(body.input,/FAKE_SCARCITY/);
  assert.doesNotMatch(body.input,/dato crudo interno/i);
  assert.match(String(body?.instructions??''),/FACTUAL_DIRECT/);
  assert.match(String(body?.instructions??''),/CONTEXTUAL_FAB/);
  assert.match(String(body?.instructions??''),/OBJECTION_LAER/);
  assert.match(String(body?.instructions??''),/escasez|scarcity/i);
  assert.match(String(body?.instructions??''),/urgencia|urgency/i);
});

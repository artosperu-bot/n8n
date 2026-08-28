import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';

test('existing writer receives bounded plan through PLAN_DE_RESPUESTA without raw RAG',async()=>{
  let body:any;
  const fetcher:typeof fetch=async(_url,init)=>{
    body=JSON.parse(String(init?.body));
    return Response.json({model:'gpt-5-mini',output_text:'Para tu trabajo en construcción, esa resistencia sí suma.',usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
  };
  const llm=new OpenAIProvider({apiKey:'x',model:'gpt-5-mini',fetcher});
  const fact:any={domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'};
  const input:any={
    message:'Trabajo en construcción y se me cae mucho el celular.',intent:'CAPABILITY',state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    directAnswer:'Armor 22 cuenta con resistencia a caídas de 1.5 m.',verifiedFacts:[fact],verifiedFeatures:[fact],resolvedProduct:'Armor 22',
    useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],executableNba:'RELATED_VALUE',finalExecutableNba:'RELATED_VALUE',
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA',verifiedFacts:[fact],relevantCustomerContext:{useCase:'trabajo en construcción',problem:'caídas frecuentes',priorities:['resistencia'],budget:null,objection:null}},
    rag:[{text:'dato crudo interno que no debe llegar al writer',source:'RAW',domain:'PRODUCT'}],
  };
  input.commercialResponsePlan=buildCommercialResponsePlan(input,input.directAnswer);
  input.deterministicAnswer=buildCommercialResponseInstruction(input.commercialResponsePlan);

  await llm.write(input);

  assert.equal(typeof body?.input,'string');
  assert.match(body.input,/RESPUESTA_DIRECTA:/);
  assert.match(body.input,/Armor 22 cuenta con resistencia a caídas de 1\.5 m\./);
  assert.match(body.input,/PLAN_DE_RESPUESTA:/);
  assert.match(body.input,/contexto conocido cambia el criterio/i);
  assert.match(body.input,/escasez, urgencia/i);
  assert.doesNotMatch(body.input,/dato crudo interno/i);
  assert.match(String(body?.instructions??''),/SPIN, FAB, LAER, empatía y neuroventas/i);
});

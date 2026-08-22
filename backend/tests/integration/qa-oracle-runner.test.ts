import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveQa } from '../../scripts/qa-live.ts';
import { OracleResolver } from '../../qa/oracle/OracleResolver.ts';
import { FakeErpRepository } from '../../src/adapters/fake/FakeErpRepository.ts';
import { FakeRagRepository } from '../../src/adapters/fake/FakeRagRepository.ts';

test('oracle QA scores factual truth and persisted session independently of chatbot text generation',async()=>{
  let chatCalled=false;
  const fetcher:typeof fetch=async(url,init:any={})=>{
    const target=String(url);
    if(target.endsWith('/health'))return Response.json({status:'ok',modes:{llm:'openai',erp:'sql-bridge',persistence:'supabase',n8n:'n8n'}});
    if(target.endsWith('/api/chat')){
      chatCalled=true;
      const body=JSON.parse(String(init.body));
      return Response.json({sessionId:body.sessionId,answer:'El Armor X13 cuesta S/ 899.',state:{sessionId:body.sessionId,activeProduct:'Armor X13',queryTarget:'Armor X13',lastResolvedProductId:'P-ARMOR-X13',lastIntent:'PRICE',lastNba:'ADVANCE_IF_INTEREST',contextVersion:1},debug:{intent:'PRICE',queryTarget:'Armor X13',erp:{product:'Armor X13',shortName:'Armor X13',productRagId:'P-ARMOR-X13',price:899,stock:4,currency:'PEN',source:'SQL_BRIDGE'},planner:{inputTokens:10,outputTokens:5,totalTokens:15,durationMs:2},automation:{delivered:true}}});
    }
    if(target.includes('/api/sessions/')){
      assert.equal(chatCalled,true,'persisted state is read only after chatbot execution; Oracle itself is pre-chat');
      return Response.json({sessionId:'s',state:{contextVersion:1,lastNba:'ADVANCE_IF_INTEREST'},messages:[{role:'user',content:'¿Cuánto cuesta el Armor X13?'},{role:'assistant',content:'El Armor X13 cuesta S/ 899.'}]});
    }
    throw new Error(`unexpected ${target}`);
  };
  const oracleResolver=new OracleResolver({erp:new FakeErpRepository(),rag:new FakeRagRepository()});
  const {report}=await runLiveQa({baseUrl:'http://test',fetcher,writeArtifacts:false,logger:{log(){},table(){},error(){}} as any,oracleResolver,scenarios:[{id:'G-PRICE',family:'TRUTH',title:'oracle price',turns:[{message:'¿Cuánto cuesta el Armor X13?',expected:{intent:'PRICE',queryTarget:'Armor X13'},oracleSpec:{domain:'SQL',intentClass:'PRICE',product:'Armor X13'}}]}]});
  assert.equal(report.scenarios[0].turns[0].oracle?.expectedProductId,'P-ARMOR-X13');
  assert.deepEqual(report.dimensions?.productIdentity,{pass:1,total:1});
  assert.deepEqual(report.dimensions?.factualAccuracy,{pass:1,total:1});
  assert.deepEqual(report.dimensions?.persistence,{pass:1,total:1});
  assert.equal(report.rootCauses?.SQL??0,0);
});

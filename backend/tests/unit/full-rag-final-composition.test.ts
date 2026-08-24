import test from 'node:test';
import assert from 'node:assert/strict';
import { productEvidenceSections } from '../../src/conversation/commercial/ProductEvidencePolicy.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';

const resistanceRag:any[]=[{
  domain:'PRODUCT',productId:'P-22',section:'RESISTENCIA',source:'TEST',
  text:'Producto: Armor 22\n- Certificación IP68: Sí.\n- Certificación IP69K: Sí.\n- MIL-STD-810H: Sí.\n- Resistencia a caídas: 1.5 m.\n- Profundidad IP68: 1.5 m.\n- Tiempo IP68: 30 min.'
}];

function llmReturning(text:string):any{return{write:async()=>({text,model:'fake',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0})};}

test('product overview retrieves thermal section when the product documents it',()=>{
  const sections=productEvidenceSections({primary:'PRODUCT_INFO'},{priorities:[]} as any);
  assert.ok(sections.includes('TERMICA'));
});

test('writer guard preserves full resistance bundle for golpes y agua instead of collapsing to drop only',async()=>{
  const direct='Armor 22 cuenta con certificaciones IP68, IP69K y MIL-STD-810H, resistencia a caídas de 1.5 m y protección IP68 hasta 1.5 m durante 30 min.';
  const result=await safeWrite(llmReturning(direct),{
    message:'El Armor 22 aguanta bien golpes y agua?',intent:'CAPABILITY',resolvedProduct:'Armor 22',rag:resistanceRag,directAnswer:direct,
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí'},
      {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí'},
      {domain:'PRODUCT_RAG',key:'MIL_STD_810H',value:'Sí'},
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m'},
      {domain:'PRODUCT_RAG',key:'IP68_PROFUNDIDAD',value:'1.5 m'},
      {domain:'PRODUCT_RAG',key:'IP68_TIEMPO',value:'30 min'},
    ],
    state:{activeProduct:'Armor 22',queryTarget:'Armor 22',priorities:['resistencia'],useCase:'trabajar en construcción'},
    allowedProducts:['Armor 22'],nextBestAction:'ANSWER_ONLY',decision:{nextBestAction:'ANSWER_ONLY',attributes:['RESISTENCIA']},commercialContractPrepared:true,
  } as any,direct);
  assert.match(result.answer,/IP68/i);assert.match(result.answer,/IP69K/i);assert.match(result.answer,/MIL-STD-810H/i);assert.match(result.answer,/1\.5 m/i);assert.match(result.answer,/30 min/i);
});

test('writer guard does not append a redundant contextual continuation when NFC answer already explains its value',async()=>{
  const direct='Sí, Armor 22 tiene NFC y Google Pay confirmado. Esto permite usar pagos contactless compatibles.';
  const result=await safeWrite(llmReturning(direct),{
    message:'El Armor 22 tiene NFC?',intent:'CAPABILITY',resolvedProduct:'Armor 22',directAnswer:direct,
    rag:[{domain:'PRODUCT',productId:'P-22',section:'CONECTIVIDAD',source:'TEST',text:'Producto: Armor 22\n- NFC: Sí.\n- Google Pay: Sí.'}],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'NFC',value:'Sí'},{domain:'PRODUCT_RAG',key:'GOOGLE_PAY',value:'Sí'}],
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'NFC',verifiedFacts:[{domain:'PRODUCT_RAG',key:'NFC',value:'Sí'}],relevantCustomerContext:{useCase:null,problem:null,priorities:['nfc'],budget:null,objection:null}},
    state:{activeProduct:'Armor 22',queryTarget:'Armor 22',priorities:['nfc']},allowedProducts:['Armor 22'],nextBestAction:'RELATED_VALUE',decision:{nextBestAction:'RELATED_VALUE',attributes:['NFC']},commercialContractPrepared:true,
  } as any,direct);
  assert.equal(result.answer,direct);assert.doesNotMatch(result.answer,/Además/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOracle } from '../../qa/evaluators/oracle.ts';
import { oracleFacts } from '../../qa/oracle/OracleEvidence.ts';

function observation(answer:string,state:any={},debug:any={}):any{return {ok:true,httpStatus:200,request:{message:'x'},response:{answer,state,debug}};}

test('negated unsupported numeric capability does not create false RED',()=>{
  const card:any={
    intentClass:'CAPABILITY',authoritativeDomain:'PRODUCT_RAG',expectedProductId:'P-ARMOR-X13',expectedProductName:'Armor X13',
    allowedFacts:['REDES=Red 4G LTE: Sí. Tecnologías GSM / WCDMA / LTE.'],forbiddenFacts:[],expectedReferenceBehavior:null,
    expectedStateDelta:{},expectedNbaClass:null,requiresHandoff:false,sourceRefs:['SUPABASE_DOCUMENTS:REDES'],
  };
  const findings=evaluateOracle(card,observation('No, el Armor X13 no tiene 5G; soporta 4G LTE.',{lastResolvedProductId:'P-ARMOR-X13'},{erp:{productRagId:'P-ARMOR-X13',shortName:'Armor X13'},ragSources:['SUPABASE_DOCUMENTS:REDES']}));
  assert.equal(findings.some(x=>x.code==='ORACLE_UNSUPPORTED_NUMERIC_FACT'),false);
});

test('legacy OFFER_ALTERNATIVES oracle expectation is equivalent to bounded OFFER_ALTERNATIVE',()=>{
  const card:any={intentClass:'PRODUCT_INFO',authoritativeDomain:'MEMORY',expectedProductId:null,expectedProductName:null,allowedFacts:[],forbiddenFacts:[],expectedReferenceBehavior:null,expectedStateDelta:{},expectedNbaClass:'OFFER_ALTERNATIVES',requiresHandoff:false,sourceRefs:[]};
  const findings=evaluateOracle(card,observation('Te muestro alternativas.',{lastNba:'OFFER_ALTERNATIVE'},{}));
  assert.equal(findings.some(x=>x.code==='ORACLE_NBA_MISMATCH'),false);
});

test('Oracle factual evidence keeps complete RAG text instead of writer truncation',()=>{
  const tail='Dato decisivo al final: microSD máxima 512 GB.';
  const long=`${'x'.repeat(380)} ${tail}`;
  const result=oracleFacts('CAPABILITY',null,[{text:long,source:'SUPABASE_DOCUMENTS:MEMORIA',section:'MEMORIA',productId:'P-A',domain:'PRODUCT'}]);
  assert.ok(result.allowedFacts.some(x=>x.includes('512 GB')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCommercialWriteInput } from '../../src/conversation/commercial/CommercialWriteContract.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider } from '../../src/ports/LlmProvider.ts';

function llm(text:string):LlmProvider{
  return {async write(){return {text,model:'gpt-test',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};
}

const quote:any={product:'Armor X13',shortName:'Armor X13',productRagId:'P-X13',price:899,stock:5,currency:'PEN',source:'SQL_BRIDGE'};

test('commercial contract records candidate separately from the single final executable NBA',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuánto cuesta el Armor X13?',
    intent:'PRICE',
    state:{activeProduct:'Armor X13'},
    quote,
    decision:{nextBestAction:'RELATED_VALUE',targetProduct:'Armor X13',attributes:[]} as any,
    allowedProducts:['Armor X13'],
  } as any);

  assert.equal(prepared.candidateNba,'RELATED_VALUE');
  assert.equal(prepared.finalExecutableNba,'RELATED_VALUE');
  assert.equal(prepared.executableNba,'RELATED_VALUE');
  assert.equal(prepared.nextBestAction,'RELATED_VALUE');
  assert.equal(prepared.commercialMove?.kind,'STOCK_STATUS');
});

test('a non executable RELATED_VALUE never mutates into discovery',()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuánto pesa?',
    intent:'CAPABILITY',
    state:{activeProduct:'Armor X13'},
    resolvedProduct:'Armor X13',
    directAnswer:'Armor X13 pesa 300 g.',
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'FISICO',value:'Peso: 300 g.',productId:'P-X13',source:'TEST'}],
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'FISICO',value:'Peso: 300 g.',productId:'P-X13',source:'TEST'}],
    decision:{nextBestAction:'RELATED_VALUE',targetProduct:'Armor X13',attributes:['FISICO']} as any,
    allowedProducts:['Armor X13'],
  } as any);

  assert.equal(prepared.candidateNba,'RELATED_VALUE');
  assert.equal(prepared.finalExecutableNba,'ANSWER_ONLY');
  assert.equal(prepared.missingFact,null);
});

test('writer failure to verbalize +1 preserves N and deterministically renders the same final RELATED_VALUE',async()=>{
  const prepared=prepareCommercialWriteInput({
    message:'¿Cuánto cuesta el Armor X13?',
    intent:'PRICE',
    state:{activeProduct:'Armor X13'},
    quote,
    decision:{nextBestAction:'RELATED_VALUE',targetProduct:'Armor X13',attributes:[]} as any,
    allowedProducts:['Armor X13'],
  } as any);

  const result=await safeWrite(llm('Armor X13 está a S/ 899.'),prepared,'fallback genérico');
  assert.match(result.answer,/S\/\s*899/);
  assert.match(result.answer,/disponible/i);
  assert.equal(result.nextBestAction,'RELATED_VALUE');
  assert.equal(result.finalExecutableNba,'RELATED_VALUE');
});

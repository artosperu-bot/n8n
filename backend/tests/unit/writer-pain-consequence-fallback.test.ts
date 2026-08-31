import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import type { LlmProvider, LlmWriteInput } from '../../src/ports/LlmProvider.ts';

const weakWriter:LlmProvider={async write(){return{text:'Siento que te haya pasado eso.',model:'qa-weak-writer',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};

test('damage consequence fallback keeps consequence plus grounded benefit instead of empty sympathy',async()=>{
  const input:LlmWriteInput={
    message:'Ya se me malogró un celular por eso',
    intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',
    state:{
      activeProduct:'Armor 22',activeProductId:'P-ARMOR-22-256G',useCase:'trabajo',problem:'exposicion_agua_polvo',
      spinFacts:['uso:trabajo','problema:exposicion_agua_polvo','implicacion:dano_equipo'],lastSpinContribution:'IMPLICACION',
    },
    resolvedProduct:'Armor 22',useCase:'trabajo',problem:'exposicion_agua_polvo',implications:['dano_equipo'],
    verifiedFacts:[
      {domain:'PRODUCT_RAG',key:'IP68',value:'Sí',productId:'P-ARMOR-22-256G',source:'qa'},
      {domain:'PRODUCT_RAG',key:'IP69K',value:'Sí',productId:'P-ARMOR-22-256G',source:'qa'},
      {domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-ARMOR-22-256G',source:'qa'},
    ],
    candidateNba:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',nextBestAction:'ASK_MISSING_FACT',
    missingFact:'prioridad principal',decisionImpact:true,allowedProducts:['Armor 22'],
  };
  const result=await safeWrite(weakWriter,input,'Siento que te haya pasado eso.');
  assert.doesNotMatch(result.answer,/^(?:lo\s+siento|siento\s+que|te\s+entiendo)[^.]*\.?\s*$/i);
  assert.match(result.answer,/malogr|dañ|evitar|repetir|agua|polvo|IP68|IP69/i);
  assert.match(result.answer,/Armor 22|IP68|IP69/i);
  assert.match(result.answer,/¿[^?]*(?:prioridad|importa|pesa|prefieres|necesitas)[^?]*\?/i);
  assert.equal((result.answer.match(/¿/g)??[]).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { FullRagLlmProvider } from '../../src/conversation/commercial/FullRagLlmProvider.ts';

test('combined rugged evidence preserves IP68 IP69K and MIL-STD-810H in the human FAB response',async()=>{
  const delegate={async write(){return{text:'respuesta débil',model:'test',usage:{inputTokens:0,outputTokens:0,totalTokens:0,cachedInputTokens:0},durationMs:0};}};
  const provider=new FullRagLlmProvider(delegate as any);
  const verifiedFeatures=[
    {domain:'PRODUCT_RAG',key:'RESISTENCIA',value:'Certificaciones IP68, IP69K y MIL-STD-810H; resistencia a caídas de 1.5 m',productId:'P-ARMOR-22-256G',source:'TEST'},
  ] as any;
  const result=await provider.write({
    message:'Ya mandé reparar mi celular dos veces por caídas.',intent:'EVALUATE_USE',
    state:{activeProduct:'Armor 22',recommendedProduct:'Armor 22',useCase:'trabajo_construccion',problem:'reparaciones_repetidas'},
    resolvedProduct:'Armor 22',recommendedProduct:'Armor 22',allowedProducts:['Armor 22'],
    quote:{shortName:'Armor 22',product:'Armor 22',price:1399,stock:9,currency:'PEN'} as any,
    verifiedFeatures,verifiedFacts:verifiedFeatures,
    finalExecutableNba:'SOFT_CLOSE',nextBestAction:'SOFT_CLOSE',directAnswer:'Armor 22 encaja.',
  } as any);
  assert.match(result.text,/IP68/i);
  assert.match(result.text,/IP69K/i);
  assert.match(result.text,/MIL-STD-810H/i);
  assert.match(result.text,/1\.5 m/i);
  assert.match(result.text,/golpes.*agua.*polvo|golpes.*polvo.*agua/i);
  assert.match(result.text,/S\/\s*1399/i);
  assert.match(result.text,/disponib/i);
});

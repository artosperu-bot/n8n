import type { LlmWriteInput, RagPresentationMode } from '../../ports/LlmProvider.ts';
import { selectProductHighlights } from './ProductHighlightSelector.ts';

function overviewAnswer(product:string,highlights:NonNullable<LlmWriteInput['productHighlights']>):string|null{
  if(highlights.length<1)return null;
  const shown=highlights.slice(0,6);
  const body=shown.map(item=>`${item.label}: ${item.summary}`).join('; ');
  return `${product} destaca por ${body}.`;
}
function mode(input:LlmWriteInput):RagPresentationMode{
  const intent=String(input.intent??'').toUpperCase();
  if(['POLICY','WARRANTY'].includes(intent)||input.verifiedFacts?.some(f=>f.domain==='INSTITUTIONAL_RAG'))return'INSTITUTIONAL';
  if(['CAPABILITY','ATTRIBUTE'].includes(intent))return'ATTRIBUTE';
  if(intent==='PRODUCT_INFO')return'PRODUCT_OVERVIEW';
  return'DEFAULT';
}
export function applyFullRagWritePolicy(input:LlmWriteInput):LlmWriteInput{
  const presentationMode=mode(input);
  const productHighlights=selectProductHighlights({intent:input.intent,attribute:input.attribute??null,facts:input.verifiedFacts??[],limit:presentationMode==='PRODUCT_OVERVIEW'?6:2});
  let directAnswer=input.directAnswer??null;
  if(presentationMode==='PRODUCT_OVERVIEW'){
    const product=String(input.resolvedProduct??input.activeProduct??input.quote?.shortName??input.quote?.product??'Este equipo').trim();
    const overview=overviewAnswer(product,productHighlights);
    if(overview)directAnswer=overview;
  }
  return{...input,presentationMode,productHighlights,directAnswer};
}

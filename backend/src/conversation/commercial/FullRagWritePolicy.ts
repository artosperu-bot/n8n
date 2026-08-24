import type { LlmWriteInput, RagPresentationMode, ProductHighlight } from '../../ports/LlmProvider.ts';
import { selectProductHighlights } from './ProductHighlightSelector.ts';

function byFamily(highlights:ProductHighlight[],family:ProductHighlight['family']):ProductHighlight|null{return highlights.find(item=>item.family===family)??null;}
function overviewAnswer(product:string,highlights:NonNullable<LlmWriteInput['productHighlights']>):string|null{
  if(!highlights.length)return null;
  const memory=byFamily(highlights,'MEMORY')?.summary;
  const battery=byFamily(highlights,'BATTERY')?.summary;
  const resistance=byFamily(highlights,'RESISTANCE')?.summary;
  const camera=byFamily(highlights,'CAMERA')?.summary;
  const display=byFamily(highlights,'DISPLAY')?.summary;
  const sentences:string[]=[];
  if(memory)sentences.push(`en memoria viene con ${memory}`);
  if(battery)sentences.push(`en autonomía equipa ${battery}`);
  if(resistance)sentences.push(`en resistencia destaca por ${resistance}`);
  if(camera)sentences.push(`en cámaras ofrece ${camera}`);
  if(display)sentences.push(`la pantalla es de ${display}`);
  if(!sentences.length)return null;
  const selected=sentences.slice(0,3);
  return `${product}: ${selected.join('; ')}.`.replace(/\s+/g,' ').trim();
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
  const productHighlights=selectProductHighlights({intent:input.intent,attribute:input.attribute??null,facts:input.verifiedFacts??[],limit:presentationMode==='PRODUCT_OVERVIEW'?3:2});
  let directAnswer=input.directAnswer??null;
  if(presentationMode==='PRODUCT_OVERVIEW'){
    const product=String(input.resolvedProduct??input.activeProduct??input.quote?.shortName??input.quote?.product??'Este equipo').trim();
    const overview=overviewAnswer(product,productHighlights);if(overview)directAnswer=overview;
  }
  return{...input,presentationMode,productHighlights,directAnswer};
}

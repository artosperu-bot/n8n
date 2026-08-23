import type { LlmWriteInput, RagPresentationMode, ProductHighlight } from '../../ports/LlmProvider.ts';
import { selectProductHighlights } from './ProductHighlightSelector.ts';

function byFamily(highlights:ProductHighlight[],family:ProductHighlight['family']):ProductHighlight|null{
  return highlights.find(item=>item.family===family)??null;
}
function sentence(label:string,highlight:ProductHighlight|null):string|null{
  if(!highlight?.summary)return null;
  const lead=label==='Memoria'?'En memoria':label==='Batería'?'En batería':label==='Resistencia'?'En resistencia':label==='Cámara'?'En cámara':label==='Pantalla'?'La pantalla':label;
  return label==='Pantalla'?`${lead} viene con ${highlight.summary}`:`${lead}, ${highlight.summary}`;
}
function overviewAnswer(product:string,highlights:NonNullable<LlmWriteInput['productHighlights']>):string|null{
  if(highlights.length<1)return null;
  const memory=sentence('Memoria',byFamily(highlights,'MEMORY'));
  const battery=sentence('Batería',byFamily(highlights,'BATTERY'));
  const resistance=sentence('Resistencia',byFamily(highlights,'RESISTANCE'));
  const camera=sentence('Cámara',byFamily(highlights,'CAMERA'));
  const display=sentence('Pantalla',byFamily(highlights,'DISPLAY'));
  const first=[memory,battery].filter(Boolean).join('. ');
  const second=[resistance,camera].filter(Boolean).join('. ');
  const third=display;
  const body=[first,second,third].filter(Boolean).map(x=>`${x}.`).join(' ');
  return `${product} es un equipo bien completo. ${body}`.replace(/\s+/g,' ').trim();
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
  const productHighlights=selectProductHighlights({intent:input.intent,attribute:input.attribute??null,facts:input.verifiedFacts??[],limit:presentationMode==='PRODUCT_OVERVIEW'?5:2});
  let directAnswer=input.directAnswer??null;
  if(presentationMode==='PRODUCT_OVERVIEW'){
    const product=String(input.resolvedProduct??input.activeProduct??input.quote?.shortName??input.quote?.product??'Este equipo').trim();
    const overview=overviewAnswer(product,productHighlights);
    if(overview)directAnswer=overview;
  }
  return{...input,presentationMode,productHighlights,directAnswer};
}

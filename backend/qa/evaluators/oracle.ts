import type { OracleCard } from '../oracle/types.ts';
import type { QaFinding, QaTurnObservation } from '../types.ts';

function same(a:unknown,b:unknown):boolean{return String(a??'').trim().toLocaleLowerCase('es')===String(b??'').trim().toLocaleLowerCase('es');}
function numbers(text:string):string[]{return [...new Set((text.match(/\b\d+(?:[.,]\d+)?\b/g)??[]).map(x=>x.replace(',','.')))];}
function containsNumber(text:string,value:string):boolean{return text.replace(/(?<=\d)[,.](?=\d{3}(?:\D|$))/g,'').includes(value.replace(/\.00$/,''));}

export function evaluateOracle(card:OracleCard,observation:QaTurnObservation):QaFinding[]{
  const findings:QaFinding[]=[];
  if(!observation.ok)return findings;
  const response=observation.response??{};
  const state=response.state??{};
  const debug=response.debug??{};
  const answer=String(response.answer??'');

  if(card.expectedProductId){
    const actual=debug.erp?.productRagId??state.lastResolvedProductId??null;
    if(!actual||!same(actual,card.expectedProductId))findings.push({level:'RED',code:'ORACLE_PRODUCT_ID_MISMATCH',message:`Producto oracle=${card.expectedProductId} actual=${String(actual)}`,rootCause:'REFERENCE'});
  }
  if(card.expectedProductName&&card.expectedProductId){
    const actualName=debug.erp?.shortName??debug.erp?.product??debug.queryTarget??state.queryTarget??null;
    if(actualName&&!same(actualName,card.expectedProductName))findings.push({level:'RED',code:'ORACLE_PRODUCT_NAME_MISMATCH',message:`Producto oracle=${card.expectedProductName} actual=${String(actualName)}`,rootCause:'REFERENCE'});
  }

  for(const [key,wanted] of Object.entries(card.expectedStateDelta??{})){
    const actual=state[key];
    if(actual!==wanted)findings.push({level:'RED',code:'ORACLE_STATE_MISMATCH',message:`${key}: oracle=${String(wanted)} actual=${String(actual)}`,rootCause:'STATE'});
  }
  if(card.expectedNbaClass&&state.lastNba!==card.expectedNbaClass)findings.push({level:'RED',code:'ORACLE_NBA_MISMATCH',message:`N+1 oracle=${card.expectedNbaClass} actual=${String(state.lastNba)}`,rootCause:'NBA'});
  if(card.requiresHandoff&&state.handoffActive!==true)findings.push({level:'RED',code:'ORACLE_HANDOFF_MISSING',message:'La señal de compra/humano no activó handoff.',rootCause:'HANDOFF'});

  const facts=card.allowedFacts.join('\n');
  const price=card.allowedFacts.find(x=>x.startsWith('PRECIO='))?.split('=')[1]??null;
  if(price){
    const numeric=numbers(price).at(-1);
    if(numeric&&!containsNumber(answer,numeric))findings.push({level:'RED',code:'ORACLE_PRICE_MISMATCH',message:`La respuesta no refleja el precio oracle ${price}.`,rootCause:'SQL'});
  }
  const availability=card.allowedFacts.find(x=>x.startsWith('DISPONIBILIDAD='))?.split('=')[1]??null;
  if(availability==='DISPONIBLE'&&!/disponible|sí hay|si hay|tenemos stock/i.test(answer))findings.push({level:'RED',code:'ORACLE_STOCK_MISMATCH',message:'Oracle indica disponibilidad y la respuesta no la expresa.',rootCause:'SQL'});
  if(availability==='NO_DISPONIBLE'&&/\bdisponible\b|sí hay|si hay|tenemos stock/i.test(answer)&&!/no\s+disponible|sin\s+stock/i.test(answer))findings.push({level:'RED',code:'ORACLE_STOCK_MISMATCH',message:'Oracle indica no disponible pero la respuesta afirma disponibilidad.',rootCause:'SQL'});

  if(card.authoritativeDomain==='SQL'&&card.intentClass==='IMAGE'&&card.allowedFacts.length){
    const allowed=new Set(card.allowedFacts.filter(x=>x.startsWith('IMAGE_URL=')).map(x=>x.slice('IMAGE_URL='.length)));
    const lines=answer.split(/\r?\n/).map((x:string)=>x.trim()).filter(Boolean);
    if(lines.some((url:string)=>!allowed.has(url)))findings.push({level:'RED',code:'ORACLE_IMAGE_URL_MISMATCH',message:'La respuesta contiene una URL no devuelta por el Oracle SQL.',rootCause:'SQL'});
  }

  if(['PRODUCT_RAG','INSTITUTIONAL_RAG'].includes(card.authoritativeDomain)&&facts){
    const productNums=new Set(numbers(card.expectedProductName??''));
    const allowedNums=new Set(numbers(facts));
    const unsupported=numbers(answer).filter(n=>!productNums.has(n)&&!allowedNums.has(n));
    if(unsupported.length)findings.push({level:'RED',code:'ORACLE_UNSUPPORTED_NUMERIC_FACT',message:`Afirmaciones numéricas no respaldadas por Oracle: ${unsupported.join(', ')}`,rootCause:card.authoritativeDomain==='PRODUCT_RAG'?'PRODUCT_RAG':'INSTITUTIONAL_RAG'});
  }

  if(card.authoritativeDomain==='PRODUCT_RAG'&&card.allowedFacts.length&&!(debug.ragSources??[]).length)findings.push({level:'RED',code:'PRODUCT_RAG_NOT_USED',message:'El turno técnico no reporta evidencia RAG de producto.',rootCause:'PRODUCT_RAG'});
  if(card.authoritativeDomain==='INSTITUTIONAL_RAG'&&card.allowedFacts.length&&!((debug.ragSources??[]).some((x:string)=>/INSTITUCIONAL|POLICY/i.test(x))))findings.push({level:'RED',code:'INSTITUTIONAL_RAG_NOT_USED',message:'El turno institucional no reporta evidencia institucional.',rootCause:'INSTITUTIONAL_RAG'});

  return findings;
}

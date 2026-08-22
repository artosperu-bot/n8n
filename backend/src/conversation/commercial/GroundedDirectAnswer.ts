import type { ProductQuote, RagEvidence, VerifiedFact } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type GroundedDirectAnswerInput={
  message:string;
  intent:string;
  attribute:string|null;
  resolvedProduct:string|null;
  quote?:ProductQuote|null;
  rag?:RagEvidence[];
  verifiedFacts?:VerifiedFact[];
};

function productName(input:GroundedDirectAnswerInput):string{
  return String(input.resolvedProduct??input.quote?.shortName??input.quote?.product??'El producto').trim();
}

function compact(value:string,max=420):string{
  const clean=value.replace(/\s+/g,' ').trim();
  if(!clean)return '';
  const clipped=clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`;
  return /[.!?…]$/.test(clipped)?clipped:`${clipped}.`;
}

function matchingEvidence(input:GroundedDirectAnswerInput):RagEvidence|null{
  const attribute=fold(input.attribute??'');
  const aliases:Record<string,RegExp>={
    fisico:/peso|dimension|grosor|fisico/,memoria:/ram|memoria|almacen/,ram:/ram|memoria/,
    bateria:/bateria|autonomia|carga/,resistencia:/resisten|caida|ip68|ip69|mil/,camara:/camara|foto|video|mp/,
  };
  const escaped=attribute.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=aliases[attribute]??(attribute?new RegExp(escaped,'i'):null);
  const matched=(input.rag??[]).find(row=>pattern?.test(fold(`${row.section??''} ${row.text}`)))??null;
  return matched??(attribute?null:input.rag?.[0]??null);
}

export function buildGroundedDirectAnswer(input:GroundedDirectAnswerInput):string|null{
  const intent=String(input.intent??'').toUpperCase();
  const factual=new Set(['PRICE','PRICE_AVAILABILITY','STOCK','CAPABILITY','PRODUCT_INFO','ATTRIBUTE','WARRANTY','POLICY','ORDER_STATUS']);
  if(!factual.has(intent))return null;
  const quote=input.quote??null;
  if(['PRICE','PRICE_AVAILABILITY'].includes(intent)&&quote?.price!=null)return `${productName(input)} está a S/ ${quote.price}.`;
  if(intent==='STOCK'&&quote?.stock!=null)return quote.stock>0?'Sí, está disponible.':'Ahora no está disponible.';

  const institutional=(input.rag??[]).find(row=>row.domain==='INSTITUTIONAL'||/INSTITUCIONAL|POLICY/i.test(row.source));
  if(['POLICY','WARRANTY'].includes(intent)&&institutional?.text)return compact(institutional.text);

  const evidence=matchingEvidence(input);
  const raw=String(evidence?.text??'');
  if(!raw)return null;
  const requested=fold(`${input.message} ${input.attribute??''}`);

  if(/peso|fisico/.test(requested)){
    const weight=raw.match(/\bpeso(?:\s+(?:del\s+)?(?:producto|equipo))?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
    if(weight)return `${productName(input)} pesa ${weight[1]} ${weight[2]}.`;
  }

  if(/\bram\b|memoria/.test(requested)){
    const physical=(input.verifiedFacts??[]).find(fact=>fact.key==='RAM_FISICA')?.value;
    const virtual=(input.verifiedFacts??[]).find(fact=>fact.key==='RAM_VIRTUAL')?.value;
    if(physical&&virtual)return `Tiene ${physical} de RAM física + ${virtual} de RAM virtual.`;
  }

  const labelled=raw.trim().match(/^([^:\n]{2,80})\s*:\s*([^\n]+?)\s*\.?$/);
  if(labelled){
    const label=labelled[1].trim();
    const value=labelled[2].trim().replace(/[.!?]+$/,'');
    const naturalLabel=/^[A-Z0-9]{2,}$/.test(label)?label:label.toLocaleLowerCase('es');
    if(/^(?:s[ií]|no)$/i.test(value))return /^s/i.test(value)?`Sí, tiene ${naturalLabel}.`:`No, no tiene ${naturalLabel}.`;
    if(/ram\s+f[ií]sica/i.test(label))return `Tiene ${value} de RAM física.`;
    return `${label}: ${value}.`;
  }

  return compact(raw);
}

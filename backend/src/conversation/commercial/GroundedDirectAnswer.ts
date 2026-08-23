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

function attributePattern(attribute:string|null):RegExp|null{
  const normalized=fold(attribute??'');
  const aliases:Record<string,RegExp>={
    fisico:/peso|dimension|grosor|fisico/,
    memoria:/ram|memoria|almacen/,
    ram:/ram|memoria/,
    bateria:/bateria|autonomia|carga/,
    resistencia:/resisten|caida|ip68|ip69|mil/,
    camara:/camara|foto|video|mp|vision nocturna|nocturna/,
    conectividad:/nfc|wifi|wi-fi|bluetooth|usb|otg|infrarrojo|conectividad/,
    redes:/5g|4g|lte|redes?|volte|bandas/,
    termica:/termic|temperatura|camara termica|resolucion termica/,
  };
  if(aliases[normalized])return aliases[normalized];
  if(!normalized)return null;
  const escaped=normalized.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(escaped,'i');
}

function matchingEvidence(input:GroundedDirectAnswerInput):RagEvidence|null{
  const pattern=attributePattern(input.attribute);
  const matched=(input.rag??[]).find(row=>pattern?.test(fold(`${row.section??''} ${row.text}`)))??null;
  return matched??(pattern?null:input.rag?.[0]??null);
}

function customerDisplayFact(input:GroundedDirectAnswerInput):VerifiedFact|null{
  const facts=(input.verifiedFacts??[]).filter(fact=>fact.domain==='PRODUCT_RAG');
  if(!facts.length)return null;
  const pattern=attributePattern(input.attribute);
  if(!pattern)return facts[0]??null;
  return facts.find(fact=>pattern.test(fold(`${fact.key} ${fact.value}`)))??null;
}

function positive(value:string):boolean{
  return /^(?:s[ií]|si|true|yes|1)$/i.test(String(value??'').trim());
}

function supportLabel(fact:VerifiedFact):string|null{
  const key=String(fact.key??'').toUpperCase();
  if(key==='IP68'&&positive(fact.value))return 'IP68';
  if(key==='IP69K'&&positive(fact.value))return 'IP69K';
  if(key==='MIL_STD_810H'&&positive(fact.value))return 'MIL-STD-810H';
  return null;
}

function sameAttributeSupport(input:GroundedDirectAnswerInput,excludeKeys:string[]=[]):string[]{
  const pattern=attributePattern(input.attribute);
  if(!pattern)return [];
  const excluded=new Set(excludeKeys.map(key=>key.toUpperCase()));
  return (input.verifiedFacts??[])
    .filter(fact=>fact.domain==='PRODUCT_RAG'&&!excluded.has(String(fact.key).toUpperCase()))
    .filter(fact=>pattern.test(fold(`${fact.key} ${fact.value}`)))
    .map(supportLabel)
    .filter((value):value is string=>Boolean(value))
    .filter((value,index,all)=>all.indexOf(value)===index)
    .slice(0,3);
}

function naturalFactLabel(key:string):string{
  const labels:Record<string,string>={
    NFC:'NFC',
    '5G':'5G',
    '4G_LTE':'4G LTE',
    VISION_NOCTURNA:'visión nocturna',
    CAMARA_TERMICA:'cámara térmica',
    BATERIA_MAH:'batería',
    CARGA_W:'carga',
    CAMARA_NOCTURNA_MP:'cámara nocturna',
    RESOLUCION_TERMICA:'resolución térmica',
  };
  return labels[key.toUpperCase()]??key.toLocaleLowerCase('es').replace(/[_-]+/g,' ');
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
  const requested=fold(`${input.message} ${input.attribute??''}`);

  if(raw&&/peso|fisico/.test(requested)){
    const weight=raw.match(/\bpeso(?:\s+(?:del\s+)?(?:producto|equipo))?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
    if(weight)return `${productName(input)} pesa ${weight[1]} ${weight[2]}.`;
  }

  if(/\bram\b|memoria/.test(requested)){
    const physical=(input.verifiedFacts??[]).find(fact=>fact.key==='RAM_FISICA')?.value;
    const virtual=(input.verifiedFacts??[]).find(fact=>fact.key==='RAM_VIRTUAL')?.value;
    if(physical&&virtual)return `Tiene ${physical} de RAM física + ${virtual} de RAM virtual.`;
  }

  if(/caida|caidas|golpe|golpes/.test(requested)){
    const fall=(input.verifiedFacts??[]).find(fact=>fact.key==='RESISTENCIA_CAIDAS')?.value;
    if(fall){
      const support=sameAttributeSupport(input,['RESISTENCIA_CAIDAS']);
      const certifications=support.length?` También cuenta con ${support.join(', ').replace(/, ([^,]+)$/,' y $1')}.`:'';
      return `${productName(input)} tiene resistencia a caídas de ${fall}.${certifications}`;
    }
  }

  // Raw RAG is evidence, not presentation text. Only normalized PRODUCT_RAG facts may
  // become the generic direct answer when no exact extractor above applies.
  const displayFact=customerDisplayFact(input);
  if(!displayFact)return null;
  const display=String(displayFact.value??'').trim();
  if(!display)return null;
  const label=naturalFactLabel(String(displayFact.key??'EVIDENCIA'));

  if(/^(?:s[ií]|no)$/i.test(display)){
    return /^s/i.test(display)?`Sí, tiene ${label}.`:`No, no tiene ${label}.`;
  }

  const labelled=display.match(/^([^:\n]{2,80})\s*:\s*([^\n]+?)\s*\.?$/);
  if(labelled){
    const naturalLabel=labelled[1].trim();
    const value=labelled[2].trim().replace(/[.!?]+$/,'');
    if(/ram\s+f[ií]sica/i.test(naturalLabel))return `Tiene ${value} de RAM física.`;
    return `${naturalLabel}: ${value}.`;
  }

  return `${label.charAt(0).toUpperCase()+label.slice(1)}: ${display.replace(/[.!?]+$/,'')}.`;
}

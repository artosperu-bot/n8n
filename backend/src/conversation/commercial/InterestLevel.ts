import type { ConversationState } from '../../domain/types.ts';
import { fold } from '../../shared/text.ts';

type InterestInput={
  message:string;
  intent:string;
  attributes?:string[];
  product?:string|null;
  previous:ConversationState;
  current:ConversationState;
};

function unique(values:string[]):string[]{return [...new Set(values.filter(Boolean))];}
function keyPart(value:string|null|undefined):string{return fold(String(value??'GENERAL')).toUpperCase().replace(/\s+/g,'_');}

function interestScore(events:string[]):number{
  const attributes=events.filter(event=>event.startsWith('ATTRIBUTE:')).length;
  let score=attributes?4+Math.min(2,attributes-1)*3:0;
  const weights:Array<[string,number]>=[
    ['PRICE:',8],['STOCK:',10],['POLICY:',5],['COMPARE:',7],['RECOMMEND',10],
    ['USE_CASE',6],['BUDGET',8],['OBJECTION:',7],['INTEREST_EXPLICIT',15],
    ['INTEREST_CONDITIONAL',18],['PURCHASE_HOW',20],['SELECTION_EXPLICIT',25],
  ];
  for(const [prefix,points] of weights)score+=events.filter(event=>event.startsWith(prefix)).length*points;
  return Math.max(0,Math.min(100,score));
}

export function updateInterestLevel(input:InterestInput):{levelOfInterest:number;interestEvents:string[]}{
  const text=fold(input.message);
  const product=keyPart(input.product??input.current.queryTarget??input.current.activeProduct);
  const events=[...(input.previous.interestEvents??[])];
  if(['ATTRIBUTE','CAPABILITY','PRODUCT_INFO'].includes(input.intent)){
    for(const attribute of input.attributes??[])events.push(`ATTRIBUTE:${product}:${keyPart(attribute)}`);
  }
  if(['PRICE','PRICE_AVAILABILITY'].includes(input.intent))events.push(`PRICE:${product}`);
  if(input.intent==='STOCK')events.push(`STOCK:${product}`);
  if(['POLICY','WARRANTY'].includes(input.intent))events.push(`POLICY:${keyPart(input.intent)}`);
  if(input.intent==='COMPARE')events.push(`COMPARE:${keyPart((input.current.comparisonProducts??[]).join('|'))}`);
  if(['RECOMMEND','RECOMMEND_WITHIN_BUDGET'].includes(input.intent))events.push('RECOMMEND');
  if(!input.previous.useCase&&!input.previous.sector&&(input.current.useCase||input.current.sector))events.push('USE_CASE');
  if(input.previous.budget==null&&input.current.budget!=null)events.push('BUDGET');
  if(!input.previous.objection&&input.current.objection)events.push(`OBJECTION:${keyPart(input.current.objection)}`);
  if(/\bsi\b[^.!?]{0,45}\b(?:hay|tienen|esta|está)\b[^.!?]{0,30}\b(?:stock|disponible|disponibilidad)\b[^.!?]{0,35}\bme interesa\b|\bsi (?:hay|tienen) stock me interesa\b/.test(text))events.push('INTEREST_CONDITIONAL');
  else if(/\bme interesa|estoy interesado|estoy interesada\b/.test(text))events.push('INTEREST_EXPLICIT');
  if(/\bcomo compro|quiero comprar|avanzar con la compra\b/.test(text))events.push('PURCHASE_HOW');
  if(/\b(?:ya\s+)?(?:ese|esa|este|esta)\s+quiero\b|\bme quedo con (?:ese|esa|este|esta)\b|\bme llevo (?:ese|esa|este|esta)\b/.test(text))events.push('SELECTION_EXPLICIT');
  const interestEvents=unique(events);
  return{levelOfInterest:interestScore(interestEvents),interestEvents};
}

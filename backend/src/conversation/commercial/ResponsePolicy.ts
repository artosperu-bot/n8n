import type { ConversationState, ProductImage, ProductQuote, RagEvidence, VerifiedFact } from '../../domain/types.ts';
import type { CommercialMove } from '../../ports/LlmProvider.ts';

function shortProduct(value: string | null | undefined): string {
  const raw=String(value??'').trim();
  return raw||'el producto';
}
function customerLanguage(value:string|null|undefined):string|null {
  let clean=String(value??'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
  if(!clean)return null;
  clean=clean
    .replace(/^\s*(?:uso(?:\s+cotidiano|\s+diario|\s+b[aá]sico|\s+principal)*|caso\s+de\s+uso)\s+(?:en|para)\s+/i,'')
    .replace(/^\s*(?:usar|utilizar)\s+(?:el\s+)?(?:celular|equipo|tel[eé]fono)\s+(?:principalmente\s+)?para\s+/i,'')
    .replace(/^\s*(?:tel[eé]fono|celular|equipo)\s+para\s+/i,'')
    .replace(/^\s*mensajer[ií]a\s+(?:por\s+)?/i,'')
    .replace(/\brealizar\s*\/\s*recibir\s+llamadas\b/ig,'llamadas')
    .replace(/\brealizar\s+y\s+recibir\s+llamadas\b/ig,'llamadas')
    .replace(/\bmensajer[ií]a\s+(?:por\s+)?WhatsApp\b/ig,'WhatsApp')
    .replace(/\s+/g,' ').split(/[;|]/,1)[0].trim();
  if(/whatsapp/i.test(clean)&&/llamadas?/i.test(clean))return'WhatsApp y llamadas';
  if(clean.length>70){const short=clean.split(/[,.;]/,1)[0].trim();clean=short||clean.slice(0,70).trim();}
  return clean||null;
}
function conciseVerifiedFact(fact:VerifiedFact|null|undefined):string|null{
  if(!fact)return null;
  const value=String(fact.value??'').replace(/\s+/g,' ').trim();
  if(!value)return null;
  const key=String(fact.key??'').toUpperCase();
  if(key==='RESISTENCIA_CAIDAS')return `Resistencia a caídas: ${value}`;
  if(key==='RAM_FISICA')return `RAM física: ${value}`;
  if(key==='RAM_VIRTUAL')return `RAM virtual: ${value}`;
  if(key==='IP68'||key==='IP69K'||key==='MIL_STD_810H')return `${key.replace(/_/g,'-')}: ${value}`;
  const first=value.split(/(?<=[.!?])\s+|[;|]/,1)[0]?.trim()??value;
  return first.length<=120?first:`${first.slice(0,117).trimEnd()}…`;
}
function semanticAttribute(move:CommercialMove):string{
  return[move.attribute,...move.verifiedFacts.map(fact=>`${fact.key} ${fact.value}`)]
    .filter(Boolean).join(' ').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function contextMatchesAttribute(move:CommercialMove,value:string|null|undefined):boolean{
  const context=String(value??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!context)return false;
  const attr=semanticAttribute(move);
  if(/RESIST|CAID|IMPACT|IP68|IP69|MIL/.test(attr))return/resisten|caida|golpe|campo|obra|construccion|durabilidad|proteccion|polvo|agua/.test(context);
  if(/RAM|MEMORIA|RENDIMIENTO/.test(attr))return/whatsapp|llamada|app|aplicacion|multitarea|trabajo|juego|rendimiento|uso diario|simple/.test(context);
  if(/BATER/.test(attr))return/bateria|autonomia|jornada|trabajo|delivery|campo|uso diario|cargar|recargar|fuera/.test(context);
  if(/CAMARA|NOCTURN/.test(attr))return/foto|camara|video|redes sociales|contenido|noche|nocturn/.test(context);
  if(/NFC/.test(attr))return/pago|contactless|nfc|tarjeta/.test(context);
  return false;
}
function naturalContextualBenefit(move:CommercialMove):string|null{
  const context=move.relevantCustomerContext;
  const attr=semanticAttribute(move);
  const useCase=contextMatchesAttribute(move,context.useCase)?customerLanguage(context.useCase):null;
  const problem=contextMatchesAttribute(move,context.problem)?customerLanguage(context.problem):null;
  const priorityRaw=context.priorities.find(priority=>contextMatchesAttribute(move,priority))??null;
  const priority=customerLanguage(priorityRaw);

  if(/RESIST|CAID|IMPACT|IP68|IP69|MIL/.test(attr)){
    if(useCase)return `Para ${useCase}, yo sí pondría esta protección entre los puntos importantes del equipo.`;
    if(problem)return `En tu caso, esta protección sí importa por ${problem}.`;
    if(priority)return `Si tu prioridad es ${priority}, este es uno de los puntos fuertes que conviene mirar.`;
    return null;
  }
  if(/BATER/.test(attr)){
    if(problem)return `En tu caso, esta batería cobra más importancia porque ${problem}.`;
    if(useCase)return `Para ${useCase}, batería y carga son dos datos que sí conviene priorizar.`;
    if(priority)return `Si tu prioridad es ${priority}, esta batería merece bastante peso en la elección.`;
    return null;
  }
  if(/RAM|MEMORIA|RENDIMIENTO/.test(attr)){
    if(useCase)return `Para ${useCase}, esta configuración te da más margen de memoria para trabajar con varias tareas.`;
    if(priority)return `Si tu prioridad es ${priority}, esta configuración es un punto a favor.`;
    return null;
  }
  if(/CAMARA|NOCTURN/.test(attr)){
    if(/NOCTURN/.test(attr)&&(useCase||problem))return `Si vas a usarlo de noche, la cámara nocturna es la característica que más valor aporta aquí.`;
    if(useCase)return `Para ${useCase}, esta cámara es la parte que yo miraría primero.`;
    if(priority)return `Si tu prioridad es ${priority}, esta cámara merece atención.`;
    return null;
  }
  if(/NFC/.test(attr)){
    if(useCase||problem||priority)return 'Si vas a usar pagos contactless, NFC es justo la función que necesitas confirmar.';
    return null;
  }
  if(context.objection)return 'Ese punto sí vale la pena considerarlo antes de decidir.';
  return null;
}
export function renderCommercialMove(move:CommercialMove|null,intent:string=''):string|null{
  if(!move)return null;
  if(move.kind==='STOCK_STATUS'){
    const status=move.verifiedFacts.find(fact=>fact.key==='DISPONIBILIDAD')?.value;
    return status==='DISPONIBLE'?'También está disponible.':status==='NO_DISPONIBLE'?'Por ahora no está disponible.':null;
  }
  const fact=move.verifiedFacts[0];
  if(move.kind==='RELATED_VERIFIED_FACT'){
    if(fact?.key==='PRECIO'&&String(intent).toUpperCase()==='STOCK')return'También puedo ayudarte con el precio.';
    if(!fact)return null;
    const rendered=renderVerifiedFact(fact);
    return rendered?`Además, ${rendered}`:null;
  }
  const benefit=naturalContextualBenefit(move);
  if(benefit)return benefit;
  if(!fact)return null;
  const concise=conciseVerifiedFact(fact);
  return concise?`Además, ${concise}.`:null;
}
export function renderVerifiedFact(fact:VerifiedFact|null|undefined):string|null{
  if(!fact)return null;
  const value=String(fact.value).trim().replace(/[.!?]+$/,'');
  if(!value)return null;
  if(fact.key==='DISPONIBILIDAD')return fact.value==='DISPONIBLE'?'Está disponible.':fact.value==='NO_DISPONIBLE'?'No está disponible.':null;
  if(fact.key==='RESISTENCIA_CAIDAS')return`Resistencia a caídas: ${value}.`;
  const normalizedValue=value.charAt(0).toUpperCase()+value.slice(1);
  const label=fact.key.toLocaleLowerCase('es').replace(/[_-]+/g,' ');
  return value.includes(':')?`${normalizedValue}.`:`${label.charAt(0).toUpperCase()+label.slice(1)}: ${value}.`;
}
export function priceResponse(quote:ProductQuote|null,softClose=false,commercialMove:CommercialMove|null=null):string{
  if(!quote||quote.price==null)return'El precio no está disponible en este momento.';
  const fact=`${shortProduct(quote.shortName??quote.product)} está a S/ ${quote.price}.`;
  const availability=quote.stock==null?null:(quote.stock>0?'También está disponible.':'Por ahora no está disponible.');
  if(availability)return`${fact} ${availability}`;
  const continuation=renderCommercialMove(commercialMove,'PRICE');
  return softClose?`${fact} Si te cuadra, puedo revisar stock para avanzar.`:continuation?`${fact} ${continuation}`:fact;
}
export function stockResponse(quote:ProductQuote|null,requestedQuantity?:number|null,softClose=false,commercialMove:CommercialMove|null=null):string{
  if(!quote||quote.stock==null)return'La disponibilidad está pendiente de actualización.';
  if(requestedQuantity!=null&&requestedQuantity>1){
    const direct=quote.stock>=requestedQuantity?'Sí, está disponible para esa cantidad.':'Para esa cantidad necesito validar disponibilidad.';
    const continuation=renderCommercialMove(commercialMove,'STOCK');
    return continuation?`${direct} ${continuation}`:direct;
  }
  if(quote.stock<=0)return'Ahora no está disponible.';
  const continuation=renderCommercialMove(commercialMove,'STOCK');
  return softClose?'Sí, está disponible. ¿Quieres avanzar con ese modelo?':continuation?`Sí, está disponible. ${continuation}`:'Sí, está disponible.';
}
export function imageResponse(images:ProductImage[]):string{return images.map(x=>x.url).filter(x=>/^https?:\/\//i.test(x)).join('\n');}
export function institutionalResponse(evidence:RagEvidence[]):string|null{
  const row=evidence.find(x=>x.domain==='INSTITUTIONAL')??evidence.find(x=>/INSTITUCIONAL|POLICY/i.test(x.source));
  if(!row?.text)return null;
  const text=row.text.trim().replace(/\s+/g,' ');
  const sentences=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const compact=sentences.slice(0,2).join(' ').trim();
  return(compact||text).slice(0,520).trim();
}
export function purchaseResponse(state:ConversationState,quote:ProductQuote|null):string{
  const product=shortProduct(state.selectedProduct??state.queryTarget??state.recommendedProduct??state.activeProduct);
  if(!state.selectedProduct&&!state.queryTarget&&!state.recommendedProduct&&!state.activeProduct)return'Claro. ¿Qué modelo quieres comprar?';
  if(quote?.stock!=null&&quote.stock<=0)return`Ahora ${product} no está disponible. Puedo ayudarte a revisar una alternativa disponible.`;
  return`Listo, te paso con un asesor para continuar la compra de ${product}.`;
}
export function quoteRequestResponse(state:ConversationState):string{
  const product=state.selectedProduct??state.queryTarget??state.recommendedProduct??state.activeProduct??null;
  if(!product)return'Claro. ¿Qué modelo necesitas cotizar?';
  if(!state.quantity||state.quantity<1)return`Claro. ¿Cuántas unidades de ${shortProduct(product)} necesitas?`;
  return`Con ${state.quantity} unidades de ${shortProduct(product)}, ya tengo lo necesario para que un asesor continúe con la cotización.`;
}
export function ambiguousReferenceResponse():string{return'¿A qué modelo te refieres?';}
export function noEvidenceResponse():string{return'No tengo confirmado ese dato exacto.';}

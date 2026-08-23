import type { ConversationState, ProductImage, ProductQuote, RagEvidence } from '../../domain/types.ts';
import type { CommercialMove } from '../../ports/LlmProvider.ts';
import type { VerifiedFact } from '../../domain/types.ts';

function shortProduct(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  return raw || 'el producto';
}

function customerLanguage(value:string|null|undefined):string|null {
  const clean=String(value??'')
    .replace(/[_-]+/g,' ')
    .replace(/\s+/g,' ')
    .replace(/^\s*(?:uso|uso principal|caso de uso)\s+(?:en|para)\s+/i,'')
    .replace(/^\s*(?:dispositivo|equipo|celular)\s+que\s+/i,'')
    .split(/[;|]/,1)[0]
    .trim()
    .replace(/[.!?]+$/,'');
  return clean||null;
}

function conciseVerifiedFact(fact:VerifiedFact|null|undefined):string|null{
  if(!fact)return null;
  const value=String(fact.value??'').replace(/\s+/g,' ').trim();
  if(!value)return null;
  const keyed=value.match(/(?:resistencia\s+a\s+ca[ií]das?|ram\s+(?:f[ií]sica|virtual)|bater[ií]a|peso|pantalla|c[aá]mara)\s*:\s*([^.;|]+)/i);
  if(keyed)return `${String(fact.key??'').toUpperCase().includes('CAID')?'Resistencia a caídas':String(fact.key??'').replace(/[_-]+/g,' ').toLocaleLowerCase('es')}: ${keyed[1].trim()}`;
  const first=value.split(/(?<=[.!?])\s+|[;|]/,1)[0]?.trim()??value;
  return first.length<=120?first:`${first.slice(0,117).trimEnd()}…`;
}

function attributeContextRelevant(move:CommercialMove):boolean{
  const attr=String(move.attribute??move.verifiedFacts[0]?.key??'').toUpperCase();
  const context=[move.relevantCustomerContext.useCase,move.relevantCustomerContext.problem,...move.relevantCustomerContext.priorities]
    .filter(Boolean).join(' ').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!context)return false;
  if(/RESIST|CAID|IP68|IP69|MIL/.test(attr))return /resisten|caida|golpe|trabajo|campo|obra|construccion|durabilidad|proteccion/.test(context);
  if(/RAM|MEMORIA|RENDIMIENTO/.test(attr))return /whatsapp|llamada|app|aplicacion|multitarea|trabajo|juego|rendimiento|uso diario|simple/.test(context);
  if(/BATER/.test(attr))return /bateria|autonomia|jornada|trabajo|delivery|campo|uso diario/.test(context);
  if(/CAMARA/.test(attr))return /foto|camara|video|redes sociales|contenido/.test(context);
  return true;
}

function neutralAttributeBenefit(move:CommercialMove,fact:string|null):string|null{
  const attr=String(move.attribute??move.verifiedFacts[0]?.key??'').toUpperCase();
  if(/RESIST|CAID|IP68|IP69|MIL/.test(attr))return fact?`Si también valoras resistencia, ${fact} es un dato útil para decidir.`:'Si también valoras resistencia, este dato puede ayudarte a decidir.';
  if(/RAM|MEMORIA|RENDIMIENTO/.test(attr))return fact?`Si también priorizas rendimiento y memoria, ${fact} es un dato útil para decidir.`:'Si también priorizas rendimiento y memoria, este dato puede ayudarte a decidir.';
  if(/BATER/.test(attr))return fact?`Si también priorizas batería, ${fact} es un dato útil para decidir.`:'Si también priorizas batería, este dato puede ayudarte a decidir.';
  if(/CAMARA/.test(attr))return fact?`Si también priorizas cámara, ${fact} es un dato útil para decidir.`:'Si también priorizas cámara, este dato puede ayudarte a decidir.';
  return fact?`${fact} es un dato útil al elegir el equipo.`:'Este dato puede ayudarte a elegir mejor.';
}

function contextualBenefit(move:CommercialMove):string|null {
  const context=move.relevantCustomerContext;
  const rawUseCase=String(context.useCase??'').trim();
  const useCase=customerLanguage(context.useCase);
  const priority=customerLanguage(context.priorities[0]);
  const problem=customerLanguage(context.problem);
  const fact=conciseVerifiedFact(move.verifiedFacts[0]);

  if(!attributeContextRelevant(move))return neutralAttributeBenefit(move,fact);
  if(useCase&&rawUseCase.length<=80&&!/[;|]/.test(rawUseCase))return fact
    ?`Para ${useCase}, ${fact} es un dato útil al elegir el equipo.`
    :`Para ${useCase}, este dato puede ayudarte a elegir mejor.`;
  if(priority)return fact
    ?`Si priorizas ${priority}, ${fact} es un dato útil al elegir el equipo.`
    :`Si priorizas ${priority}, este dato puede ayudarte a elegir mejor.`;
  if(problem)return fact
    ?`Si te preocupa ${problem}, ${fact} es un dato útil al elegir el equipo.`
    :`Si te preocupa ${problem}, este dato puede ayudarte a elegir mejor.`;
  if(useCase)return fact
    ?`Para ${useCase}, ${fact} es un dato útil al elegir el equipo.`
    :`Para ${useCase}, este dato puede ayudarte a elegir mejor.`;
  if(context.objection)return 'Si ese punto es importante para ti, este dato puede ayudarte a decidir.';
  return neutralAttributeBenefit(move,fact);
}

export function renderCommercialMove(move:CommercialMove|null,intent:string=''):string|null{
  if(!move)return null;
  if(move.kind==='STOCK_STATUS'){
    const status=move.verifiedFacts.find(fact=>fact.key==='DISPONIBILIDAD')?.value;
    return status==='DISPONIBLE'?'También está disponible.':status==='NO_DISPONIBLE'?'Por ahora no está disponible.':null;
  }
  const fact=move.verifiedFacts[0];
  if(move.kind==='RELATED_VERIFIED_FACT'){
    if(fact?.key==='PRECIO'&&String(intent).toUpperCase()==='STOCK')return 'También puedo ayudarte con el precio.';
    if(!fact)return null;
    const rendered=renderVerifiedFact(fact);
    return rendered?`Además, ${rendered}`:null;
  }
  const benefit=contextualBenefit(move);
  if(benefit)return benefit;
  if(!fact)return null;
  return `Además, ${String(fact.value).trim().replace(/[.!?]+$/,'')}.`;
}

export function renderVerifiedFact(fact:VerifiedFact|null|undefined):string|null{
  if(!fact)return null;
  const value=String(fact.value).trim().replace(/[.!?]+$/,'');
  if(!value)return null;
  if(fact.key==='DISPONIBILIDAD')return fact.value==='DISPONIBLE'?'Está disponible.':fact.value==='NO_DISPONIBLE'?'No está disponible.':null;
  const normalizedValue=value.charAt(0).toUpperCase()+value.slice(1);
  const label=fact.key.toLocaleLowerCase('es').replace(/[_-]+/g,' ');
  return value.includes(':')?`${normalizedValue}.`:`${label.charAt(0).toUpperCase()+label.slice(1)}: ${value}.`;
}

export function priceResponse(quote: ProductQuote | null, softClose = false, commercialMove:CommercialMove|null=null): string {
  if (!quote || quote.price == null) return 'El precio no está disponible en este momento.';
  const fact=`${shortProduct(quote.shortName ?? quote.product)} está a S/ ${quote.price}.`;
  const continuation=renderCommercialMove(commercialMove,'PRICE');
  return softClose?`${fact} Si te cuadra, puedo revisar stock para avanzar.`:continuation?`${fact} ${continuation}`:fact;
}

export function stockResponse(quote: ProductQuote | null, requestedQuantity?: number | null, softClose = false, commercialMove:CommercialMove|null=null): string {
  if (!quote || quote.stock == null) return 'La disponibilidad está pendiente de actualización.';
  if (requestedQuantity != null && requestedQuantity > 1) {
    const direct=quote.stock >= requestedQuantity
      ? 'Sí, está disponible para esa cantidad.'
      : 'Para esa cantidad necesito validar disponibilidad.';
    const continuation=renderCommercialMove(commercialMove,'STOCK');
    return continuation?`${direct} ${continuation}`:direct;
  }
  if(quote.stock<=0)return 'Ahora no está disponible.';
  const continuation=renderCommercialMove(commercialMove,'STOCK');
  return softClose?'Sí, está disponible. ¿Quieres avanzar con ese modelo?':continuation?`Sí, está disponible. ${continuation}`:'Sí, está disponible.';
}

export function imageResponse(images: ProductImage[]): string {
  return images.map(x => x.url).filter(x => /^https?:\/\//i.test(x)).join('\n');
}

export function institutionalResponse(evidence: RagEvidence[]): string | null {
  const row = evidence.find(x => x.domain === 'INSTITUTIONAL')
    ?? evidence.find(x => /INSTITUCIONAL|POLICY/i.test(x.source));
  if (!row?.text) return null;
  const text = row.text.trim().replace(/\s+/g, ' ');
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const compact = sentences.slice(0, 2).join(' ').trim();
  return (compact || text).slice(0, 520).trim();
}

export function purchaseResponse(state: ConversationState, quote: ProductQuote | null): string {
  const product = shortProduct(state.selectedProduct ?? state.queryTarget ?? state.recommendedProduct ?? state.activeProduct);
  if (!state.selectedProduct && !state.queryTarget && !state.recommendedProduct && !state.activeProduct) {
    return 'Claro. ¿Qué modelo quieres comprar?';
  }
  if (quote?.stock != null && quote.stock <= 0) {
    return `Ahora ${product} no está disponible. Puedo ayudarte a revisar una alternativa disponible.`;
  }
  return `Listo, te paso con un asesor para continuar la compra de ${product}.`;
}

export function quoteRequestResponse(state: ConversationState): string {
  const product = state.selectedProduct ?? state.queryTarget ?? state.recommendedProduct ?? state.activeProduct ?? null;
  if (!product) return 'Claro. ¿Qué modelo necesitas cotizar?';
  if (!state.quantity || state.quantity < 1) return `Claro. ¿Cuántas unidades de ${shortProduct(product)} necesitas?`;
  return `Con ${state.quantity} unidades de ${shortProduct(product)}, ya tengo lo necesario para que un asesor continúe con la cotización.`;
}

export function ambiguousReferenceResponse(): string {
  return '¿A qué modelo te refieres?';
}

export function noEvidenceResponse(): string {
  return 'No tengo confirmado ese dato exacto.';
}

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
    .replace(/^\s*(?:dispositivo|equipo|celular|tel[eé]fono)\s+(?:que|para)\s+/i,'')
    .replace(/^\s*uso\s+b[aá]sico\s*:\s*/i,'')
    .replace(/^\s*mensajer[ií]a\s+por\s+/i,'')
    .split(/[;|]/,1)[0]
    .trim()
    .replace(/[.!?]+$/,'');
  return clean||null;
}

function contextTokens(move:CommercialMove):string[]{
  const context=move.relevantCustomerContext;
  return [context.problem,...context.priorities,context.useCase]
    .flatMap(value=>String(value??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/))
    .filter(token=>token.length>=5&&!['telefono','celular','equipo','basico','diario','mensajeria','llamadas','principal'].includes(token));
}

function conciseFact(value:string|null|undefined,move:CommercialMove):string|null {
  const raw=String(value??'').replace(/\s+/g,' ').trim();
  if(!raw)return null;
  if(raw.length<=120&&!/caracter[ií]sticas confirmadas|palabras clave|\s-\s/i.test(raw))return raw.replace(/[.!?]+$/,'');
  const segments=raw
    .replace(/^.*?caracter[ií]sticas confirmadas[^:]*:\s*/i,'')
    .split(/\s+-\s+|(?<=[.!?])\s+/)
    .map(x=>x.replace(/^[-•*]\s*/,'').trim().replace(/[.!?]+$/,''))
    .filter(x=>x.length>=4&&!/^(?:producto|producto id|c[oó]digo|sku|secci[oó]n|grupo t[eé]cnico|t[ií]tulo|contenido|palabras clave)\s*:/i.test(x));
  const tokens=contextTokens(move);
  const normalized=(text:string)=>text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const contextMatch=segments.find(segment=>tokens.some(token=>normalized(segment).includes(token)));
  const numeric=segments.find(segment=>/\d/.test(segment));
  const chosen=contextMatch??numeric??segments[0]??raw;
  return chosen.length>120?`${chosen.slice(0,117).trimEnd()}…`:chosen;
}

function contextualBenefit(move:CommercialMove):string|null {
  const context=move.relevantCustomerContext;
  const rawUseCase=String(context.useCase??'').trim();
  const useCase=customerLanguage(context.useCase);
  const priority=customerLanguage(context.priorities[0]);
  const problem=customerLanguage(context.problem);
  const fact=conciseFact(move.verifiedFacts[0]?.value,move);

  if(useCase&&rawUseCase.length<=90&&!/[;|]/.test(rawUseCase))return fact
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
    if(fact?.key==='PRECIO'&&String(intent).toUpperCase()==='STOCK')return 'También puedo ayudarte con el precio.';
    if(!fact)return null;
    const rendered=renderVerifiedFact(fact);
    return rendered?`Además, ${rendered}`:null;
  }
  const benefit=contextualBenefit(move);
  if(benefit)return benefit;
  if(!fact)return null;
  const concise=conciseFact(fact.value,move);
  return concise?`Además, ${concise.replace(/[.!?]+$/,'')}.`:null;
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

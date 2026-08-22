import type { ConversationState, ProductImage, ProductQuote, RagEvidence } from '../../domain/types.ts';
import type { CommercialMove } from '../../ports/LlmProvider.ts';

function shortProduct(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  return raw || 'el producto';
}

function renderCommercialMove(move:CommercialMove|null):string|null{
  if(move?.kind!=='STOCK_STATUS')return null;
  const status=move.verifiedFacts.find(fact=>fact.key==='DISPONIBILIDAD')?.value;
  return status==='DISPONIBLE'?'También está disponible.':status==='NO_DISPONIBLE'?'Por ahora no está disponible.':null;
}

export function priceResponse(quote: ProductQuote | null, softClose = false, commercialMove:CommercialMove|null=null): string {
  if (!quote || quote.price == null) return 'El precio no está disponible en este momento.';
  const fact=`${shortProduct(quote.shortName ?? quote.product)} está a S/ ${quote.price}.`;
  const continuation=renderCommercialMove(commercialMove);
  return softClose?`${fact} Si te cuadra, puedo revisar stock para avanzar.`:continuation?`${fact} ${continuation}`:fact;
}

export function stockResponse(quote: ProductQuote | null, requestedQuantity?: number | null, softClose = false, commercialMove:CommercialMove|null=null): string {
  if (!quote || quote.stock == null) return 'La disponibilidad está pendiente de actualización.';
  if (requestedQuantity != null && requestedQuantity > 1) {
    return quote.stock >= requestedQuantity
      ? 'Sí, está disponible para esa cantidad.'
      : 'Para esa cantidad necesito validar disponibilidad.';
  }
  if(quote.stock<=0)return 'Ahora no está disponible.';
  const continuation=renderCommercialMove(commercialMove);
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

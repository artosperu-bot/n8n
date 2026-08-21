import type { ConversationState, ProductImage, ProductQuote, RagEvidence } from '../../domain/types.ts';
import { canonicalProductName } from '../reference/ReferenceResolver.ts';

function shortProduct(value: string | null | undefined): string {
  return canonicalProductName(value) ?? String(value ?? 'el producto');
}

export function priceResponse(quote: ProductQuote | null): string {
  if (!quote || quote.price == null) return 'No tengo un precio confirmado en este momento.';
  return `${shortProduct(quote.product)} está a S/ ${quote.price}.`;
}

export function stockResponse(quote: ProductQuote | null, requestedQuantity?: number | null): string {
  if (!quote || quote.stock == null) return 'No puedo confirmar la disponibilidad en este momento.';
  if (requestedQuantity != null && requestedQuantity > 1) {
    return quote.stock >= requestedQuantity
      ? 'Sí, está disponible para esa cantidad.'
      : 'Esa cantidad requiere validación antes de confirmarla.';
  }
  return quote.stock > 0 ? 'Sí, está disponible.' : 'Ahora no está disponible.';
}

export function imageResponse(images: ProductImage[]): string {
  return images.map(x => x.url).filter(x => /^https?:\/\//i.test(x)).join('\n');
}

export function institutionalResponse(evidence: RagEvidence[]): string | null {
  const row = evidence.find(x => x.source.startsWith('SUPABASE_INSTITUCIONAL:'));
  if (!row?.text) return null;
  const text = row.text.trim().replace(/\s+/g, ' ');
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const compact = sentences.slice(0, 2).join(' ').trim();
  return (compact || text).slice(0, 520).trim();
}

export function purchaseResponse(state: ConversationState, quote: ProductQuote | null): string {
  const product = shortProduct(state.queryTarget ?? state.activeProduct ?? state.recommendedProduct);
  if (quote?.stock != null && quote.stock <= 0) return `Ahora ${product} no está disponible. ¿Quieres que te recomiende una alternativa?`;
  if (state.queryTarget || state.activeProduct || state.recommendedProduct) {
    return `Perfecto. Puedo separarte ${product} por 24 horas. ¿Me indicas tu nombre completo?`;
  }
  return 'Perfecto. ¿Qué modelo quieres separar?';
}

export function noEvidenceResponse(): string {
  return 'No tengo ese dato confirmado todavía. Si quieres, te ayudo con lo que sí puedo verificar.';
}

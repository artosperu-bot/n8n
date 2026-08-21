import { fold } from '../../shared/text.ts';

export type Intent =
  | 'PRICE'
  | 'STOCK'
  | 'PURCHASE'
  | 'WARRANTY'
  | 'COMPARE'
  | 'CAPABILITY'
  | 'IMAGE'
  | 'POLICY'
  | 'RECOMMEND'
  | 'QUOTE'
  | 'GREETING'
  | 'OTHER';

export function resolveIntent(message: string, _context: { staleIntent?: string | null }): Intent {
  const t = fold(message).trim();

  if (/\b(foto|fotos|imagen|imagenes)\b|\b(muestrame|mandame|enviame)\b[^.!?]{0,30}\b(foto|fotos|imagen|imagenes)\b/.test(t)) return 'IMAGE';
  if (/\b(precio|cuanto\s+cuesta|cuanto\s+vale|costo)\b/.test(t)) return 'PRICE';
  if (/\b(stock|disponible|disponibilidad|hay\s+unidades|tienen\s+unidades)\b/.test(t)) return 'STOCK';
  if (/\b(quiero\s+(?:avanzar\s+con\s+la\s+)?compra|quiero\s+compr|comprarlo|comprarla|me\s+quedo\s+con|lo\s+quiero|separar|reservar)\b/.test(t)) return 'PURCHASE';
  if (/\b(cotiza|cotizar|cotizacion|proforma)\b/.test(t)) return 'QUOTE';
  if (/\b(garantia)\b/.test(t)) return 'WARRANTY';
  if (/\b(compara|comparar|comparalo|comparalos|comparacion|versus|vs)\b|\bdiferencia\b[^.!?]{0,40}\b(?:entre|de)\b/.test(t)) return 'COMPARE';
  if (/\b(recomienda|recomiendas|recomendar|recomendacion|cual\s+me\s+conviene|que\s+modelo\s+me\s+conviene|que\s+modelo\s+entra)\b/.test(t)) return 'RECOMMEND';
  if (/\b(nfc|5g|termic|vision\s+nocturna|bateria|ram|camara|resistente|resistencia|ip68|ip69k|procesador|pantalla|memoria|almacenamiento|gps|bluetooth|wifi|carga|caidas)\b/.test(t)) return 'CAPABILITY';
  if (/\b(tienda\s+fisica|direccion|ubicacion|horario|recojo|recoger|envio|envios|provincia|lima|contraentrega|contra\s+entrega|forma(?:s)?\s+de\s+pago|medio(?:s)?\s+de\s+pago|yape|plin|transferencia|tarjeta|boleta|factura|cambio|devolucion|reembolso)\b/.test(t)) return 'POLICY';

  if (/^(hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches)[\s!.,¿?]*$/.test(t)) return 'GREETING';
  return 'OTHER';
}

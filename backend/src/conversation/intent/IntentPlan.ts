import { fold } from '../../shared/text.ts';

export type SemanticIntent =
  | 'GREETING' | 'PRODUCT_INFO' | 'ATTRIBUTE' | 'EVALUATE_USE' | 'RECOMMEND'
  | 'COMPARE' | 'PRICE_AVAILABILITY' | 'STOCK' | 'IMAGES' | 'POLICY'
  | 'ORDER_STATUS' | 'OBJECTION' | 'HUMAN' | 'PURCHASE' | 'CATALOG'
  | 'CATEGORIES' | 'SUBCATEGORIES' | 'OTHER';

export type IntentPlan = {
  primary: SemanticIntent;
  secondary: SemanticIntent[];
  confidence: number;
  requiresClarification: boolean;
  attributes: string[];
};

const ATTRS: Array<[RegExp, string]> = [
  [/\b(bateria|autonomia|carga)\b/, 'BATERIA'],
  [/\b(camara|foto|video|vision nocturna)\b/, 'CAMARA'],
  [/\b(resistente|resistencia|ip68|ip69k|caida|golpe)\b/, 'RESISTENCIA'],
  [/\b(nfc|wifi|bluetooth|usb|infrarrojo|gps)\b/, 'CONECTIVIDAD'],
  [/\b(5g|4g|red|bandas|volte)\b/, 'REDES'],
  [/\b(ram|memoria|almacenamiento|microsd)\b/, 'MEMORIA'],
  [/\b(procesador|rendimiento|cpu|gpu|rapido|velocidad)\b/, 'RENDIMIENTO'],
  [/\b(pantalla|hz|resolucion)\b/, 'PANTALLA'],
];

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

export function resolveIntentPlan(message: string): IntentPlan {
  const t = fold(message);
  const hits: SemanticIntent[] = [];
  const has = (rx: RegExp) => rx.test(t);

  if (has(/\b(precio|cuanto cuesta|cuanto vale|costo)\b/)) hits.push('PRICE_AVAILABILITY');
  else if (has(/\b(stock|disponible|disponibilidad|hay unidades|tienen unidades)\b/)) hits.push('STOCK');

  if (has(/\b(foto|fotos|imagen|imagenes)\b/)) hits.push('IMAGES');
  if (has(/\b(pedido|orden)\b/) && has(/\b(consultar|estado|seguimiento|ver|revisar|donde)\b/)) hits.push('ORDER_STATUS');
  if (has(/\b(categorias?)\b/)) hits.push('CATEGORIES');
  if (has(/\b(subcategorias?)\b/)) hits.push('SUBCATEGORIES');
  if (has(/\b(catalogo|que productos|que equipos|que modelos tienen|muestrame)\b/)) hits.push('CATALOG');
  if (has(/\b(compara|comparar|comparalo|comparalos|comparacion|versus|vs|diferencia)\b/)) hits.push('COMPARE');
  if (has(/\b(recomienda|recomiendas|recomendacion|cual me conviene|que modelo me conviene)\b/)) hits.push('RECOMMEND');
  if (has(/\b(quiero comprar|comprarlo|comprarla|me quedo con|lo quiero|avanzar con la compra)\b/)) hits.push('PURCHASE');
  if (has(/\b(asesor|humano|persona|vendedor)\b/)) hits.push('HUMAN');
  if (has(/\b(caro|sale de mi presupuesto|fuera de mi presupuesto|no confio|me preocupa|esperaba)\b/)) hits.push('OBJECTION');
  if (has(/\b(tienda fisica|direccion|ubicacion|horario|recojo|envio|envios|provincia|lima|contraentrega|forma de pago|medios? de pago|yape|plin|transferencia|tarjeta|boleta|factura|garantia|cambio|devolucion|reembolso)\b/)) hits.push('POLICY');

  const attributes = unique(ATTRS.filter(([rx]) => rx.test(t)).map(([, name]) => name));
  const productInfo = has(/\b(info|informacion|caracteristicas|especificaciones|ficha|cuentame|hablame)\b/) && has(/\b(armor|celular|telefono|equipo|modelo)\b/);
  const use = has(/\b(trabajo|trabajar|construccion|campo|tecnico|juego|juegos|gaming|uso diario|se me cae|se me caen|necesito algo|me sirve|sirve para)\b/);

  if (productInfo) hits.push('PRODUCT_INFO');
  if (use) hits.push('EVALUATE_USE');
  if (attributes.length && !productInfo) hits.push('ATTRIBUTE');
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[\s!.,¿?]*$/.test(t)) hits.push('GREETING');

  const intents = unique(hits);
  const precedence: SemanticIntent[] = [
    'ORDER_STATUS', 'PURCHASE', 'PRICE_AVAILABILITY', 'STOCK', 'COMPARE', 'RECOMMEND',
    'IMAGES', 'CATEGORIES', 'SUBCATEGORIES', 'CATALOG', 'POLICY', 'PRODUCT_INFO',
    'OBJECTION', 'EVALUATE_USE', 'ATTRIBUTE', 'HUMAN', 'GREETING', 'OTHER',
  ];
  const primary = precedence.find(x => intents.includes(x)) ?? 'OTHER';

  return {
    primary,
    secondary: intents.filter(x => x !== primary),
    confidence: primary === 'OTHER' ? 0.4 : 0.96,
    requiresClarification: false,
    attributes,
  };
}

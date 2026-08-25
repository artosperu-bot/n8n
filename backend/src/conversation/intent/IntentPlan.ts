import { fold } from '../../shared/text.ts';

export type SemanticIntent =
  | 'GREETING' | 'PRODUCT_INFO' | 'ATTRIBUTE' | 'EVALUATE_USE' | 'RECOMMEND'
  | 'COMPARE' | 'PRICE_AVAILABILITY' | 'STOCK' | 'IMAGES' | 'POLICY' | 'FULFILLMENT_SELECTION' | 'WARRANTY'
  | 'ORDER_STATUS' | 'OBJECTION' | 'HUMAN' | 'PURCHASE' | 'QUOTE' | 'CATALOG'
  | 'CATEGORIES' | 'SUBCATEGORIES' | 'OTHER';

export type IntentPlan = {
  primary: SemanticIntent;
  secondary: SemanticIntent[];
  confidence: number;
  requiresClarification: boolean;
  attributes: string[];
};

const ATTRS: Array<[RegExp, string]> = [
  [/\b(nfc)\b/, 'NFC'],
  [/\b(5g)\b/, '5G'],
  [/\b(camara termica|camara termal|termica|thermal|flir)\b/, 'TERMICA'],
  [/\b(bateria|autonomia|carga|cargador|cargar)\b|\bdur(?:e|ar|acion)\b[^.!?]{0,25}\btodo\s+el\s+dia\b/, 'BATERIA'],
  [/\b(camara|camaras|foto|fotos|video|vision nocturna)\b/, 'CAMARA'],
  [/\b(resistente|resistencia|ip68|ip69k|mil(?:-std)?|caida|caidas|golpe|golpes|agua|polvo)\b/, 'RESISTENCIA'],
  [/\b(wifi|wi fi|bluetooth|usb|otg|infrarrojo|google pay|audifono|audifonos|jack|3[.,]5 mm)\b/, 'CONECTIVIDAD'],
  [/\b(4g|lte|red|redes|bandas|volte)\b/, 'REDES'],
  [/\b(sim|dual sim|nano sim|esim)\b/, 'SIM'],
  [/\b(ram|memoria|almacenamiento|espacio|microsd|micro sd|rom)\b/, 'MEMORIA'],
  [/\b(procesador|rendimiento|cpu|gpu|rapido|velocidad|gaming|jugar|juego|juegos|free fire|pubg|cod mobile|call of duty)\b/, 'RENDIMIENTO'],
  [/\b(pantalla|display|hz|resolucion|pulgadas)\b/, 'PANTALLA'],
  [/\b(huella|biometria|biometrico|desbloqueo facial|reconocimiento facial)\b/, 'SEGURIDAD'],
  [/\b(peso|pesa|pesan|grosor|grueso|dimensiones|dimension|tamano|medidas|altura|ancho|anchura|espesor|color)\b/, 'FISICO'],
  [/\b(sensor|sensores|giroscopio|barometro|proximidad|brujula)\b/, 'SENSORES'],
  [/\b(gps|galileo|glonass|beidou|posicionamiento)\b/, 'POSICIONAMIENTO'],
];

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

function isDirectImageRequest(t:string):boolean {
  const hasImage=/\b(foto|fotos|imagen|imagenes)\b/.test(t);
  if(!hasImage)return false;
  const captureUse=/\b(tomar|sacar|capturar|subir|subirlas|publicar)\b[^.!?]{0,45}\b(foto|fotos|imagen|imagenes)\b|\b(foto|fotos)\b[^.!?]{0,45}\b(redes|trabajo|trabajos|clientes)\b/.test(t);
  if(captureUse)return false;
  const assetAvailability=/\b(?:tienes|tienen|hay|cuentas?\s+con|dispones?\s+de)\b[^.!?]{0,35}\b(?:foto|fotos|imagen|imagenes)\b/.test(t);
  const standaloneItem=/(?:^|[,;]\s*)\b(foto|fotos|imagen|imagenes)\b(?=\s*(?:[,;]|y\b|$))/.test(t);
  return assetAvailability||standaloneItem
    || /\b(manda|mandame|enviame|envia|muestra|muestrame|pasame|pasa|quiero ver|ver)\b[^.!?]{0,35}\b(foto|fotos|imagen|imagenes)\b/.test(t)
    || /^(?:foto|fotos|imagen|imagenes)(?:\s+(?:ps|pues|porfa|por favor))?[?.!]*$/.test(t)
    || /^(?:foto|fotos|imagen|imagenes)\s+(?:del?|de la)\s+/.test(t);
}

function hasDirectModelChoice(t:string):boolean {
  const model='(?:[a-z][a-z0-9-]*\\s+){0,2}[a-z]*\\d+[a-z0-9-]*';
  return new RegExp(`\\b${model}\\b\\s+(?:o|vs|versus)\\s+\\b${model}\\b`,'i').test(t);
}

function hasComparativePriceQuestion(t:string):boolean {
  return /\bpor\s+que\b[^?.!]{0,90}\b(?:cuesta|vale|sale)\b[^?.!]{0,45}\bmas\b[^?.!]{0,45}\bque\b/.test(t)
    || /\b(?:cuesta|vale|sale)\b[^?.!]{0,45}\bmas\b[^?.!]{0,45}\bque\b[^?.!]{0,45}\bpor\s+que\b/.test(t);
}

function isFulfillmentSelection(message:string,t:string):boolean{
  if(/[¿?]/.test(message))return false;
  const delivery=/^(?:\s*(?:prefiero|quiero|mejor)?\s*)?(?:envio|delivery|entrega)(?:\s+(?:a|para)\b|\b)/.test(t)
    || /\b(?:prefiero|quiero|mejor)\b[^.!?]{0,30}\b(?:envio|delivery|entrega)\b/.test(t);
  const pickup=/\b(?:prefiero|quiero|voy a|mejor)\b[^.!?]{0,35}\b(?:recoger|recojo|retirar|local|tienda)\b/.test(t)
    || /^\s*(?:recojo|recoger|retirar)\b/.test(t);
  return delivery||pickup;
}

export function resolveIntentPlan(message: string): IntentPlan {
  const t = fold(message);
  const hits: SemanticIntent[] = [];
  const has = (rx: RegExp) => rx.test(t);
  const fulfillmentSelection=isFulfillmentSelection(message,t);

  if (has(/\b(precio|cuanto cuesta|cuanto vale|cuanto esta|cuanto sale|cuanto ta|a cuanto esta|a cuanto sale|costo)\b/)) hits.push('PRICE_AVAILABILITY');
  if (has(/\b(stock|stk|disponible|disponibilidad|hay unidades|tienen unidades|queda stock|quedan unidades)\b/)) hits.push('STOCK');
  if (fulfillmentSelection) hits.push('FULFILLMENT_SELECTION');
  if (isDirectImageRequest(t)) hits.push('IMAGES');
  if (has(/\b(pedido|orden)\b/) && has(/\b(consultar|estado|seguimiento|ver|revisar|donde)\b/)) hits.push('ORDER_STATUS');
  if (has(/\b(categorias?)\b/)) hits.push('CATEGORIES');
  if (has(/\b(subcategorias?)\b/)) hits.push('SUBCATEGORIES');
  if (has(/\b(catalogo|que productos|que equipos|que modelos tienen|muestrame)\b/)) hits.push('CATALOG');
  const explicitComparison = has(/\b(compara|comparame|comparar|comparalo|comparalos|comparacion|versus|vs|diferencia)\b/)
    || has(/\b(cual me conviene|con cual te quedarias|con cual te quedas|cual elegirias|cual escogerias|cual de los dos|cual de ambos)\b/)
    || hasDirectModelChoice(t)
    || hasComparativePriceQuestion(t)
    || has(/\bentre\b[^?.!]{0,90}\by\b[^?.!]{0,90}\b(?:cual|que)\b[^?.!]{0,45}\b(?:mejor|mayor|mas)\b/);
  if (explicitComparison) hits.push('COMPARE');
  const hardTechnicalNeed=has(/\b(necesito|requiero|busco)\b[^.!?]{0,45}\b(nfc|5g|camara termica|termica|thermal|flir)\b/);
  const recommendationLanguage = has(/\b(recomienda|recomiendas|recomiendan|recomendar|recomendacion|cual me conviene|que modelo me conviene|que modelo entra|q modelo entra|que modelo cumple|cual modelo cumple|otra opcion|otra alternativa|opcion mas economica|alternativa mas economica|cual parecido|que parecido|cual similar|que similar)\b/)
    || hardTechnicalNeed
    || has(/\b(cual|que|q)\b[^?.!]{0,35}\b(parecido|similar)\b[^?.!]{0,35}\b(tienen|hay|disponible)\b/)
    || has(/\b(cual|que|qué)\b[^?.!]{0,45}\b(?:entra|cabe|queda)\b[^?.!]{0,35}\bpresupuesto\b/)
    || has(/\b(?:el|la)\s+mas\s+(?:resistente|potente|economico|barato|rapido)\b/)
    || has(/\b(?:cual|que)\b[^?.!]{0,40}\b(?:mejor|mayor)\s+(?:bateria|camara|rendimiento|resistencia|pantalla|memoria)\b/)
    || has(/\b(?:cual|que)\b[^?.!]{0,30}\btiene\b[^?.!]{0,20}\b(?:la|el)\s+mejor\b/)
    || has(/\b(?:cual|que)\b\s+si\s+(?:lo\s+)?(?:tiene|cumple|ofrece)\b/)
    || has(/\bhay\s+(?:uno|un|algo|alguno)\b[^?.!]{0,25}\bmas\s+barato\b/);
  if (recommendationLanguage) hits.push('RECOMMEND');

  const useCaseLoQuiero=has(/\b(?:lo|la)\s+quiero\s+para\b/);
  const explicitPurchase = has(/\b(quiero comprar|quiero comprarlo|quiero comprarla|comprarlo|comprarla|como compro|lo compro|la compro|me llevo (?:ese|esa|este|esta)|me quedo con|quiero (?:ese|esa|este|esta)|ya (?:ese|esa|este|esta) quiero|me decidi(?: por (?:ese|esa|este|esta))?|ya me decidi|avanzar con la compra|quiero avanzar)\b/)
    || (!useCaseLoQuiero&&has(/\b(?:lo|la)\s+quiero\b/))
    || has(/\bya\s+(?:el|la)\s+(?:[a-z]*\d+[a-z0-9 -]{0,24}|\d{2,})\s+quiero\b/);
  if(explicitPurchase)hits.push('PURCHASE');

  if (has(/\b(cotiza|cotizar|cotizacion|cotizarnos)\b/)) hits.push('QUOTE');
  if (has(/\b(asesor|humano|persona|vendedor)\b/)) hits.push('HUMAN');
  if (has(/\b(caro|sale de mi presupuesto|fuera de mi presupuesto|no confio|me preocupa|esperaba|descuento|otra tienda[^.!?]{0,60}(?:barato|economico)|mas barato)\b/)) hits.push('OBJECTION');
  if (has(/\bgarantia\b/)) hits.push('WARRANTY');
  if (!fulfillmentSelection&&has(/\b(tienda fisica|direccion|ubicacion|horario|recojo|envio|envios|provincia|lima|contraentrega|forma de pago|medios? de pago|yape|plin|transferencia|tarjeta|boleta|factura|cambio|devolucion|reembolso)\b/)) hits.push('POLICY');

  const attributes = unique(ATTRS.filter(([rx]) => rx.test(t)).map(([, name]) => name));
  const hasProductLike=has(/\b(celular|telefono|equipo|modelo|[a-z]+\s*[x]?\d+[a-z0-9]*)\b/);
  const explicitProductInfo = (has(/\b(info|informacion|caracteristicas|especificaciones|ficha|cuentame|hablame|dime\s+(?:del|de\s+la|sobre))\b/) && hasProductLike)
    || (has(/\b(que\s+tal\s+es|como\s+es|que\s+tal\s+esta)\b/) && hasProductLike)
    || (has(/\bque\s+tal\b/) && hasProductLike && attributes.length===0);
  const browsingProduct = has(/\b(estoy viendo|quiero ver|revisando|ahora si quiero ver|muestrame el)\b/) && hasProductLike;
  const requirementFollowup = has(/\b(cumple|cumpliria|cumple\s+con\s+eso|tiene\s+eso)\b/);
  const productInfo = explicitProductInfo || browsingProduct;
  const directUse = has(/\b(trabajo|trabajar|trabajando|construccion|campo|tecnico|juego|juegos|jugar|gaming|free fire|pubg|cod mobile|call of duty|uso diario|se me cae|se me caen|necesito algo|necesitamos|me sirve|sirve para|delivery)\b/);
  const everydayNeed = has(/\b(uso simple|uso basico|whatsapp|llamadas?|mensajeria|comunicacion)\b/)
    && has(/\b(quiero un|quiero una|busco|necesito|para usar|para uso|lo quiero para|la quiero para)\b/);
  const use = directUse || everydayNeed || useCaseLoQuiero;

  if (productInfo) hits.push('PRODUCT_INFO');
  if (use&&!fulfillmentSelection) hits.push('EVALUATE_USE');
  if ((attributes.length || requirementFollowup) && !productInfo) hits.push('ATTRIBUTE');
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[\s!.,¿?]*$/.test(t)) hits.push('GREETING');

  const intents = unique(hits);
  const declarativeNeed = use && !fulfillmentSelection && (useCaseLoQuiero||has(/\b(necesito|necesitamos|busco|quiero algo|quiero un|quiero una)\b/)) && !/[?¿]/.test(message);
  const precedence: SemanticIntent[] = declarativeNeed
    ? ['PURCHASE','QUOTE','COMPARE','PRICE_AVAILABILITY','STOCK','FULFILLMENT_SELECTION','RECOMMEND','EVALUATE_USE','IMAGES','WARRANTY','POLICY','ATTRIBUTE','PRODUCT_INFO','OBJECTION','HUMAN','OTHER']
    : ['ORDER_STATUS','PURCHASE','QUOTE','COMPARE','PRICE_AVAILABILITY','STOCK','FULFILLMENT_SELECTION','RECOMMEND','IMAGES','CATEGORIES','SUBCATEGORIES','CATALOG','WARRANTY','POLICY','PRODUCT_INFO','OBJECTION','EVALUATE_USE','ATTRIBUTE','HUMAN','GREETING','OTHER'];
  const primary = precedence.find(x => intents.includes(x)) ?? 'OTHER';

  return {
    primary,
    secondary: intents.filter(x => x !== primary),
    confidence: primary === 'OTHER' ? 0.4 : 0.96,
    requiresClarification: false,
    attributes,
  };
}

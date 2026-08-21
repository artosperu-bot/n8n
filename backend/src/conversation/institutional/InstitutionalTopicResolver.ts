import { fold } from '../../shared/text.ts';

export type InstitutionalTopic = { category:string; subcategory?:string };

export function resolveInstitutionalTopic(query:string):InstitutionalTopic|null {
  const t=fold(query);

  if(/\bcontra\s*entrega\b|\bcontraentrega\b/.test(t))return{category:'pagos',subcategory:'contraentrega'};
  if(/\b(medios?|formas?)\s+de\s+pago\b|\byape\b|\bplin\b|\btransferencia\b|\btarjeta\b/.test(t))return{category:'pagos',subcategory:'medios_pago'};
  if(/\b(validar|validan|validamos|validacion|verificar|verifican|verificamos|verificacion)\b.*\bpago\b|\bpago\b.*\b(validar|validan|validamos|verificar|verifican|verificamos)\b/.test(t))return{category:'pagos',subcategory:'validacion_pago'};
  if(/\b(confirmar|confirma|confirmas|confirman|confirmo|confirmamos|confirmado|confirmada|confirmacion)\b[^.!?]{0,45}\b(pedido|compra)\b|\b(pedido|compra)\b[^.!?]{0,45}\b(confirmar|confirma|confirmas|confirman|confirmo|confirmamos|confirmado|confirmada|confirmacion)\b/.test(t))return{category:'pagos',subcategory:'confirmacion_pedido'};
  if(/\b(cancelar|cancelacion|anular)\b.*\b(pedido|compra)\b/.test(t))return{category:'pagos',subcategory:'cancelacion_pedido'};
  if(/\bdatos\b.*\b(compra|pedido|cierre)\b|\bque datos\b.*\bnecesit/.test(t))return{category:'pagos',subcategory:'datos_cierre_venta'};

  if(/\b(recojo|recoja|recoger|recogerlo|recogerla|retiro)\b|\bretirar\b.*\btienda\b/.test(t))return{category:'entrega',subcategory:'recojo_tienda'};
  if(/\b(separar|separarlo|separarla|separacion|reserva|reservar|reservarlo|reservarla)\b/.test(t))return{category:'pedidos',subcategory:'reserva_separacion'};

  if(/\breembolso\b|\bdevolucion\s+de\s+dinero\b/.test(t))return{category:'postventa',subcategory:'reembolsos'};
  if(/\b(?:si\s+)?(?:falla|fallo|fallara|falla)\b[^.!?]{0,50}\b(?:cambian|cambiar|cambio|reparan|reparar|reemplazan|reemplazar)\b|\b(?:cambian|cambiar|reparan|reparar|reemplazan|reemplazar)\b[^.!?]{0,50}\b(?:si\s+)?(?:falla|fallo)\b/.test(t))return{category:'garantia',subcategory:'evaluacion_y_resultado'};
  if(/\bgarantia\b/.test(t)){
    if(/\b(cambian|cambio|falla|fallo|reparan|resultado|evaluan|evaluacion)\b/.test(t))return{category:'garantia',subcategory:'evaluacion_y_resultado'};
    return{category:'postventa',subcategory:'garantia_general'};
  }
  if(/\b(cambio|cambios|devolucion|devoluciones|devolver|devolverlo|devolverla|devolverlos|devolverlas|devuelvo|devuelven)\b/.test(t)){
    if(/\benvio\b.*\b(seguro|devolver)|\bseguro\b.*\bdevol/.test(t))return{category:'postventa',subcategory:'devolucion_envio_seguro'};
    return{category:'postventa',subcategory:'cambios_devoluciones'};
  }
  if(/\b(exclusion|exclusiones|no cubre|no aplica)\b/.test(t))return{category:'postventa',subcategory:'postventa_exclusiones'};
  if(/\b(procedimiento|proceso|como hago)\b.*\b(postventa|reclamo|garantia|devol)/.test(t))return{category:'postventa',subcategory:'postventa_procedimiento'};
  if(/\bpostventa\b/.test(t))return{category:'postventa',subcategory:'postventa_general'};

  if(/\bhorario\b|\ba (?:que|q) hora\b|\bhasta (?:que|q) hora\b|\b(?:que|q) hora[^.!?]{0,30}\batienden\b/.test(t))return{category:'ubicacion',subcategory:'horario'};
  if(/\b(donde queda|direccion|ubicacion|tienda fisica|local)\b/.test(t))return{category:'ubicacion',subcategory:'direccion'};

  if(/\benvio\b|\benvios\b|\blima\b|\bprovincia\b|\barequipa\b|\btrujillo\b|\bcusco\b/.test(t)){
    if(/\bgratis|gratuito|sin costo\b/.test(t))return{category:'envios',subcategory:'envio_gratuito'};
    if(/\b(cuanto|demora|plazo|tiempo|dias?|horas?|cuando llega|lima|provincia|arequipa|trujillo|cusco)\b/.test(t))return{category:'envios',subcategory:'plazo_variable'};
    return{category:'envios',subcategory:'disponibilidad'};
  }

  if(/\bcookies?\b/.test(t))return{category:'privacidad',subcategory:'privacidad_cookies'};
  if(/\b(derechos?|arco|eliminar mis datos|rectificar)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_derechos'};
  if(/\b(menor|menores|nino|nina|adolescente)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_menores'};
  if(/\b(marketing|publicidad|promociones)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_marketing'};
  if(/\b(terceros|comparten mis datos|proveedores)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_terceros'};
  if(/\b(transferencia internacional|fuera del pais)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_transferencias'};
  if(/\b(seguridad de datos|protegen mis datos)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_seguridad'};
  if(/\b(reclamo|reclamos)\b.*\b(datos|privacidad)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_reclamos'};
  if(/\b(contacto)\b.*\b(privacidad|datos)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_contacto'};
  if(/\b(datos personales|mis datos|privacidad)\b/.test(t))return{category:'privacidad',subcategory:'privacidad_general'};

  if(/\bterminos|condiciones\b/.test(t))return{category:'terminos',subcategory:'terminos_generales'};
  if(/\b(precio|precios)\b.*\b(web|publicado|terminos|condiciones)\b/.test(t))return{category:'terminos',subcategory:'precios'};
  if(/\b(comprar|pedido|pedidos)\b.*\b(terminos|condiciones|reglas)\b/.test(t))return{category:'terminos',subcategory:'compra_pedidos'};
  if(/\b(informacion|descripcion)\b.*\bproducto\b.*\b(terminos|web|exacta)\b/.test(t))return{category:'terminos',subcategory:'informacion_productos'};
  if(/\b(edad|minimo de edad|capacidad)\b.*\b(comprar|contratar)\b/.test(t))return{category:'terminos',subcategory:'capacidad_contratar'};

  return null;
}

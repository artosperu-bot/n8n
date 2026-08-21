import { fold } from '../../shared/text.ts';

export type InstitutionalTopic = { category:string; subcategory?:string };

export function resolveInstitutionalTopic(query:string):InstitutionalTopic|null {
  const t=fold(query);

  if(/\bcontra\s*entrega\b|\bcontraentrega\b/.test(t))return{category:'pagos',subcategory:'contraentrega'};
  if(/\b(medios?|formas?)\s+de\s+pago\b|\byape\b|\bplin\b|\btransferencia\b|\btarjeta\b/.test(t))return{category:'pagos',subcategory:'medios_pago'};
  if(/\b(validar|validacion|verificar|verificacion)\b.*\bpago\b|\bpago\b.*\b(validar|verificar)\b/.test(t))return{category:'pagos',subcategory:'validacion_pago'};
  if(/\b(confirmar|confirmo|confirmamos|confirmado|confirmada|confirmacion)\b.*\b(pedido|compra)\b/.test(t))return{category:'pagos',subcategory:'confirmacion_pedido'};
  if(/\b(cancelar|cancelacion|anular)\b.*\b(pedido|compra)\b/.test(t))return{category:'pagos',subcategory:'cancelacion_pedido'};
  if(/\bdatos\b.*\b(compra|pedido|cierre)\b|\bque datos\b.*\bnecesit/.test(t))return{category:'pagos',subcategory:'datos_cierre_venta'};

  if(/\b(recojo|recoja|recoger|recogerlo|recogerla|retiro)\b|\bretirar\b.*\btienda\b/.test(t))return{category:'entrega',subcategory:'recojo_tienda'};
  if(/\b(separar|separacion|reserva|reservar)\b/.test(t))return{category:'pedidos',subcategory:'reserva_separacion'};

  if(/\breembolso\b|\bdevolucion\s+de\s+dinero\b/.test(t))return{category:'postventa',subcategory:'reembolsos'};
  if(/\bgarantia\b/.test(t)){
    if(/\b(cambian|cambio|falla|fallo|reparan|resultado|evaluan|evaluacion)\b/.test(t))return{category:'garantia',subcategory:'evaluacion_y_resultado'};
    return{category:'postventa',subcategory:'garantia_general'};
  }
  if(/\b(cambio|cambios|devolucion|devoluciones)\b/.test(t)){
    if(/\benvio\b.*\b(seguro|devolver)|\bseguro\b.*\bdevol/.test(t))return{category:'postventa',subcategory:'devolucion_envio_seguro'};
    return{category:'postventa',subcategory:'cambios_devoluciones'};
  }
  if(/\b(exclusion|exclusiones|no cubre|no aplica)\b/.test(t))return{category:'postventa',subcategory:'postventa_exclusiones'};
  if(/\b(procedimiento|proceso|como hago)\b.*\b(postventa|reclamo|garantia|devol)/.test(t))return{category:'postventa',subcategory:'postventa_procedimiento'};
  if(/\bpostventa\b/.test(t))return{category:'postventa',subcategory:'postventa_general'};

  if(/\bhorario\b|\ba que hora\b|\bque hora.*atienden\b/.test(t))return{category:'ubicacion',subcategory:'horario'};
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

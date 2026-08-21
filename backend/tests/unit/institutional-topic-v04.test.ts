import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstitutionalTopic } from '../../src/conversation/institutional/InstitutionalTopicResolver.ts';

test('routes Lima delivery timing away from refunds',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Cuánto demora el envío dentro de Lima?'),{category:'envios',subcategory:'plazo_variable'});
});

test('routes common policy questions to exact institutional topics',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Trabajan contraentrega?'),{category:'pagos',subcategory:'contraentrega'});
  assert.deepEqual(resolveInstitutionalTopic('¿Qué formas de pago aceptan?'),{category:'pagos',subcategory:'medios_pago'});
  assert.deepEqual(resolveInstitutionalTopic('¿Qué garantía dan?'),{category:'postventa',subcategory:'garantia_general'});
  assert.deepEqual(resolveInstitutionalTopic('¿Cuánto demora el reembolso?'),{category:'postventa',subcategory:'reembolsos'});
  assert.deepEqual(resolveInstitutionalTopic('¿Puedo recogerlo en tienda?'),{category:'entrega',subcategory:'recojo_tienda'});
});

test('routes order/payment lifecycle policies without global lexical search',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Cómo confirmo mi pedido?'),{category:'pagos',subcategory:'confirmacion_pedido'});
  assert.deepEqual(resolveInstitutionalTopic('¿Puedo cancelar el pedido?'),{category:'pagos',subcategory:'cancelacion_pedido'});
  assert.deepEqual(resolveInstitutionalTopic('¿Puedo reservarlo para mañana?'),{category:'pedidos',subcategory:'reserva_separacion'});
});

test('routes privacy and terms questions to their canonical families',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Usan cookies?'),{category:'privacidad',subcategory:'privacidad_cookies'});
  assert.deepEqual(resolveInstitutionalTopic('¿Cómo ejerzo mis derechos sobre mis datos?'),{category:'privacidad',subcategory:'privacidad_derechos'});
  assert.deepEqual(resolveInstitutionalTopic('¿Cuáles son sus términos y condiciones?'),{category:'terminos',subcategory:'terminos_generales'});
  assert.deepEqual(resolveInstitutionalTopic('¿Qué edad mínima necesito para comprar?'),{category:'terminos',subcategory:'capacidad_contratar'});
});

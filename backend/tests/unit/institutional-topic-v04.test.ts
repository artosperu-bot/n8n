import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstitutionalTopic } from '../../src/adapters/supabase/SupabaseRagRepository.ts';

test('routes Lima delivery timing away from refunds',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Cuánto demora el envío dentro de Lima?'),{category:'envios',subcategory:'plazo_variable'});
});

test('routes common policy questions to exact institutional topics',()=>{
  assert.deepEqual(resolveInstitutionalTopic('¿Trabajan contraentrega?'),{category:'pagos',subcategory:'contraentrega'});
  assert.deepEqual(resolveInstitutionalTopic('¿Qué formas de pago aceptan?'),{category:'pagos',subcategory:'medios_pago'});
  assert.deepEqual(resolveInstitutionalTopic('¿Qué garantía dan?'),{category:'postventa',subcategory:'garantia_general'});
  assert.deepEqual(resolveInstitutionalTopic('¿Cuánto demora el reembolso?'),{category:'postventa',subcategory:'reembolsos'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl=new URL('../../../sql/supabase/migrations/013_crm_product_identity_interest.sql',import.meta.url);

async function migration():Promise<string>{return readFile(migrationUrl,'utf8');}

test('CRM product analytics canonicalizes detected names through catalog identity',async()=>{
  const sql=await migration();
  assert.match(sql,/create\s+or\s+replace\s+view\s+public\.crm_v_productos_mencionados/i);
  assert.match(sql,/producto_id_resuelto/i);
  assert.match(sql,/producto_detectado/i);
  assert.match(sql,/catalogo_productos/i);
  assert.match(sql,/nombre_corto/i);
  assert.match(sql,/canonical|canonico|producto_id_canonico/i);
  assert.match(sql,/count\s*\(distinct\s+[^)]*session_id/i);
});

test('CRM high-interest analytics no longer depends on deprecated probability_compra',async()=>{
  const sql=await migration();
  const view=sql.slice(sql.toLowerCase().indexOf('create or replace view public.crm_v_productos_mencionados'));
  assert.doesNotMatch(view,/ic\.probabilidad_compra/i);
  assert.match(view,/nivel_interes/i);
  assert.match(view,/interestSignal|interest_signal|senal_compra|purchaseSignal|purchase_signal/i);
});

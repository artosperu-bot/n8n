import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRagRepository } from '../../src/adapters/supabase/SupabaseRagRepository.ts';

const docs = [
  { producto_id: 'P-ARMOR-X13', content: 'Sección BATERIA X13 6320 mAh', metadata: { seccion: 'BATERIA' } },
  { producto_id: 'P-ARMOR-22-256G', content: 'Sección BATERIA Armor22 6600 mAh', metadata: { seccion: 'BATERIA' } },
  { producto_id: 'P-ARMOR-X13', content: 'Sección CAMARA X13 50 MP', metadata: { seccion: 'CAMARA' } },
];
const institutional = [{ categoria: 'garantia', titulo: 'Garantía', respuesta_base: 'La garantía oficial es de 12 meses.', afirmable: true, prioridad: 100, activo: true }];
const fetcher: typeof fetch = async url => {
  const u = String(url);
  if (u.includes('/documents?')) return Response.json(docs);
  if (u.includes('/rag_institucional?')) return Response.json(institutional);
  if (u.includes('/catalogo_productos?')) return Response.json([]);
  return Response.json([]);
};
const repo = () => new SupabaseRagRepository({ url: 'https://s.test', key: 'x', fetcher, ttlMs: 999999 });

test('product search requires canonical product_id and never crosses products', async () => {
  const r = repo();
  await assert.rejects(() => r.searchProduct!('batería', '', ['BATERIA']), /productId is required/i);
  const rows = await r.searchProduct!('batería', 'P-ARMOR-X13', ['BATERIA']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, 'P-ARMOR-X13');
  assert.equal(rows[0].section, 'BATERIA');
  assert.equal(rows[0].domain, 'PRODUCT');
  assert.doesNotMatch(rows[0].text, /6600/);
});

test('institutional search never returns product documents', async () => {
  const rows = await repo().searchInstitutional!('garantía');
  assert.ok(rows.length >= 1);
  assert.ok(rows.every(x => x.domain === 'INSTITUTIONAL'));
  assert.ok(rows.every(x => !x.source.startsWith('SUPABASE_DOCUMENTS')));
});

test('product section filter returns only requested sections', async () => {
  const rows = await repo().searchProduct!('info', 'P-ARMOR-X13', ['BATERIA', 'CAMARA']);
  assert.deepEqual(new Set(rows.map(x => x.section)), new Set(['BATERIA', 'CAMARA']));
});

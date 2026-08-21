import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlBridgeErpRepository } from '../../src/adapters/sqlbridge/SqlBridgeErpRepository.ts';

function repo(rowsByProc: Record<string, any[]> = {}) {
  const queries: string[] = [];
  const fetcher: typeof fetch = async (_u, init) => {
    const q = JSON.parse(String(init?.body)).query;
    queries.push(q);
    const hit = Object.entries(rowsByProc).find(([k]) => q.includes(k));
    return Response.json({ ok: true, rows: hit?.[1] ?? [] });
  };
  return { queries, erp: new SqlBridgeErpRepository({ url: 'https://sql.test', catalogProcedure: 'dbo.sp_BuscarProductosVenta', fetcher }) };
}

test('preserves SQL to RAG product identity on quote', async () => {
  const { erp } = repo({ 'sp_BuscarProductosVenta': [{ producto: 'Armor X13', producto_codigo: 'P000048', producto_rag_id: 'P-ARMOR-X13', producto_id_interno: 48, sku: 'ARMOR-X13', part_number: 'X13', ean: '123', precio: 899, stock: 4, moneda: 'PEN', categoria_codigo: 'C001', categoria: 'Celulares', subcategoria_codigo: 'S0001', subcategoria: 'Rugged', garantia_meses: 12, estado_comercial: 'ACTIVO' }] });
  const q = await erp.getProductQuote('Armor X13');
  assert.equal(q?.productRagId, 'P-ARMOR-X13');
  assert.equal(q?.categoryCode, 'C001');
  assert.equal(q?.warrantyMonths, 12);
});

test('uses whitelisted catalog/navigation stored procedures', async () => {
  const { erp, queries } = repo();
  await erp.resolveCatalogContext?.('celulares');
  await erp.listCategories?.();
  await erp.listSubcategories?.('C001');
  await erp.listCatalog?.({ categoryCode: 'C001' });
  assert.match(queries[0], /^EXEC dbo\.sp_ResolverContextoCatalogoVenta /);
  assert.match(queries[1], /^EXEC dbo\.sp_ListarCategoriasVenta /);
  assert.match(queries[2], /^EXEC dbo\.sp_ListarSubcategoriasVenta /);
  assert.match(queries[3], /^EXEC dbo\.sp_ListarCatalogoVenta /);
  assert.equal(queries.some(q => /RegistrarReserva/i.test(q)), false);
});

test('protected order lookup calls sp_ConsultarPedido only with both exact values', async () => {
  const { erp, queries } = repo({ 'sp_ConsultarPedido': [{ numero_pedido: 'ABC123', estado: 'ENVIADO' }] });
  await assert.rejects(() => erp.consultOrder!('', 'a@b.com'), /order number and email/i);
  await assert.rejects(() => erp.consultOrder!('ABC123', ''), /order number and email/i);
  const r = await erp.consultOrder!('ABC123', 'a@b.com');
  assert.equal(r?.numero_pedido, 'ABC123');
  assert.match(queries.at(-1)!, /^EXEC dbo\.sp_ConsultarPedido /);
});

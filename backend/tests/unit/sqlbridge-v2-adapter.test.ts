import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlBridgeErpRepository } from '../../src/adapters/sqlbridge/SqlBridgeErpRepository.ts';

test('bridge v2 sends allowlisted EXEC query and reads rows envelope', async () => {
  let sent: any;
  const fetcher = async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok: true,
      statusCode: 200,
      rows: [{ producto: 'Armor X13', precio: 899, stock: 4 }],
      error: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const erp = new SqlBridgeErpRepository({
    url: 'http://n8n/webhook/stech-sql-bridge-v2',
    token: 'test-token',
    catalogProcedure: 'dbo.sp_BuscarProductosVenta',
    fetcher: fetcher as any,
  });

  const quote = await erp.getProductQuote('Armor X13');
  assert.match(sent.query, /^EXEC dbo\.sp_BuscarProductosVenta /);
  assert.match(sent.query, /@TextoBusqueda=N'Armor X13'/);
  assert.equal(quote?.product, 'Armor X13');
  assert.equal(quote?.price, 899);
  assert.equal(quote?.source, 'SQL_BRIDGE');
});

test('bridge v2 budget reuses catalog SP and filters returned authoritative prices', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    ok: true,
    rows: [
      { producto: 'Armor 25T Pro', precio: 1899, stock: 2 },
      { producto: 'Armor X13', precio: 899, stock: 4 },
      { producto: 'Armor 22', precio: 1199, stock: 3 },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  const erp = new SqlBridgeErpRepository({
    url: 'http://n8n/webhook/stech-sql-bridge-v2',
    catalogProcedure: 'dbo.sp_BuscarProductosVenta',
    fetcher: fetcher as any,
  });

  const rows = await erp.listProductsWithinBudget(1500);
  assert.deepEqual(rows.map(x => x.product), ['Armor X13', 'Armor 22']);
});

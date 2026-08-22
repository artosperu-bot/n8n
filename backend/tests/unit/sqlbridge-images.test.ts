import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlBridgeErpRepository } from '../../src/adapters/sqlbridge/SqlBridgeErpRepository.ts';

test('image lookup uses canonical SP and returns only valid URLs', async () => {
  let body:any;
  const fetcher: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ ok:true, rows:[
      { url_imagen:'https://cdn.test/x13-1.jpg', tipo_imagen:'principal' },
      { url_imagen:'javascript:bad', tipo_imagen:'otro' },
      { url_imagen:'https://cdn.test/x13-2.jpg', tipo_imagen:'lateral' },
    ] });
  };
  const erp = new SqlBridgeErpRepository({ url:'https://bridge.test', catalogProcedure:'dbo.sp_BuscarProductosVenta', fetcher });
  const rows = await erp.getProductImages('Armor X13', 10);
  assert.match(body.query, /^EXEC dbo\.sp_BuscarImagenesProductoVenta /);
  assert.match(body.query, /@TextoBusqueda=N'Armor X13'/);
  assert.match(body.query, /@MaxImagenes=10/);
  assert.deepEqual(rows.map(x=>x.url), ['https://cdn.test/x13-1.jpg','https://cdn.test/x13-2.jpg']);
});

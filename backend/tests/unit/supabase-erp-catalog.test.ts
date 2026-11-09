import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseErpRepository } from '../../src/adapters/supabase/SupabaseErpRepository.ts';

const now = new Date('2026-11-09T16:00:00Z');
const catalog = [
  { producto_id:'P-22', producto_codigo:'P000049', nombre:'Ulefone Armor 22 256GB', nombre_corto:'Armor 22', sku:'ARMOR-22-256G', ean:null, part_number:'ARMOR-22-256G', activo:true, categoria_id:'CEL', subcategoria_id:'RUGGED' },
  { producto_id:'P-25', producto_codigo:'P000050', nombre:'Ulefone Armor 25T Pro 256GB', nombre_corto:'Armor 25T Pro', sku:'ARMOR-25TPro-256GB', ean:null, part_number:'ARMOR-25TPro-256GB', activo:true, categoria_id:'CEL', subcategoria_id:'RUGGED' },
  { producto_id:'P-X12', producto_codigo:'P000047', nombre:'Ulefone Armor X12 Pro', nombre_corto:'Armor X12 Pro', sku:'ARMOR-X12Pro', ean:null, part_number:'ARMOR-X12Pro', activo:true, categoria_id:'CEL', subcategoria_id:'RUGGED' },
];
const arm = [
  {partnumber:'ARMOR-22-256G',title:'Ulefone Armor 22',brand:'Ulefone',price_pen:999,stock_erp:2,verified_at:'2026-11-09T15:30:00Z'},
  {partnumber:'ARMOR-25TPro-256GB',title:'Ulefone Armor 25T Pro',brand:'Ulefone',price_pen:1799,stock_erp:0,verified_at:'2026-11-09T15:30:00Z'},
  {partnumber:'ARMOR-X12Pro',title:'Ulefone Armor X12 Pro',brand:'Ulefone',price_pen:659,stock_erp:3,verified_at:null},
  {partnumber:'UNMAPPED-123',title:'Invented',brand:'None',price_pen:1,stock_erp:99,verified_at:'2026-11-09T15:30:00Z'},
];

function adapter(values = arm, offers: any[] = [], features: any[] = []) {
  const requests:URL[]=[];
  const fetcher:typeof fetch=async request => {
    const url=new URL(String(request));
    requests.push(url);
    const rows=url.pathname.endsWith('/arm_products')?values:url.pathname.endsWith('/arm_channel_offers')?offers.filter(o=>o.channel_code==='WEB_STECH'):url.pathname.endsWith('/v_ia_producto_capacidades')?features.filter(x=>x.seccion==='TERMICA'):catalog;
    return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
  };
  return {repo:new SupabaseErpRepository({url:'https://example.supabase.co',key:'test-only',fetcher,now:()=>now}),requests};
}

test('reads canonical identity from Supabase, not physical stock or distributor cost', async () => {
  const {repo,requests}=adapter();
  const q=await repo.getProductQuote('Armor 22');
  assert.equal(q?.productRagId,'P-22');
  assert.equal(q?.productCode,'P000049');
  assert.equal(q?.source,'SUPABASE');
  assert.equal(q?.price,999);
  assert.equal(q?.stock,2);
  assert.equal(requests.length,3);
  const same=await repo.getProductQuote('Armor 22');
  assert.equal(same?.productRagId,'P-22');
  assert.equal(requests.length,3,'cached materialized catalog prevents per-turn duplicate reads');
});

test('keeps unavailable and unverified commercial values distinct', async () => {
  const {repo}=adapter();
  assert.equal((await repo.getProductQuote('Armor 25T Pro'))?.stock,0,'verified zero stock');
  const x12=await repo.getProductQuote('Armor X12 Pro');
  assert.equal(x12?.price,null);
  assert.equal(x12?.stock,null);
  assert.equal(await repo.getProductQuote('UNMAPPED-123'),null);
  assert.deepEqual((await repo.listCatalog({onlyWithStock:true})).map(p=>p.shortName),['Armor 22']);
  assert.deepEqual((await repo.listProductsWithinBudget(1000)).map(p=>p.shortName),['Armor 22']);
});

test('answers both sides of a comparison without accidentally returning shared Armor family', async () => {
  const {repo}=adapter();
  const products=await repo.searchProducts('Compara Armor 22 con Armor 25T Pro');
  assert.deepEqual(products.map(p=>p.shortName),['Armor 22','Armor 25T Pro']);
  assert.equal((await repo.searchProducts('busco celular resistente')).length,0);
});

test('stale commercial fields are never offered as current', async () => {
  const stale=arm.map(p=>({...p,verified_at:'2026-11-06T00:00:00Z'}));
  const {repo}=adapter(stale);
  const product=await repo.getProductQuote('Armor 22');
  assert.equal(product?.price,null);
  assert.equal(product?.stock,null);
  assert.equal((await repo.listProductsWithinBudget(1500)).length,0);
});

test('Supabase request failure propagates rather than faking an empty catalog',async () => {
  const repo=new SupabaseErpRepository({
    url:'https://example.supabase.co',key:'test-only',
    fetcher:async () => new Response('{"error":"down"}',{status:503}),
  });
  await assert.rejects(repo.listCatalog(),/HTTP 503/);
});

test('web offer price wins over list price; unpublished offer is never quoted', async () => {
  const offers=[
    {partnumber:'ARMOR-22-256G',channel_code:'WEB_STECH',price_pen:1399,list_price_pen:1819,stock_publicado:null,active:true,is_published:true,source_sync_at:'2026-11-09T15:37:17Z'},
    {partnumber:'ARMOR-X12Pro',channel_code:'WEB_STECH',price_pen:799,list_price_pen:1039,stock_publicado:2,active:true,is_published:true,source_sync_at:'2026-11-09T15:37:17Z'},
    {partnumber:'ARMOR-25TPro-256GB',channel_code:'WEB_STECH',price_pen:2399,list_price_pen:3119,stock_publicado:null,active:true,is_published:false,source_sync_at:'2026-11-09T15:37:17Z'},
  ];
  const {repo}=adapter(arm,offers);
  const a=await repo.getProductQuote('Armor 22');
  assert.equal(a?.price,1399);
  assert.equal(a?.stock,null,'published stock missing is UNKNOWN, never physical stock');
  const x12=await repo.getProductQuote('Armor X12 Pro');
  assert.equal(x12?.price,799);
  assert.equal(x12?.stock,2);
  const missing=await repo.getProductQuote('Armor 25T Pro');
  assert.equal(missing?.price,null,'unpublished channel disables quoting even if legacy price is fresh');
});
test('stale web offer cannot override canonical verified price', async () => {
  const offers=[{partnumber:'ARMOR-22-256G',channel_code:'WEB_STECH',price_pen:1399,list_price_pen:1819,stock_publicado:8,active:true,is_published:true,source_sync_at:'2026-11-01T00:00:00Z'}];
  const {repo}=adapter(arm,offers);
  const product=await repo.getProductQuote('Armor 22');
  assert.equal(product?.price,null);
  assert.equal(product?.stock,null);
});

test('informal abbreviated model 25t pro resolves canonical product safely',async()=>{
 const {repo}=adapter();
 assert.equal((await repo.getProductQuote('25t pro'))?.productRagId,'P-25');
 assert.deepEqual((await repo.searchProducts('buenasss q diferencia hay del armor 22 con el 25t pro')).map(p=>p.shortName),['Armor 22','Armor 25T Pro']);
});

test('thermal selector is grounded in verified capability section, never the model guess',async()=>{
  const features=[
    {producto_id:'P-25',seccion:'TERMICA',content:'Características confirmadas de cámara térmica para Armor 25T Pro: Cámara térmica: Sí. Resolución térmica: 160 x 120.'},
    {producto_id:'P-X12',seccion:'TERMICA',content:'Cámara térmica: No.'}
  ];
  const {repo,requests}=adapter(arm,[],features);
  const verified=await repo.findProductsWithVerifiedFeature('TERMICA');
  assert.deepEqual(verified.map(p=>p.shortName),['Armor 25T Pro']);
  assert.ok(requests.some(url=>url.pathname.endsWith('/v_ia_producto_capacidades')&&url.searchParams.get('seccion')==='eq.TERMICA'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute } from '../../src/conversation/router/RoutePlanner.ts';

const p=(primary:any,secondary:any[]=[])=>({primary,secondary,confidence:.96,requiresClarification:false,attributes:[]});

test('maps SQL read intents to exact allowed stored procedures',()=>{
  assert.equal(planRoute(p('CATEGORIES')).sqlTools[0],'dbo.sp_ListarCategoriasVenta');
  assert.equal(planRoute(p('SUBCATEGORIES')).sqlTools[0],'dbo.sp_ListarSubcategoriasVenta');
  assert.equal(planRoute(p('CATALOG')).sqlTools[0],'dbo.sp_ListarCatalogoVenta');
  assert.equal(planRoute(p('IMAGES'),{hasProduct:true}).sqlTools[0],'dbo.sp_BuscarImagenesProductoVenta');
  assert.equal(planRoute(p('ORDER_STATUS'),{hasOrderCredentials:true}).sqlTools[0],'dbo.sp_ConsultarPedido');
});

test('product facts use product RAG while policy uses institutional RAG',()=>{
  assert.equal(planRoute(p('PRODUCT_INFO'),{hasProduct:true}).route,'RAG_PRODUCT');
  assert.equal(planRoute(p('ATTRIBUTE'),{hasProduct:true}).route,'RAG_PRODUCT');
  assert.equal(planRoute(p('POLICY')).route,'RAG_INSTITUTIONAL');
});

test('compound price+images preserves both SQL tools',()=>{
  const r=planRoute(p('PRICE_AVAILABILITY',['IMAGES']),{hasProduct:true});
  assert.equal(r.route,'SQL_PRODUCTS');
  assert.deepEqual(r.sqlTools,['dbo.sp_BuscarProductosVenta','dbo.sp_BuscarImagenesProductoVenta']);
});

test('purchase and human requests route to assisted handoff and never reserve',()=>{
  for(const primary of ['PURCHASE','HUMAN'] as const){
    const r=planRoute(p(primary),{hasProduct:true});
    assert.equal(r.route,'ASSISTED_HANDOFF');
    assert.equal(r.sqlTools.includes('dbo.sp_IA_RegistrarReserva24h_Idempotente'),false);
  }
});

test('missing identity or protected order credentials asks clarification',()=>{
  assert.equal(planRoute(p('IMAGES'),{hasProduct:false}).route,'CLARIFICATION');
  assert.equal(planRoute(p('ORDER_STATUS'),{hasOrderCredentials:false}).route,'CLARIFICATION');
});

test('warranty uses institutional RAG without product technical mixing',()=>{
  const r=planRoute(p('WARRANTY'),{hasProduct:true});
  assert.equal(r.route,'RAG_INSTITUTIONAL');
  assert.equal(r.needsInstitutionalRag,true);
  assert.equal(r.needsProductRag,false);
});

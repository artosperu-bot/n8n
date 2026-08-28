import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateConversationState,
  serializeConversationState,
} from '../../src/adapters/supabase/ConversationStateCodec.ts';

test('canonical serialization emits only ConversationState fields and no legacy aliases',()=>{
  const serialized=serializeConversationState({
    sessionId:'qa-canonical',
    contextVersion:7,
    activeProduct:'Armor 22',
    activeProductId:'P-ARMOR-22-256G',
    activeProductCode:'P000049',
    queryTarget:'Armor 22',
    recommendedProduct:'Armor 22',
    useCase:'trabajo_construccion',
    problem:'caidas_frecuentes',
    purchaseSignal:false,
    lastIntent:'PRODUCT_INFO',
    lastRoute:'RAG_PRODUCT',
    lastNba:'ASK_MISSING_FACT',
    pendingCommercialAction:'ASK_MISSING_FACT',
    pendingMissingFact:'presupuesto máximo',
    comparisonProducts:['Armor 22','Armor X13'],
    priorities:['resistencia','bateria'],
    spinFacts:['uso:trabajo_construccion','problema:caidas_frecuentes'],
    producto_activo:{nombre:'LEGACY WRONG'},
    producto_objetivo_turno:{nombre:'LEGACY WRONG'},
    producto_recomendado:{nombre:'LEGACY WRONG'},
    cliente:{actividad:'legacy'},
    venta:{senal_compra:true},
    conversacion:{accion_pendiente:'SOFT_CLOSE'},
    debug_trace:{legacy:true},
    actividad_activa:'legacy',
    problema_activo:'legacy',
    senal_compra:true,
    context_version:999,
    customer:{useCase:'legacy'},
    commercial:{purchaseSignal:true},
    pendingQuestion:{missingFact:'legacy'},
    pendingAction:{type:'SOFT_CLOSE'},
    arbitrary_adapter_key:'must-not-persist',
  } as any);

  assert.equal(serialized.activeProduct,'Armor 22');
  assert.equal(serialized.contextVersion,7);
  assert.equal(serialized.pendingCommercialAction,'ASK_MISSING_FACT');

  for(const forbidden of [
    'producto_activo','producto_objetivo_turno','producto_recomendado','cliente','venta','conversacion','debug_trace',
    'actividad_activa','problema_activo','senal_compra','context_version','customer','commercial','pendingQuestion','pendingAction',
    'arbitrary_adapter_key',
  ]) assert.equal(Object.hasOwn(serialized,forbidden),false,forbidden);
});

test('legacy persisted context hydrates into canonical ConversationState',()=>{
  const hydrated=hydrateConversationState({
    producto_activo:{producto_id:'P-ARMOR-22-256G',producto_codigo:'P000049',nombre:'Armor 22'},
    producto_objetivo_turno:{producto_id:'P-ARMOR-X13',producto_codigo:'P000048',nombre:'Armor X13'},
    producto_recomendado:{nombre:'Armor 22'},
    cliente:{
      tipo:'BUSINESS',sector:'construccion',actividad:'trabajo_construccion',problema:'caidas_frecuentes',
      prioridades:['resistencia','bateria'],presupuesto:1500,cantidad:12,requiere_factura:true,
    },
    venta:{senal_compra:true,objecion:'precio',etapa:'CIERRE'},
    conversacion:{accion_pendiente:'COLLECT_RESERVATION_DATA',ultima_intencion:'PURCHASE',ultima_ruta:'RESERVATION'},
    debug_trace:{finalIntent:'PURCHASE'},
  });

  assert.equal(hydrated.activeProduct,'Armor 22');
  assert.equal(hydrated.activeProductId,'P-ARMOR-22-256G');
  assert.equal(hydrated.activeProductCode,'P000049');
  assert.equal(hydrated.queryTarget,'Armor X13');
  assert.equal(hydrated.lastResolvedProductId,'P-ARMOR-X13');
  assert.equal(hydrated.lastResolvedProductCode,'P000048');
  assert.equal(hydrated.recommendedProduct,'Armor 22');
  assert.equal(hydrated.customerType,'BUSINESS');
  assert.equal(hydrated.sector,'construccion');
  assert.equal(hydrated.useCase,'trabajo_construccion');
  assert.equal(hydrated.problem,'caidas_frecuentes');
  assert.deepEqual(hydrated.priorities,['resistencia','bateria']);
  assert.equal(hydrated.budget,1500);
  assert.equal(hydrated.quantity,12);
  assert.equal(hydrated.invoiceRequired,true);
  assert.equal(hydrated.purchaseSignal,true);
  assert.equal(hydrated.objection,'precio');
  assert.equal(hydrated.commercialStage,'CIERRE');
  assert.equal(hydrated.lastNba,'COLLECT_RESERVATION_DATA');
  assert.equal(hydrated.lastIntent,'PURCHASE');
  assert.equal(hydrated.lastRoute,'RESERVATION');
  assert.deepEqual(hydrated.lastDecisionTrace,{finalIntent:'PURCHASE'});
});

test('canonical values always win over conflicting legacy fallbacks',()=>{
  const hydrated=hydrateConversationState({
    activeProduct:'Armor X13',
    activeProductId:'P-ARMOR-X13',
    activeProductCode:'P000048',
    queryTarget:'Armor X13',
    recommendedProduct:'Armor X13',
    useCase:'seguridad',
    problem:'turnos_largos',
    purchaseSignal:false,
    lastNba:'ANSWER_ONLY',
    lastIntent:'ATTRIBUTE',
    lastRoute:'RAG_PRODUCT',
    producto_activo:{producto_id:'WRONG',producto_codigo:'WRONG',nombre:'Armor 22'},
    producto_objetivo_turno:{producto_id:'WRONG2',producto_codigo:'WRONG2',nombre:'Armor 22'},
    producto_recomendado:{nombre:'Armor 22'},
    cliente:{actividad:'construccion',problema:'caidas'},
    venta:{senal_compra:true},
    conversacion:{accion_pendiente:'SOFT_CLOSE',ultima_intencion:'PURCHASE',ultima_ruta:'RESERVATION'},
  });

  assert.equal(hydrated.activeProduct,'Armor X13');
  assert.equal(hydrated.activeProductId,'P-ARMOR-X13');
  assert.equal(hydrated.activeProductCode,'P000048');
  assert.equal(hydrated.queryTarget,'Armor X13');
  assert.equal(hydrated.recommendedProduct,'Armor X13');
  assert.equal(hydrated.useCase,'seguridad');
  assert.equal(hydrated.problem,'turnos_largos');
  assert.equal(hydrated.purchaseSignal,false);
  assert.equal(hydrated.lastNba,'ANSWER_ONLY');
  assert.equal(hydrated.lastIntent,'ATTRIBUTE');
  assert.equal(hydrated.lastRoute,'RAG_PRODUCT');
});

test('serialization applies the existing commercial normalization boundary',()=>{
  const serialized=serializeConversationState({
    useCase:'stock_availability',
    spinFacts:['uso:stock_availability','[object Object]'],
    priorities:['resistencia','', 'resistencia'],
    comparisonProducts:['Armor 22','', 'Armor 22'],
  } as any);

  assert.equal(serialized.useCase,null);
  assert.deepEqual(serialized.spinFacts,[]);
  assert.deepEqual(serialized.priorities,['resistencia']);
  assert.deepEqual(serialized.comparisonProducts,['Armor 22']);
});

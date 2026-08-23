import test from 'node:test';
import assert from 'node:assert/strict';
import { extractReservationBundle, reservationBundleMissing } from '../../src/conversation/commercial/ReservationData.ts';
import { renderCommercialMove } from '../../src/conversation/commercial/ResponsePolicy.ts';

test('reservation data can be captured from one structured customer message',()=>{
  const data=extractReservationBundle('DNI: 12345678 | Nombre: Juan Perez Lopez | Dirección: Av. Arequipa 1234, Lima');
  assert.deepEqual(data,{document:'12345678',name:'Juan Perez Lopez',address:'Av. Arequipa 1234, Lima'});
  assert.deepEqual(reservationBundleMissing(data),[]);
});

test('reservation bundle reports only fields that are still missing',()=>{
  const data=extractReservationBundle('DNI: 12345678 | Nombre: Juan Perez Lopez');
  assert.deepEqual(reservationBundleMissing(data),['dirección completa']);
});

test('contextual N+1 adds value without repeating the same resistance number',()=>{
  const text=renderCommercialMove({
    action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor X12 Pro',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA_CAIDAS',
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m',productId:'P-X12',source:'TEST'}],
    relevantCustomerContext:{useCase:'WhatsApp y llamadas',problem:'caidas_frecuentes',priorities:['resistencia'],budget:1000,objection:null},
  } as any,'CAPABILITY')??'';
  assert.match(text,/ca[ií]das frecuentes|resistencia/i);
  assert.equal((text.match(/1\.5\s*m/gi)??[]).length,0,'the +1 should not repeat the same atomic fact already delivered in N');
});

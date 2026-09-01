import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationAdvance } from '../../src/conversation/HybridConversationEngine.ts';

test('READY reservation plus Dale preserves collected data and advances execution instead of restarting collection',()=>{
  const state:any={
    activeProduct:'Armor X13',purchaseSignal:true,
    reservationStage:'READY',reservationDocument:'70009999',reservationCustomerName:'QA Gate Cinco',reservationAddress:'Av. QA 500, Lima',
    lastNba:'EXECUTE_RESERVATION',pendingCommercialAction:'EXECUTE_RESERVATION',
  };
  const advance=reservationAdvance(state,'Dale');
  assert.ok(advance);
  assert.equal(advance!.stage,'READY');
  assert.equal(advance!.document,'70009999');
  assert.equal(advance!.name,'QA Gate Cinco');
  assert.equal(advance!.address,'Av. QA 500, Lima');
  assert.equal(advance!.nba,'EXECUTE_RESERVATION');
  assert.equal(advance!.route,'RESERVATION_READY');
  assert.doesNotMatch(advance!.answer,/DNI|Carn[eé]|nombres y apellidos|direcci[oó]n completa/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWhatsAppWindow } from '../../src/automation/WhatsAppPolicy.ts';

test('automation WhatsApp window allows a customer message just inside 24 hours',()=>{
  const now=new Date('2026-08-25T20:00:00.000Z');
  const result=evaluateWhatsAppWindow('2026-08-24T20:01:00.000Z',now,24);
  assert.deepEqual(result,{allowed:true,reason:null});
});

test('automation WhatsApp window rejects a customer message older than 24 hours',()=>{
  const now=new Date('2026-08-25T20:00:00.000Z');
  const result=evaluateWhatsAppWindow('2026-08-24T19:59:59.000Z',now,24);
  assert.deepEqual(result,{allowed:false,reason:'WHATSAPP_WINDOW_CLOSED'});
});

test('automation WhatsApp window rejects missing customer source timestamp',()=>{
  const result=evaluateWhatsAppWindow(null,new Date('2026-08-25T20:00:00.000Z'),24);
  assert.deepEqual(result,{allowed:false,reason:'CUSTOMER_TIMESTAMP_MISSING'});
});

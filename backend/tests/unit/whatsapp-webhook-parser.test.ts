import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppWebhook, verifyWhatsAppWebhook } from '../../src/adapters/whatsapp/WhatsAppWebhookAdapter.ts';

test('verifyWhatsAppWebhook accepts subscribe + matching token and preserves raw challenge',()=>{
  const query=new URLSearchParams({
    'hub.mode':'subscribe',
    'hub.verify_token':'STECH_WHATSAPP_VERIFY_2026',
    'hub.challenge':'12345',
  });
  assert.deepEqual(verifyWhatsAppWebhook(query,'STECH_WHATSAPP_VERIFY_2026'),{ok:true,challenge:'12345'});
});

test('verifyWhatsAppWebhook rejects wrong token',()=>{
  const query=new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':'wrong','hub.challenge':'12345'});
  assert.equal(verifyWhatsAppWebhook(query,'expected').ok,false);
});

test('parseWhatsAppWebhook safely extracts a real text message',()=>{
  const parsed=parseWhatsAppWebhook({
    object:'whatsapp_business_account',
    entry:[{changes:[{field:'messages',value:{
      metadata:{display_phone_number:'51999999999',phone_number_id:'1283086411554196'},
      contacts:[{profile:{name:'Cliente Prueba'},wa_id:'51911111111'}],
      messages:[{from:'51911111111',id:'wamid.TEST123',timestamp:'1787600000',type:'text',text:{body:'Hola, cuánto cuesta el Armor 22'}}],
    }}]}],
  });
  assert.equal(parsed.messages.length,1);
  assert.equal(parsed.statuses.length,0);
  assert.deepEqual(parsed.messages[0],{
    provider:'whatsapp',
    direction:'inbound',
    waMessageId:'wamid.TEST123',
    waId:'51911111111',
    phoneNumberId:'1283086411554196',
    displayPhoneNumber:'51999999999',
    type:'text',
    text:'Hola, cuánto cuesta el Armor 22',
    timestamp:'1787600000',
    contactName:'Cliente Prueba',
  });
});

test('parseWhatsAppWebhook recognizes status-only payload without inventing inbound messages',()=>{
  const parsed=parseWhatsAppWebhook({
    entry:[{changes:[{value:{
      metadata:{phone_number_id:'1283086411554196'},
      statuses:[{id:'wamid.OUT1',status:'delivered',timestamp:'1787600001',recipient_id:'51911111111'}],
    }}]}],
  });
  assert.equal(parsed.messages.length,0);
  assert.equal(parsed.statuses.length,1);
  assert.equal(parsed.statuses[0].status,'delivered');
  assert.equal(parsed.statuses[0].messageId,'wamid.OUT1');
});

test('parseWhatsAppWebhook tolerates missing arrays and multiple entry/change branches',()=>{
  const parsed=parseWhatsAppWebhook({entry:[
    {changes:[{value:{messages:[{from:'5191',id:'wamid.A',timestamp:'1',type:'image',image:{id:'media-a'}}]}}]},
    {changes:[{value:{statuses:[{id:'wamid.B',status:'read',timestamp:'2',recipient_id:'5192'}]}},{value:{}}]},
    {},
  ]});
  assert.equal(parsed.messages.length,1);
  assert.equal(parsed.messages[0].type,'image');
  assert.equal(parsed.messages[0].text,null);
  assert.equal(parsed.statuses.length,1);
  assert.ok(parsed.changeCount>=3);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/config.ts';

test('loadConfig exposes WhatsApp Cloud API settings with v25.0 default',()=>{
  const config=loadConfig({
    STECH_PROFILE:'test',
    WHATSAPP_VERIFY_TOKEN:'verify-test',
    WHATSAPP_ACCESS_TOKEN:'secret-test',
    WHATSAPP_PHONE_NUMBER_ID:'1283086411554196',
    WHATSAPP_APP_ID:'2264991854297489',
  });
  assert.equal(config.whatsappVerifyToken,'verify-test');
  assert.equal(config.whatsappAccessToken,'secret-test');
  assert.equal(config.whatsappPhoneNumberId,'1283086411554196');
  assert.equal(config.whatsappAppId,'2264991854297489');
  assert.equal(config.whatsappGraphApiVersion,'v25.0');
});

test('loadConfig allows overriding WhatsApp Graph API version',()=>{
  const config=loadConfig({STECH_PROFILE:'test',WHATSAPP_GRAPH_API_VERSION:'v26.0'});
  assert.equal(config.whatsappGraphApiVersion,'v26.0');
});

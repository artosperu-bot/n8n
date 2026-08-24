import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppCloudApiClient } from '../../src/adapters/whatsapp/WhatsAppCloudApiClient.ts';

test('WhatsAppCloudApiClient sends text through configured Graph API endpoint',async()=>{
  const calls:Array<{url:string;init:RequestInit}> = [];
  const client=new WhatsAppCloudApiClient({
    accessToken:'secret-token',
    phoneNumberId:'1283086411554196',
    version:'v25.0',
    fetcher:async(url,init)=>{
      calls.push({url:String(url),init:init??{}});
      return new Response(JSON.stringify({messages:[{id:'wamid.OUT123'}]}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  const result=await client.sendText('51911111111','Hola');
  assert.equal(result.messageId,'wamid.OUT123');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://graph.facebook.com/v25.0/1283086411554196/messages');
  assert.equal((calls[0].init.headers as Record<string,string>).authorization,'Bearer secret-token');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)),{
    messaging_product:'whatsapp',recipient_type:'individual',to:'51911111111',type:'text',text:{preview_url:false,body:'Hola'},
  });
});

test('WhatsAppCloudApiClient errors are bounded and never leak access token',async()=>{
  const client=new WhatsAppCloudApiClient({
    accessToken:'VERY-SECRET-TOKEN',phoneNumberId:'1283086411554196',version:'v25.0',
    fetcher:async()=>new Response('failure for 51911111111',{status:400}),
  });
  await assert.rejects(()=>client.sendText('51911111111','Hola'),error=>{
    const message=String((error as Error).message);
    assert.ok(!message.includes('VERY-SECRET-TOKEN'));
    assert.ok(!message.includes('51911111111'));
    assert.ok(message.length<500);
    return true;
  });
});

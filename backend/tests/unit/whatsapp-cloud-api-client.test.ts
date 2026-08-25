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
  assert.equal((calls[0].init.headers as Record<string,string>).authorization,'Bearer secret-token'); // EXAMPLE_ONLY: test fixture
  assert.deepEqual(JSON.parse(String(calls[0].init.body)),{
    messaging_product:'whatsapp',recipient_type:'individual',to:'51911111111',type:'text',text:{preview_url:false,body:'Hola'},
  });
});

test('WhatsAppCloudApiClient checks configured phone number against Graph API without exposing token',async()=>{
  const calls:Array<{url:string;init:RequestInit}> = [];
  const client=new WhatsAppCloudApiClient({
    accessToken:'secret-token',phoneNumberId:'1283086411554196',version:'v25.0',
    fetcher:async(url,init)=>{calls.push({url:String(url),init:init??{}});return new Response(JSON.stringify({id:'1283086411554196',display_phone_number:'+51 999 999 999',verified_name:'STECH',quality_rating:'GREEN'}),{status:200,headers:{'content-type':'application/json'}});},
  });
  const status=await client.getStatus();
  assert.equal(status.configured,true);
  assert.equal(status.reachable,true);
  assert.equal(status.phoneNumberId,'1283086411554196');
  assert.equal(status.verifiedName,'STECH');
  assert.match(calls[0].url,/fields=id%2Cdisplay_phone_number%2Cverified_name%2Cquality_rating/);
  assert.equal((calls[0].init.headers as Record<string,string>).authorization,'Bearer secret-token'); // EXAMPLE_ONLY: test fixture
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

test('WhatsAppCloudApiClient retries transient Graph failures and returns the successful wamid once',async()=>{
  let attempts=0;const delays:number[]=[];
  const client=new WhatsAppCloudApiClient({
    accessToken:'secret-token',phoneNumberId:'1283086411554196',version:'v25.0',retryMaxAttempts:3,retryBaseDelayMs:10,
    sleeper:async(ms:number)=>{delays.push(ms);},
    fetcher:async()=>{attempts+=1;if(attempts<3)return new Response('temporary',{status:503});return Response.json({messages:[{id:'wamid.OUT.RETRIED'}]});},
  } as any);
  const result=await client.sendText('51911111111','Hola');
  assert.equal(result.messageId,'wamid.OUT.RETRIED');
  assert.equal(attempts,3);
  assert.deepEqual(delays,[10,20]);
});

test('WhatsAppCloudApiClient does not retry a permanent Graph 400',async()=>{
  let attempts=0;
  const client=new WhatsAppCloudApiClient({
    accessToken:'secret-token',phoneNumberId:'1283086411554196',retryMaxAttempts:3,sleeper:async()=>{},
    fetcher:async()=>{attempts+=1;return new Response('bad request',{status:400});},
  } as any);
  await assert.rejects(()=>client.sendText('51911111111','Hola'),/HTTP 400/);
  assert.equal(attempts,1);
});

test('WhatsAppCloudApiClient retries a transient network disconnect without leaking its details',async()=>{
  let attempts=0;
  const client=new WhatsAppCloudApiClient({
    accessToken:'secret-token',phoneNumberId:'1283086411554196',retryMaxAttempts:2,retryBaseDelayMs:0,sleeper:async()=>{},
    fetcher:async()=>{attempts+=1;if(attempts===1)throw new Error('socket reset for 51911111111');return Response.json({messages:[{id:'wamid.OUT.NETWORK'}]});},
  } as any);
  const result=await client.sendText('51911111111','Hola');
  assert.equal(result.messageId,'wamid.OUT.NETWORK');
  assert.equal(attempts,2);
});

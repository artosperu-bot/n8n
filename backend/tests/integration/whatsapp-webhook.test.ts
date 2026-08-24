import test from 'node:test';
import assert from 'node:assert/strict';
import { createStechApp } from '../../src/app.ts';

async function withApp(run:(base:string)=>Promise<void>){
  const app=createStechApp({env:{STECH_PROFILE:'test',WHATSAPP_VERIFY_TOKEN:'STECH_WHATSAPP_VERIFY_2026'}});
  await app.listen(0,'127.0.0.1');
  try{
    const address=app.address();
    if(!address||typeof address==='string')throw new Error('no address');
    await run(`http://127.0.0.1:${address.port}`);
  }finally{await app.close();}
}

test('GET /webhooks/whatsapp returns raw challenge for valid Meta verification',async()=>withApp(async base=>{
  const response=await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=STECH_WHATSAPP_VERIFY_2026&hub.challenge=12345`);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')??'',/^text\/plain/);
  assert.equal(await response.text(),'12345');
}));

test('GET /webhooks/whatsapp returns 403 for invalid verify token',async()=>withApp(async base=>{
  const response=await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  assert.equal(response.status,403);
}));

const textEnvelope={entry:[{changes:[{value:{metadata:{phone_number_id:'1283086411554196'},messages:[{from:'51911111111',id:'wamid.IN1',timestamp:'1787600000',type:'text',text:{body:'Hola'}}]}}]}]};

test('POST /webhooks/whatsapp accepts a text-message envelope without invoking chat API',async()=>withApp(async base=>{
  const response=await fetch(`${base}/webhooks/whatsapp`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(textEnvelope),
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true});
  const session=await fetch(`${base}/api/sessions/${encodeURIComponent('whatsapp:51911111111')}`);
  const sessionBody=await session.json() as any;
  assert.equal(sessionBody.messages.length,0);
}));

test('POST /webhooks/whatsapp accepts statuses without creating a fake inbound message',async()=>withApp(async base=>{
  const response=await fetch(`${base}/webhooks/whatsapp`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({entry:[{changes:[{value:{statuses:[{id:'wamid.OUT1',status:'read',timestamp:'1787600000',recipient_id:'51911111111'}]}}]}]}),
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true});
  const session=await fetch(`${base}/api/sessions/${encodeURIComponent('whatsapp:51911111111')}`);
  const sessionBody=await session.json() as any;
  assert.equal(sessionBody.messages.length,0);
}));

test('repeated Meta delivery is side-effect-free during Gate 1',async()=>withApp(async base=>{
  for(let i=0;i<2;i++){
    const response=await fetch(`${base}/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(textEnvelope)});
    assert.equal(response.status,200);
  }
  const session=await fetch(`${base}/api/sessions/${encodeURIComponent('whatsapp:51911111111')}`);
  const sessionBody=await session.json() as any;
  assert.equal(sessionBody.messages.length,0);
  assert.equal(sessionBody.state.turnCount??0,0);
}));

test('POST /webhooks/whatsapp rejects malformed JSON without crashing server',async()=>withApp(async base=>{
  const response=await fetch(`${base}/webhooks/whatsapp`,{method:'POST',headers:{'content-type':'application/json'},body:'{not-json'});
  assert.equal(response.status,400);
  const body=await response.json() as any;
  assert.ok(body.error);
}));

import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppInboundProcessor } from '../../src/adapters/whatsapp/WhatsAppInboundProcessor.ts';

const message={provider:'whatsapp',direction:'inbound',waMessageId:'wamid.AUTO.IN1',waId:'51911111111',phoneNumberId:'1283086411554196',displayPhoneNumber:null,type:'text',text:'Hola',timestamp:'1787600000',contactName:'Cliente'} as const;

function baseCrm(calls:any[],duplicate=false){return{
  async recordInbound(input:any){calls.push(['inbound',input]);return{mode:'BOT',version:1,duplicate};},
  async getAttentionState(){return{mode:'BOT',version:1};},
  async recordBotMessage(input:any){calls.push(['bot',input]);},
} as any;}
function engine(calls:any[]){return{async processTurn(input:any){calls.push(['engine',input]);return{answer:'Respuesta STECH',state:{blockAutomaticReply:false}};}} as any;}
function whatsapp(calls:any[]){return{async sendText(to:string,text:string){calls.push(['send',to,text]);return{messageId:'wamid.AUTO.OUT1'};}} as any;}

test('WhatsApp inbound persists Meta source timestamp and emits automation event after persistence',async()=>{
  const calls:any[]=[];
  const scheduler={async onCustomerMessage(input:any){calls.push(['automation',input]);return{cancelled:0,scheduled:1};}};
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  await processor.processMessage(message as any);
  const expected=new Date(Number(message.timestamp)*1000).toISOString();
  assert.equal(calls.find(x=>x[0]==='inbound')?.[1]?.sourceSentAt,expected);
  assert.equal(calls.find(x=>x[0]==='automation')?.[1]?.sourceSentAt,expected);
  assert.equal(calls.find(x=>x[0]==='automation')?.[1]?.messageId,'wamid.AUTO.IN1');
  assert.equal(calls.find(x=>x[0]==='automation')?.[1]?.attentionMode,'BOT');
});

test('duplicate inbound is explicitly marked for the automation scheduler',async()=>{
  const calls:any[]=[];
  const scheduler={async onCustomerMessage(input:any){calls.push(['automation',input]);return{cancelled:0,scheduled:0};}};
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls,true),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  await processor.processMessage(message as any);
  assert.equal(calls.find(x=>x[0]==='automation')?.[1]?.duplicate,true);
});

test('automation persistence failure cannot break the existing bot reply path',async()=>{
  const calls:any[]=[];
  const scheduler={async onCustomerMessage(){throw new Error('automation repository unavailable');}};
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  const result=await processor.processMessage(message as any);
  assert.equal(result.processed,true);
  assert.ok(calls.some(x=>x[0]==='engine'));
  assert.ok(calls.some(x=>x[0]==='send'));
});

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

test('customer inbound persists Meta timestamp, cancels old jobs, then BOT send schedules unanswered followup',async()=>{
  const calls:any[]=[];
  const scheduler={
    async onCustomerMessage(input:any){calls.push(['automation-customer',input]);return{cancelled:1,scheduled:0};},
    async onBotMessage(input:any){calls.push(['automation-bot',input]);return{scheduled:1};},
  };
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  await processor.processMessage(message as any);
  const expected=new Date(Number(message.timestamp)*1000).toISOString();
  assert.equal(calls.find(x=>x[0]==='inbound')?.[1]?.sourceSentAt,expected);
  assert.equal(calls.find(x=>x[0]==='automation-customer')?.[1]?.messageId,'wamid.AUTO.IN1');
  const botAutomation=calls.find(x=>x[0]==='automation-bot')?.[1];
  assert.equal(botAutomation?.customerMessageId,'wamid.AUTO.IN1');
  assert.equal(botAutomation?.recipient,'51911111111');
  assert.equal(botAutomation?.attentionMode,'BOT');
  assert.ok(botAutomation?.botSentAt);
  assert.ok(calls.findIndex(x=>x[0]==='bot') < calls.findIndex(x=>x[0]==='automation-bot'));
});

test('duplicate inbound is explicitly marked for cancellation scheduler and cannot create BOT followup',async()=>{
  const calls:any[]=[];
  const scheduler={
    async onCustomerMessage(input:any){calls.push(['automation-customer',input]);return{cancelled:0,scheduled:0};},
    async onBotMessage(input:any){calls.push(['automation-bot',input]);return{scheduled:0};},
  };
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls,true),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  await processor.processMessage(message as any);
  assert.equal(calls.find(x=>x[0]==='automation-customer')?.[1]?.duplicate,true);
  assert.equal(calls.filter(x=>x[0]==='automation-bot').length,0);
});

test('automation persistence failure cannot break the existing bot reply path',async()=>{
  const calls:any[]=[];
  const scheduler={
    async onCustomerMessage(){throw new Error('automation repository unavailable');},
    async onBotMessage(){throw new Error('automation repository unavailable after send');},
  };
  const processor=new WhatsAppInboundProcessor({crm:baseCrm(calls),engine:engine(calls),whatsapp:whatsapp(calls),automationScheduler:scheduler as any,burstWindowMs:0});
  const result=await processor.processMessage(message as any);
  assert.equal(result.processed,true);
  assert.ok(calls.some(x=>x[0]==='engine'));
  assert.ok(calls.some(x=>x[0]==='send'));
  assert.ok(calls.some(x=>x[0]==='bot'));
});

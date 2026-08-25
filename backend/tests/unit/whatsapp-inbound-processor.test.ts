import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppInboundProcessor } from '../../src/adapters/whatsapp/WhatsAppInboundProcessor.ts';

const message={provider:'whatsapp',direction:'inbound',waMessageId:'wamid.IN1',waId:'51911111111',phoneNumberId:'1283086411554196',displayPhoneNumber:null,type:'text',text:'Hola',timestamp:'1787600000',contactName:'Cliente'} as const;

test('BOT WhatsApp inbound uses wamid as messageId, persists and sends backend answer through Meta',async()=>{
  const calls:any[]=[];
  const crm={
    async recordInbound(input:any){calls.push(['recordInbound',input]);return{mode:'BOT',version:1};},
    async getAttentionState(){return{mode:'BOT',version:1};},
    async recordBotMessage(input:any){calls.push(['recordBotMessage',input]);},
  } as any;
  const engine={async processTurn(input:any){calls.push(['engine',input]);return{answer:'Respuesta STECH',state:{blockAutomaticReply:false}};}} as any;
  const whatsapp={async sendText(to:string,text:string){calls.push(['sendText',to,text]);return{messageId:'wamid.OUT1'};}} as any;
  const processor=new WhatsAppInboundProcessor({crm,engine,whatsapp});
  await processor.processMessage(message as any);
  assert.deepEqual(calls.find(x=>x[0]==='engine')?.[1],{sessionId:'whatsapp:51911111111',message:'Hola',messageId:'wamid.IN1'});
  assert.deepEqual(calls.find(x=>x[0]==='sendText')?.slice(1),['51911111111','Respuesta STECH']);
  assert.equal(calls.find(x=>x[0]==='recordBotMessage')?.[1].messageId,'wamid.OUT1');
});

test('HUMANO or ESPERANDO_ASESOR inbound is stored but never invokes bot or sends automatic Meta reply',async()=>{
  for(const mode of ['HUMANO','ESPERANDO_ASESOR','CERRADO']){
    let engineCalls=0;let sends=0;
    const processor=new WhatsAppInboundProcessor({
      crm:{async recordInbound(){return{mode,version:2};},async getAttentionState(){return{mode,version:2};},async recordBotMessage(){}} as any,
      engine:{async processTurn(){engineCalls+=1;throw new Error('must not run');}} as any,
      whatsapp:{async sendText(){sends+=1;throw new Error('must not send');}} as any,
    });
    await processor.processMessage(message as any);
    assert.equal(engineCalls,0,mode);
    assert.equal(sends,0,mode);
  }
});

test('advisor takeover while AI is processing suppresses the pending automatic reply',async()=>{
  let checks=0;let sends=0;
  const processor=new WhatsAppInboundProcessor({
    crm:{
      async recordInbound(){return{mode:'BOT',version:3};},
      async getAttentionState(){checks+=1;return{mode:'HUMANO',version:4};},
      async recordBotMessage(){throw new Error('must not record');},
    } as any,
    engine:{async processTurn(){return{answer:'Respuesta que ya no debe salir',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(){sends+=1;return{messageId:'x'};}} as any,
  });
  const result=await processor.processMessage(message as any);
  assert.equal(checks,1);
  assert.equal(sends,0);
  assert.equal(result.suppressed,true);
});

test('CRM message duplicate still reaches engine so unfinished first delivery can recover',async()=>{
  let engineCalls=0;
  const processor=new WhatsAppInboundProcessor({
    crm:{async recordInbound(){return{mode:'BOT',version:1,duplicate:true};},async getAttentionState(){return{mode:'BOT',version:1};},async recordBotMessage(){}} as any,
    engine:{async processTurn(){engineCalls+=1;return{answer:'Recuperada',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(){return{messageId:'wamid.RECOVERED'};}} as any,
  });
  const result=await processor.processMessage(message as any);
  assert.equal(engineCalls,1);
  assert.equal(result.processed,true);
});

test('duplicate acquire from engine is treated as ignored webhook duplicate, not a second reply',async()=>{
  let sends=0;
  const processor=new WhatsAppInboundProcessor({
    crm:{async recordInbound(){return{mode:'BOT',version:1,duplicate:true};},async getAttentionState(){return{mode:'BOT',version:1};},async recordBotMessage(){}} as any,
    engine:{async processTurn(){throw new Error('Supabase turn acquire rejected: ALREADY_DONE');}} as any,
    whatsapp:{async sendText(){sends+=1;return{messageId:'x'};}} as any,
  });
  const result=await processor.processMessage(message as any);
  assert.equal(result.duplicate,true);
  assert.equal(sends,0);
});

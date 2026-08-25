import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppInboundProcessor } from '../../src/adapters/whatsapp/WhatsAppInboundProcessor.ts';

const message={provider:'whatsapp',direction:'inbound',waMessageId:'wamid.IN1',waId:'51911111111',phoneNumberId:'1283086411554196',displayPhoneNumber:null,type:'text',text:'Hola',timestamp:'1787600000',contactName:'Cliente'} as const;

function fragment(waMessageId:string,text:string){return{...message,waMessageId,text};}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((ok,fail)=>{resolve=ok;reject=fail;});return{promise,resolve,reject};}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('WhatsApp burst joins physical fragments into one logical AI turn and one reply',async()=>{
  const recorded:string[]=[];const linked:any[]=[];const engineCalls:any[]=[];const sends:any[]=[];
  const processor=new WhatsAppInboundProcessor({
    crm:{
      async recordInbound(input:any){recorded.push(input.messageId);return{mode:'BOT',version:1};},
      async markInboundAggregation(input:any){linked.push(input);},
      async getAttentionState(){return{mode:'BOT',version:1};},
      async recordBotMessage(){},
    } as any,
    engine:{async processTurn(input:any){engineCalls.push(input);return{answer:'Respuesta coherente',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(to:string,text:string){sends.push([to,text]);return{messageId:'wamid.OUT.BURST'};}} as any,
    burstWindowMs:15,
  } as any);

  const first=processor.processMessage(fragment('wamid.FRAGMENT.1','Cómo') as any);
  await delay(5);
  const second=processor.processMessage(fragment('wamid.FRAGMENT.2','Estas') as any);
  await Promise.all([first,second]);

  assert.deepEqual(recorded,['wamid.FRAGMENT.1','wamid.FRAGMENT.2']);
  assert.equal(engineCalls.length,1);
  assert.deepEqual(engineCalls[0],{sessionId:'whatsapp:51911111111',message:'Cómo\nEstas',messageId:'wamid.FRAGMENT.1'});
  assert.equal(sends.length,1);
  assert.equal(linked.length,1);
  assert.deepEqual(linked[0].messageIds,['wamid.FRAGMENT.1','wamid.FRAGMENT.2']);
  assert.equal(linked[0].logicalMessageId,'wamid.FRAGMENT.1');
});

test('P6.31 second fragment while first engine call is processing suppresses stale reply and deterministically reprocesses the coherent input',async()=>{
  const firstEngine=deferred<any>();const engineCalls:any[]=[];const sends:any[]=[];const recorded:string[]=[];const linked:any[]=[];
  const processor=new WhatsAppInboundProcessor({
    crm:{
      async recordInbound(input:any){recorded.push(input.messageId);return{mode:'BOT',version:1};},
      async markInboundAggregation(input:any){linked.push(input);},
      async getAttentionState(){return{mode:'BOT',version:1};},
      async recordBotMessage(){},
    } as any,
    engine:{async processTurn(input:any){engineCalls.push(input);if(engineCalls.length===1)return firstEngine.promise;return{answer:'¿Cómo estás? Todo bien.',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(to:string,text:string){sends.push([to,text]);return{messageId:'wamid.OUT.P631'};}} as any,
    burstWindowMs:5,
  } as any);

  const first=processor.processMessage(fragment('wamid.P631.1','Cómo') as any);
  await delay(12);
  assert.equal(engineCalls.length,1,'precondition: first logical turn acquired processing');
  const second=processor.processMessage(fragment('wamid.P631.2','Estas') as any);
  await delay(2);
  firstEngine.resolve({answer:'Respuesta basada sólo en Cómo',state:{blockAutomaticReply:false}});
  await Promise.all([first,second]);

  assert.deepEqual(recorded,['wamid.P631.1','wamid.P631.2']);
  assert.equal(engineCalls.length,2);
  assert.deepEqual(engineCalls[1],{sessionId:'whatsapp:51911111111',message:'Cómo\nEstas',messageId:'wamid.P631.2'});
  assert.deepEqual(sends,[['51911111111','¿Cómo estás? Todo bien.']]);
  assert.ok(linked.some(value=>value.logicalMessageId==='wamid.P631.2'&&value.status==='REPROCESSED'));
});

test('BOT WhatsApp inbound uses wamid as messageId, persists and sends backend answer through Meta',async()=>{
  const calls:any[]=[];
  const crm={
    async recordInbound(input:any){calls.push(['recordInbound',input]);return{mode:'BOT',version:1};},
    async getAttentionState(){return{mode:'BOT',version:1};},
    async recordBotMessage(input:any){calls.push(['recordBotMessage',input]);},
  } as any;
  const engine={async processTurn(input:any){calls.push(['engine',input]);return{answer:'Respuesta STECH',state:{blockAutomaticReply:false}};}} as any;
  const whatsapp={async sendText(to:string,text:string){calls.push(['sendText',to,text]);return{messageId:'wamid.OUT1'};}} as any;
  const processor=new WhatsAppInboundProcessor({crm,engine,whatsapp,burstWindowMs:0});
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
      burstWindowMs:0,
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
    burstWindowMs:0,
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
    burstWindowMs:0,
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
    burstWindowMs:0,
  });
  const result=await processor.processMessage(message as any);
  assert.equal(result.duplicate,true);
  assert.equal(sends,0);
});

test('outbound CRM persistence is retried without sending a duplicate Meta reply',async()=>{
  let persistAttempts=0;let sends=0;
  const processor=new WhatsAppInboundProcessor({
    crm:{
      async recordInbound(){return{mode:'BOT',version:1};},async getAttentionState(){return{mode:'BOT',version:1};},
      async recordBotMessage(){persistAttempts+=1;if(persistAttempts<3)throw new Error('temporary CRM write failure');},
    } as any,
    engine:{async processTurn(){return{answer:'Una sola respuesta',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(){sends+=1;return{messageId:'wamid.OUT.PERSIST'};}} as any,
    burstWindowMs:0,persistenceRetryAttempts:3,retryBaseDelayMs:0,sleeper:async()=>{},
  } as any);
  const result=await processor.processMessage(message as any);
  assert.equal(result.processed,true);
  assert.equal(sends,1);
  assert.equal(persistAttempts,3);
});

test('successful Graph response without an outbound wamid fails visibly instead of silently skipping audit',async()=>{
  const processor=new WhatsAppInboundProcessor({
    crm:{async recordInbound(){return{mode:'BOT',version:1};},async getAttentionState(){return{mode:'BOT',version:1};},async recordBotMessage(){throw new Error('must not run');}} as any,
    engine:{async processTurn(){return{answer:'Respuesta',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(){return{messageId:null};}} as any,
    burstWindowMs:0,
  });
  await assert.rejects(()=>processor.processMessage(message as any),/WHATSAPP_MESSAGE_ID_REQUIRED/);
});

test('aggregation audit failure is explicit but cannot abandon a persisted inbound before the engine',async()=>{
  let engineCalls=0;let sends=0;
  const processor=new WhatsAppInboundProcessor({
    crm:{
      async recordInbound(){return{mode:'BOT',version:1};},
      async markInboundAggregation(){throw new Error('metadata unavailable');},
      async getAttentionState(){return{mode:'BOT',version:1};},async recordBotMessage(){},
    } as any,
    engine:{async processTurn(){engineCalls+=1;return{answer:'Procesada',state:{blockAutomaticReply:false}};}} as any,
    whatsapp:{async sendText(){sends+=1;return{messageId:'wamid.OUT.AUDIT'};}} as any,
    burstWindowMs:0,persistenceRetryAttempts:1,
  } as any);
  const result=await processor.processMessage(message as any);
  assert.equal(result.processed,true);
  assert.equal(engineCalls,1);
  assert.equal(sends,1);
});

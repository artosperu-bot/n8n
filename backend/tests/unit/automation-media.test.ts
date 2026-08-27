import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationScheduler } from '../../src/automation/AutomationScheduler.ts';
import { AutomationWorker } from '../../src/automation/AutomationWorker.ts';
import { WhatsAppCloudApiClient } from '../../src/adapters/whatsapp/WhatsAppCloudApiClient.ts';

function baseRule(overrides:Record<string,unknown>={}){
  return {
    id:'r-media',name:'Seguimiento con imagen',eventType:'BOT_MESSAGE_SENT',delaySeconds:3600,
    actionType:'SEND_IMAGE_PRODUCT_AUTO',messageTemplate:'👋 ¿Qué te pareció el equipo?',mediaUrl:null,
    active:true,priority:100,...overrides,
  } as any;
}

class SchedulerRepo {
  rules:any[]=[baseRule()];
  scheduled:any[]=[];
  async listActiveRules(){return this.rules;}
  async cancelPending(){return 0;}
  async scheduleJob(input:any){this.scheduled.push(input);return {...input,id:'j-media',status:'PENDING',attemptCount:0};}
  async claimDue(){return[];} async getRule(){return null;} async markTerminal(){} async recordExecution(){}
  async listRules(){return this.rules;} async createRule(){throw new Error('not used');} async updateRule(){throw new Error('not used');}
  async setRuleActive(){throw new Error('not used');} async listJobs(){return[];}
}

test('automatic product image is resolved and frozen when BOT follow-up job is scheduled',async()=>{
  const repo=new SchedulerRepo();
  const mediaResolver={
    async resolveForSession(){return{mediaUrl:'https://cdn.stech.test/armor-x13.webp',mediaType:'caracteristicas_generales',mediaProductId:'P-ARMOR-X13',mediaSource:'SQL_BRIDGE'};},
  };
  const scheduler=new (AutomationScheduler as any)(repo,()=>new Date('2026-08-27T15:00:00.000Z'),mediaResolver);
  await scheduler.onBotMessage({sessionId:'whatsapp:51999',customerMessageId:'wamid.customer',recipient:'51999',botSentAt:'2026-08-27T15:00:00.000Z',attentionMode:'BOT'});
  assert.equal(repo.scheduled.length,1);
  assert.equal(repo.scheduled[0].actionType,'SEND_IMAGE_PRODUCT_AUTO');
  assert.equal(repo.scheduled[0].mediaUrl,'https://cdn.stech.test/armor-x13.webp');
  assert.equal(repo.scheduled[0].mediaType,'caracteristicas_generales');
  assert.equal(repo.scheduled[0].mediaProductId,'P-ARMOR-X13');
  assert.equal(repo.scheduled[0].mediaSource,'SQL_BRIDGE');
});

test('custom image URL is frozen directly from the rule when the job is scheduled',async()=>{
  const repo=new SchedulerRepo();
  repo.rules=[baseRule({actionType:'SEND_IMAGE_CUSTOM_URL',mediaUrl:'https://assets.stech.test/promo.jpg'})];
  const scheduler=new (AutomationScheduler as any)(repo,()=>new Date('2026-08-27T15:00:00.000Z'),null);
  await scheduler.onBotMessage({sessionId:'whatsapp:51999',customerMessageId:'wamid.customer',recipient:'51999',botSentAt:'2026-08-27T15:00:00.000Z',attentionMode:'BOT'});
  assert.equal(repo.scheduled[0].actionType,'SEND_IMAGE_CUSTOM_URL');
  assert.equal(repo.scheduled[0].mediaUrl,'https://assets.stech.test/promo.jpg');
  assert.equal(repo.scheduled[0].mediaSource,'CUSTOM_URL');
});

function workerRepo(job:any,rule:any){
  const terminals:any[]=[];const executions:any[]=[];
  return {
    terminals,executions,
    async claimDue(){return[job];},async getRule(){return rule;},async markTerminal(id:string,status:string,reason:string|null=null){terminals.push({id,status,reason});},
    async recordExecution(input:any){executions.push(input);},async listActiveRules(){return[];},async cancelPending(){return 0;},async scheduleJob(){return null;},
    async listRules(){return[];},async createRule(){throw new Error('not used');},async updateRule(){throw new Error('not used');},async setRuleActive(){throw new Error('not used');},async listJobs(){return[];},
  } as any;
}

function crm(){return{
  async getAutomationState(){return{mode:'BOT',latestCustomerAt:'2026-08-27T14:00:00.000Z',latestCustomerMessageId:'wamid.customer'};},
  async recordAutomationMessage(){return;},
} as any;}

function imageJob(){return{
  id:'j-media',ruleId:'r-media',sessionId:'whatsapp:51999',eventType:'BOT_MESSAGE_SENT',basisMessageId:'wamid.customer',recipient:'51999',
  executeAt:'2026-08-27T15:00:00.000Z',status:'PROCESSING',attemptCount:1,messageTemplate:'🔥 Sigue disponible',
  actionType:'SEND_IMAGE_PRODUCT_AUTO',mediaUrl:'https://cdn.stech.test/armor.webp',mediaType:'caracteristicas_generales',mediaProductId:'P-ARMOR-X13',mediaSource:'SQL_BRIDGE',
};}

test('worker sends image with caption for a media job instead of text-only',async()=>{
  const job=imageJob();const rule=baseRule();const repo=workerRepo(job,rule);let imageSends=0;let textSends=0;
  const sender={
    async sendTextOnce(){textSends+=1;return{messageId:'wamid.text'};},
    async sendImageWithCaptionOnce(){imageSends+=1;return{messageId:'wamid.image'};},
  } as any;
  const worker=new AutomationWorker({repository:repo,crm:crm(),sender,workerId:'w-media',now:()=>new Date('2026-08-27T15:30:00.000Z')});
  await worker.runOnce();
  assert.equal(imageSends,1);
  assert.equal(textSends,0);
  assert.equal(repo.terminals[0]?.status,'SENT');
  assert.equal(repo.executions[0]?.providerMessageId,'wamid.image');
});

test('explicit image rejection falls back once to the caption text',async()=>{
  const job=imageJob();const repo=workerRepo(job,baseRule());let imageSends=0;let textSends=0;
  const sender={
    async sendImageWithCaptionOnce(){imageSends+=1;throw new Error('WhatsApp Graph API HTTP 400: invalid image');},
    async sendTextOnce(){textSends+=1;return{messageId:'wamid.fallback'};},
  } as any;
  const worker=new AutomationWorker({repository:repo,crm:crm(),sender,workerId:'w-media',now:()=>new Date('2026-08-27T15:30:00.000Z')});
  await worker.runOnce();
  assert.equal(imageSends,1);
  assert.equal(textSends,1);
  assert.equal(repo.terminals[0]?.status,'SENT');
  assert.equal(repo.executions[0]?.detail?.fallbackToText,true);
});

test('ambiguous image transport failure does not send a second text message',async()=>{
  const job=imageJob();const repo=workerRepo(job,baseRule());let textSends=0;
  const sender={
    async sendImageWithCaptionOnce(){throw new Error('WHATSAPP_AMBIGUOUS_SEND: socket closed');},
    async sendTextOnce(){textSends+=1;return{messageId:'should-not-send'};},
  } as any;
  const worker=new AutomationWorker({repository:repo,crm:crm(),sender,workerId:'w-media',now:()=>new Date('2026-08-27T15:30:00.000Z')});
  await worker.runOnce();
  assert.equal(textSends,0);
  assert.equal(repo.terminals[0]?.status,'AMBIGUOUS');
});

test('WhatsApp client sends a public image link with caption through Graph messages endpoint',async()=>{
  const calls:Array<{url:string;init:RequestInit}>=[];
  const client=new WhatsAppCloudApiClient({accessToken:'secret-token',phoneNumberId:'1283086411554196',version:'v25.0',fetcher:async(url,init)=>{
    calls.push({url:String(url),init:init??{}});return Response.json({messages:[{id:'wamid.image'}]});
  }});
  assert.equal(typeof (client as any).sendImageWithCaptionOnce,'function');
  const result=await (client as any).sendImageWithCaptionOnce('51911111111','https://cdn.stech.test/armor.jpg','✅ Tenemos stock');
  assert.equal(result.messageId,'wamid.image');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)),{
    messaging_product:'whatsapp',recipient_type:'individual',to:'51911111111',type:'image',image:{link:'https://cdn.stech.test/armor.jpg',caption:'✅ Tenemos stock'},
  });
});

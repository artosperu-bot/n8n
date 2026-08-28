import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationWorker } from '../../src/automation/AutomationWorker.ts';

test('partial multi-image send audits only URLs actually accepted by WhatsApp',async()=>{
  const job:any={
    id:'job-partial',ruleId:'rule-1',sessionId:'whatsapp:51999',eventType:'BOT_MESSAGE_SENT',basisMessageId:'customer-1',recipient:'51999',
    executeAt:'2026-08-27T15:00:00.000Z',status:'PROCESSING',attemptCount:1,messageTemplate:'Hola',actionType:'SEND_IMAGE_PRODUCT_AUTO',
    mediaUrl:'https://cdn.test/1.webp',mediaUrls:['https://cdn.test/1.webp','https://cdn.test/2.webp','https://cdn.test/3.webp'],mediaType:'caracteristicas_generales',mediaProductId:'P-1',mediaSource:'SQL_BRIDGE',
  };
  const terminals:any[]=[];const executions:any[]=[];
  const repository:any={
    async claimDue(){return[job];},async getRule(){return{id:'rule-1',active:true,eventType:'BOT_MESSAGE_SENT'};},
    async markTerminal(id:string,status:string,reason:string|null=null){terminals.push({id,status,reason});},async recordExecution(input:any){executions.push(input);},
  };
  let sendCount=0;const sender:any={
    async sendTextOnce(){throw new Error('no fallback after accepted media');},
    async sendImageWithCaptionOnce(){sendCount+=1;if(sendCount<=2)return{messageId:`wamid.${sendCount}`};throw new Error('WhatsApp Graph API HTTP 400: rejected third image');},
  };
  let recorded:any=null;const crm:any={
    async getAutomationState(){return{mode:'BOT',latestCustomerAt:'2026-08-27T14:00:00.000Z',latestCustomerMessageId:'customer-1'};},
    async recordAutomationMessage(input:any){recorded=input;},
  };
  const worker=new AutomationWorker({repository,crm,sender,workerId:'worker-1',now:()=>new Date('2026-08-27T15:30:00.000Z')});
  await worker.runOnce();
  assert.equal(terminals[0]?.status,'SENT');
  assert.deepEqual(recorded?.mediaUrls,['https://cdn.test/1.webp','https://cdn.test/2.webp']);
  assert.deepEqual(executions[0]?.detail?.sentMediaUrls,['https://cdn.test/1.webp','https://cdn.test/2.webp']);
});

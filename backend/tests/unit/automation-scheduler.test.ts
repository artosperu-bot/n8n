import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationScheduler } from '../../src/automation/AutomationScheduler.ts';
import type { AutomationRepository, AutomationRule, ScheduleAutomationJobInput } from '../../src/automation/types.ts';

function rule(id:string,delaySeconds:number):AutomationRule{
  return{id,name:`rule-${id}`,eventType:'BOT_MESSAGE_SENT',delaySeconds,actionType:'SEND_TEXT',messageTemplate:`followup-${id}`,active:true,priority:100};
}

class FakeRepository implements AutomationRepository{
  rules:AutomationRule[]=[rule('r1',3600),rule('r2',7200)];
  cancelled:Array<{sessionId:string;reason:string}>=[];
  scheduled:ScheduleAutomationJobInput[]=[];
  async listActiveRules(){return this.rules;}
  async cancelPending(sessionId:string,reason:string){this.cancelled.push({sessionId,reason});return 1;}
  async scheduleJob(input:ScheduleAutomationJobInput){this.scheduled.push(input);return {...input,id:`j${this.scheduled.length}`,status:'PENDING' as const,attemptCount:0};}
  async claimDue(){return[];}
  async getRule(){return null;}
  async markTerminal(){return;}
  async recordExecution(){return;}
  async listRules(){return this.rules;}
  async createRule(){throw new Error('not used');}
  async setRuleActive(){throw new Error('not used');}
  async listJobs(){return[];}
}

test('customer message only cancels older pending jobs and does not schedule a new followup yet',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  const result=await scheduler.onCustomerMessage({sessionId:'whatsapp:51999',messageId:'wamid.new',recipient:'51999',sourceSentAt:'2026-08-25T15:00:00.000Z',duplicate:false});
  assert.deepEqual(repo.cancelled,[{sessionId:'whatsapp:51999',reason:'CUSTOMER_REPLIED'}]);
  assert.equal(repo.scheduled.length,0);
  assert.deepEqual(result,{cancelled:1,scheduled:0});
});

test('successful BOT reply starts delay and keeps customer message id as reply guard',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  const result=await scheduler.onBotMessage({
    sessionId:'whatsapp:51999',
    customerMessageId:'wamid.customer.1',
    recipient:'51999',
    botSentAt:'2026-08-25T15:05:00.000Z',
    attentionMode:'BOT',
  });
  assert.equal(repo.scheduled.length,2);
  assert.equal(repo.scheduled[0].eventType,'BOT_MESSAGE_SENT');
  assert.equal(repo.scheduled[0].executeAt,'2026-08-25T16:05:00.000Z');
  assert.equal(repo.scheduled[1].executeAt,'2026-08-25T17:05:00.000Z');
  assert.equal(repo.scheduled[0].basisMessageId,'wamid.customer.1');
  assert.deepEqual(result,{scheduled:2});
});

test('BOT reply does not schedule when attention is no longer BOT',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  const result=await scheduler.onBotMessage({sessionId:'whatsapp:51999',customerMessageId:'wamid.customer.1',recipient:'51999',botSentAt:'2026-08-25T15:05:00.000Z',attentionMode:'HUMANO'});
  assert.equal(repo.scheduled.length,0);
  assert.deepEqual(result,{scheduled:0});
});

test('duplicate inbound does not cancel or schedule automation jobs',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  await scheduler.onCustomerMessage({sessionId:'whatsapp:51999',messageId:'wamid.same',recipient:'51999',sourceSentAt:'2026-08-25T15:00:00.000Z',duplicate:true});
  assert.equal(repo.cancelled.length,0);
  assert.equal(repo.scheduled.length,0);
});

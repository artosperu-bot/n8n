import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationScheduler } from '../../src/automation/AutomationScheduler.ts';
import type { AutomationRepository, AutomationRule, ScheduleAutomationJobInput } from '../../src/automation/types.ts';

function rule(id:string,delaySeconds:number):AutomationRule{
  return{id,name:`rule-${id}`,eventType:'CUSTOMER_MESSAGE_RECEIVED',delaySeconds,actionType:'SEND_TEXT',messageTemplate:`followup-${id}`,active:true,priority:100};
}

class FakeRepository implements AutomationRepository{
  rules:AutomationRule[]=[rule('r1',3600),rule('r2',7200)];
  cancelled:Array<{sessionId:string;reason:string}>=[];
  scheduled:ScheduleAutomationJobInput[]=[];
  async listActiveRules(){return this.rules;}
  async cancelPending(sessionId:string,reason:string){this.cancelled.push({sessionId,reason});return 1;}
  async scheduleJob(input:ScheduleAutomationJobInput){this.scheduled.push(input);return null;}
  async claimDue(){return[];}
  async getRule(){return null;}
  async markTerminal(){return;}
  async recordExecution(){return;}
  async listRules(){return this.rules;}
  async createRule(){throw new Error('not used');}
  async setRuleActive(){throw new Error('not used');}
  async listJobs(){return[];}
}

test('customer reply cancels older pending jobs before scheduling new followups',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  await scheduler.onCustomerMessage({sessionId:'whatsapp:51999',messageId:'wamid.new',recipient:'51999',sourceSentAt:'2026-08-25T15:00:00.000Z',duplicate:false});
  assert.deepEqual(repo.cancelled,[{sessionId:'whatsapp:51999',reason:'CUSTOMER_REPLIED'}]);
  assert.equal(repo.scheduled.length,2);
  assert.equal(repo.scheduled[0].executeAt,'2026-08-25T16:00:00.000Z');
  assert.equal(repo.scheduled[1].executeAt,'2026-08-25T17:00:00.000Z');
  assert.equal(repo.scheduled[0].basisMessageId,'wamid.new');
});

test('duplicate inbound does not cancel or schedule automation jobs',async()=>{
  const repo=new FakeRepository();
  const scheduler=new AutomationScheduler(repo);
  await scheduler.onCustomerMessage({sessionId:'whatsapp:51999',messageId:'wamid.same',recipient:'51999',sourceSentAt:'2026-08-25T15:00:00.000Z',duplicate:true});
  assert.equal(repo.cancelled.length,0);
  assert.equal(repo.scheduled.length,0);
});

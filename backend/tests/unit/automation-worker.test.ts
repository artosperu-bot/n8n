import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationWorker } from '../../src/automation/AutomationWorker.ts';
import type { AutomationClaimedJob, AutomationRepository, AutomationRule, AutomationCrmPort, AutomationExecutionOutcome, ScheduleAutomationJobInput } from '../../src/automation/types.ts';

const activeRule:AutomationRule={id:'r1',name:'followup',eventType:'CUSTOMER_MESSAGE_RECEIVED',delaySeconds:3600,actionType:'SEND_TEXT',messageTemplate:'¿Sigues interesado?',active:true,priority:100};
function claimed(overrides:Partial<AutomationClaimedJob>={}):AutomationClaimedJob{return{id:'j1',ruleId:'r1',sessionId:'whatsapp:51999',eventType:'CUSTOMER_MESSAGE_RECEIVED',basisMessageId:'wamid.base',recipient:'51999',executeAt:'2026-08-25T19:00:00.000Z',status:'PROCESSING',attemptCount:1,messageTemplate:'¿Sigues interesado?',...overrides};}

class FakeRepository implements AutomationRepository{
  jobs:AutomationClaimedJob[]=[claimed()];
  terminals:Array<{id:string;status:string;reason:string|null}>=[];
  executions:AutomationExecutionOutcome[]=[];
  async listActiveRules(){return[activeRule];}
  async cancelPending(){return 0;}
  async scheduleJob(_input:ScheduleAutomationJobInput){return null;}
  async claimDue(){return this.jobs.splice(0);}
  async getRule(){return activeRule;}
  async markTerminal(id:string,status:any,reason:string|null=null){this.terminals.push({id,status,reason});}
  async recordExecution(input:AutomationExecutionOutcome){this.executions.push(input);}
  async listRules(){return[activeRule];}
  async createRule(){throw new Error('not used');}
  async setRuleActive(){throw new Error('not used');}
  async listJobs(){return[];}
}

class FakeCrm implements AutomationCrmPort{
  mode='BOT';latestCustomerAt='2026-08-25T19:30:00.000Z';latestCustomerMessageId='wamid.base';messages:string[]=[];
  async getAutomationState(){return{mode:this.mode as any,latestCustomerAt:this.latestCustomerAt,latestCustomerMessageId:this.latestCustomerMessageId};}
  async recordAutomationMessage(input:{sessionId:string;messageId:string;content:string;recipient:string;jobId:string}){this.messages.push(input.messageId);}
}

function worker(repo:FakeRepository,crm:FakeCrm,sender:{sendTextOnce(to:string,text:string):Promise<{messageId:string|null}>}){
  return new AutomationWorker({repository:repo,crm,sender,workerId:'w1',now:()=>new Date('2026-08-25T20:00:00.000Z'),windowHours:24});
}

test('worker cancels a due job when conversation is no longer BOT',async()=>{
  const repo=new FakeRepository();const crm=new FakeCrm();crm.mode='HUMANO';
  let sends=0;const w=worker(repo,crm,{sendTextOnce:async()=>{sends++;return{messageId:'x'};}});
  await w.runOnce();
  assert.equal(sends,0);
  assert.deepEqual(repo.terminals,[{id:'j1',status:'CANCELLED',reason:'HUMAN_TAKEOVER'}]);
});

test('worker cancels a due job when a newer customer message exists',async()=>{
  const repo=new FakeRepository();const crm=new FakeCrm();crm.latestCustomerMessageId='wamid.newer';
  const w=worker(repo,crm,{sendTextOnce:async()=>({messageId:'x'})});
  await w.runOnce();
  assert.deepEqual(repo.terminals,[{id:'j1',status:'CANCELLED',reason:'CUSTOMER_REPLIED'}]);
});

test('worker skips send when WhatsApp 24 hour customer window is closed',async()=>{
  const repo=new FakeRepository();const crm=new FakeCrm();crm.latestCustomerAt='2026-08-24T19:59:00.000Z';
  let sends=0;const w=worker(repo,crm,{sendTextOnce:async()=>{sends++;return{messageId:'x'};}});
  await w.runOnce();
  assert.equal(sends,0);
  assert.deepEqual(repo.terminals,[{id:'j1',status:'SKIPPED',reason:'WHATSAPP_WINDOW_CLOSED'}]);
});

test('worker records successful automation send and terminal SENT state',async()=>{
  const repo=new FakeRepository();const crm=new FakeCrm();
  const w=worker(repo,crm,{sendTextOnce:async()=>({messageId:'wamid.out'})});
  await w.runOnce();
  assert.deepEqual(crm.messages,['wamid.out']);
  assert.deepEqual(repo.terminals,[{id:'j1',status:'SENT',reason:null}]);
  assert.equal(repo.executions[0]?.providerMessageId,'wamid.out');
  assert.equal(repo.executions[0]?.outcome,'SENT');
});

test('worker marks transport failure ambiguous and never retries inside one run',async()=>{
  const repo=new FakeRepository();const crm=new FakeCrm();let sends=0;
  const w=worker(repo,crm,{sendTextOnce:async()=>{sends++;throw new Error('WHATSAPP_AMBIGUOUS_SEND: socket closed');}});
  await w.runOnce();
  assert.equal(sends,1);
  assert.deepEqual(repo.terminals,[{id:'j1',status:'AMBIGUOUS',reason:'WHATSAPP_AMBIGUOUS_SEND'}]);
});

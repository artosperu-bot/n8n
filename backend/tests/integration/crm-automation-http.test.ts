import test from 'node:test';
import assert from 'node:assert/strict';
import { createStechApp } from '../../src/app.ts';

function rule(id='r1'){return{id,name:'Seguimiento 1h',eventType:'CUSTOMER_MESSAGE_RECEIVED',delaySeconds:3600,actionType:'SEND_TEXT',messageTemplate:'¿Sigues interesado?',active:true,priority:100};}
function job(sessionId='whatsapp:51911111111'){return{id:'j1',ruleId:'r1',sessionId,eventType:'CUSTOMER_MESSAGE_RECEIVED',basisMessageId:'wamid.IN1',recipient:'51911111111',executeAt:'2026-08-25T21:00:00Z',status:'PENDING',attemptCount:0};}
function auth(role:'admin'|'advisor'){return{authorization:['Bearer',role].join(' ')}};
function jsonAuth(role:'admin'|'advisor'){return{...auth(role),'content-type':'application/json'};}

async function withApp(run:(base:string,calls:any[],worker:any)=>Promise<void>){
  const calls:any[]=[];
  const crmAuth={async authenticate(value:string|undefined){
    calls.push(['auth',value]);
    if(!value)throw new Error('CRM_AUTH_REQUIRED');
    if(value===['Bearer','advisor'].join(' '))return{id:'crm-advisor',userId:'auth-advisor',email:'advisor@s-tech.com.pe',name:'Asesor',role:'ASESOR'};
    return{id:'crm-admin',userId:'auth-admin',email:'admin@s-tech.com.pe',name:'Admin',role:'ADMIN'};
  }} as any;
  const crm={
    async getConversation(sessionId:string){calls.push(['detail',sessionId]);return{session:{session_id:sessionId,asesor_id:sessionId.includes('assigned')?'auth-advisor':'someone-else'},messages:[],context:{},insight:{},recipient:'51911111111'};},
    async listWhatsAppConversations(){return{sessions:[],stats:{bot:0,human:0,waiting:0,closed:0}};},
    async changeMode(){return{};},async recordInbound(){return{mode:'BOT',version:1};},async recordBotMessage(){},async recordAdvisorMessage(){},
  } as any;
  const automation={
    async listRules(){calls.push(['listRules']);return[rule()];},
    async createRule(input:any){calls.push(['createRule',input]);return{...rule('created'),...input};},
    async setRuleActive(id:string,active:boolean){calls.push(['setActive',id,active]);return{...rule(id),active};},
    async listJobs(filters:any){calls.push(['listJobs',filters]);return[job(filters?.sessionId??'whatsapp:any')];},
    async cancelPending(sessionId:string,reason:string){calls.push(['cancel',sessionId,reason]);return 2;},
    async listActiveRules(){return[];},async scheduleJob(){return null;},async claimDue(){return[];},async getRule(){return rule();},async markTerminal(){},async recordExecution(){},
  } as any;
  const worker={startCalls:0,stopCalls:0,start(){this.startCalls+=1;},stop(){this.stopCalls+=1;}};
  const app=createStechApp({env:{STECH_PROFILE:'test'},crmAuth,crm,automationRepository:automation,automationWorker:worker as any,whatsappInbound:null});
  await app.listen(0,'127.0.0.1');
  const address=app.address();if(!address||typeof address==='string')throw new Error('no address');
  try{await run(`http://127.0.0.1:${address.port}`,calls,worker);}finally{await app.close();}
  assert.equal(worker.startCalls,1);
  assert.equal(worker.stopCalls,1);
}

test('automation rule endpoints require auth and only ADMIN can create/toggle',async()=>withApp(async(base,calls)=>{
  const unauth=await fetch(`${base}/api/automations/rules`);assert.equal(unauth.status,401);
  const denied=await fetch(`${base}/api/automations/rules`,{method:'POST',headers:jsonAuth('advisor'),body:JSON.stringify({name:'x',delaySeconds:60,messageTemplate:'Hola'})});
  assert.equal(denied.status,403);
  const created=await fetch(`${base}/api/automations/rules`,{method:'POST',headers:jsonAuth('admin'),body:JSON.stringify({name:'Seguimiento 1h',delaySeconds:3600,messageTemplate:'¿Sigues interesado?',priority:20})});
  assert.equal(created.status,201);
  const createCall=calls.find(x=>x[0]==='createRule');
  assert.deepEqual(createCall?.[1],{name:'Seguimiento 1h',eventType:'CUSTOMER_MESSAGE_RECEIVED',delaySeconds:3600,actionType:'SEND_TEXT',messageTemplate:'¿Sigues interesado?',active:true,priority:20});
  const toggle=await fetch(`${base}/api/automations/rules/r1/disable`,{method:'POST',headers:auth('admin')});assert.equal(toggle.status,200);
  assert.ok(calls.some(x=>x[0]==='setActive'&&x[1]==='r1'&&x[2]===false));
}));

test('ADMIN can list all jobs while ASESOR is limited to assigned sessions',async()=>withApp(async(base,calls)=>{
  const admin=await fetch(`${base}/api/automations/jobs`,{headers:auth('admin')});assert.equal(admin.status,200);
  const assigned='whatsapp:assigned';
  const allowed=await fetch(`${base}/api/automations/jobs?sessionId=${encodeURIComponent(assigned)}`,{headers:auth('advisor')});assert.equal(allowed.status,200);
  const denied=await fetch(`${base}/api/automations/jobs?sessionId=${encodeURIComponent('whatsapp:other')}`,{headers:auth('advisor')});assert.equal(denied.status,403);
  assert.ok(calls.some(x=>x[0]==='listJobs'&&x[1].sessionId===assigned));
}));

test('assigned ASESOR can cancel pending jobs for own conversation',async()=>withApp(async(base,calls)=>{
  const sessionId='whatsapp:assigned';
  const response=await fetch(`${base}/api/automations/cancel`,{method:'POST',headers:jsonAuth('advisor'),body:JSON.stringify({sessionId,reason:'ASESOR_CANCEL'})});
  assert.equal(response.status,200);
  const body=await response.json() as any;assert.equal(body.cancelled,2);
  assert.ok(calls.some(x=>x[0]==='cancel'&&x[1]===sessionId&&x[2]==='ASESOR_CANCEL'));
}));

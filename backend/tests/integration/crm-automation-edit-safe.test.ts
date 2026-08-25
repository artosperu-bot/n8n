import test from 'node:test';
import assert from 'node:assert/strict';
import { createStechApp } from '../../src/app.ts';

function baseRule(){return{id:'r1',name:'Seguimiento',eventType:'BOT_MESSAGE_SENT',delaySeconds:3600,actionType:'SEND_TEXT',messageTemplate:'Hola',active:true,priority:100};}

async function withApp(run:(base:string,calls:any[])=>Promise<void>){
  const calls:any[]=[];
  const crmAuth={async authenticate(value:string|undefined){if(!value)throw new Error('CRM_AUTH_REQUIRED');return value==='Bearer advisor'?{userId:'u2',role:'ASESOR'}:{userId:'u1',role:'ADMIN'};}} as any;
  const automation={
    async listRules(){return[baseRule()];},
    async createRule(input:any){calls.push(['createRule',input]);return{...baseRule(),...input};},
    async updateRule(id:string,input:any){calls.push(['updateRule',id,input]);return{...baseRule(),id,...input};},
    async setRuleActive(){return baseRule();},async listJobs(){return[];},async cancelPending(){return 0;},async listActiveRules(){return[];},async scheduleJob(){return null;},async claimDue(){return[];},async getRule(){return baseRule();},async markTerminal(){},async recordExecution(){},
  } as any;
  const app=createStechApp({env:{STECH_PROFILE:'test'},crmAuth,crm:null,automationRepository:automation,automationWorker:null,whatsappInbound:null});
  await app.listen(0,'127.0.0.1'); const address=app.address(); if(!address||typeof address==='string')throw new Error('no address');
  try{await run(`http://127.0.0.1:${address.port}`,calls);}finally{await app.close();}
}

test('new rules are created with BOT_MESSAGE_SENT semantics',async()=>withApp(async(base,calls)=>{
  const response=await fetch(`${base}/api/automations/rules`,{method:'POST',headers:{authorization:'Bearer admin','content-type':'application/json'},body:JSON.stringify({name:'Seguimiento',delaySeconds:60,messageTemplate:'Hola',priority:10})});
  assert.equal(response.status,201);
  assert.equal(calls.find(x=>x[0]==='createRule')?.[1].eventType,'BOT_MESSAGE_SENT');
}));

test('ADMIN can edit rule content without changing identity or active state',async()=>withApp(async(base,calls)=>{
  const response=await fetch(`${base}/api/automations/rules/r1`,{method:'PATCH',headers:{authorization:'Bearer admin','content-type':'application/json'},body:JSON.stringify({name:'Seguimiento editado',delaySeconds:7200,messageTemplate:'Nuevo mensaje',priority:50})});
  assert.equal(response.status,200);
  assert.deepEqual(calls.find(x=>x[0]==='updateRule'),['updateRule','r1',{name:'Seguimiento editado',delaySeconds:7200,messageTemplate:'Nuevo mensaje',priority:50}]);
}));

test('ASESOR cannot edit global automation rules',async()=>withApp(async(base)=>{
  const response=await fetch(`${base}/api/automations/rules/r1`,{method:'PATCH',headers:{authorization:'Bearer advisor','content-type':'application/json'},body:JSON.stringify({name:'x',delaySeconds:60,messageTemplate:'x',priority:1})});
  assert.equal(response.status,403);
}));

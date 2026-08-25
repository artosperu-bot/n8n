import test from 'node:test';
import assert from 'node:assert/strict';
import { createStechApp } from '../../src/app.ts';

async function withApp(run:(base:string,calls:any[])=>Promise<void>){
  const calls:any[]=[];
  const crmAuth={async authenticate(value:string|undefined){calls.push(['auth',value]);if(!value)throw new Error('CRM_AUTH_REQUIRED');return{id:'crm-user-1',userId:'auth-user-1',email:'admin@s-tech.com.pe',name:'Admin',role:'ADMIN'};}} as any;
  const crm={
    async listWhatsAppConversations(input:any){calls.push(['list',input]);return{sessions:[{session_id:'whatsapp:51911111111',canal:'whatsapp',modo_atencion:'BOT',version:4}],stats:{bot:1,human:0,waiting:0,closed:0}};},
    async getConversation(id:string){calls.push(['detail',id]);return{session:{session_id:id,canal:'whatsapp',modo_atencion:'BOT',version:4},messages:[],context:{},insight:{},recipient:'51911111111'};},
    async changeMode(input:any){calls.push(['changeMode',input]);return{session_id:input.sessionId,modo_atencion:input.mode,version:input.version+1};},
    async recordAdvisorMessage(input:any){calls.push(['advisor',input]);return input;},
    async recordInbound(){return{mode:'BOT',version:1};},async recordBotMessage(){},
  } as any;
  const whatsapp={
    async sendText(to:string,text:string){calls.push(['sendText',to,text]);return{messageId:'wamid.OUT1'};},
    async getStatus(){calls.push(['waStatus']);return{configured:true,reachable:true,phoneNumberId:'1283086411554196',displayPhoneNumber:'51999999999',verifiedName:'STECH'};},
  } as any;
  const app=createStechApp({env:{STECH_PROFILE:'test',CRM_ALLOWED_ORIGINS:'http://localhost:5173,http://127.0.0.1:5173'},crmAuth,crm,whatsapp});
  await app.listen(0,'127.0.0.1');
  try{const address=app.address();if(!address||typeof address==='string')throw new Error('no address');await run(`http://127.0.0.1:${address.port}`,calls);}finally{await app.close();}
}

test('CORS allows both local Vite origins and OPTIONS preflight',async()=>withApp(async base=>{
  for(const origin of ['http://localhost:5173','http://127.0.0.1:5173']){
    const response=await fetch(`${base}/api/chat`,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,authorization'}});
    assert.equal(response.status,204);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.match(response.headers.get('access-control-allow-headers')??'',/authorization/i);
  }
}));

test('WhatsApp CRM endpoints require authenticated CRM user',async()=>withApp(async base=>{
  const response=await fetch(`${base}/api/whatsapp/conversations`);
  assert.equal(response.status,401);
}));

test('WhatsApp CRM lists conversations and returns detail behind auth',async()=>withApp(async(base)=>{
  const headers={authorization:'Bearer user-jwt'};
  const list=await fetch(`${base}/api/whatsapp/conversations?mode=BOT&limit=20`,{headers});
  assert.equal(list.status,200);assert.equal(((await list.json()) as any).sessions[0].session_id,'whatsapp:51911111111');
  const detail=await fetch(`${base}/api/whatsapp/conversations/${encodeURIComponent('whatsapp:51911111111')}`,{headers});
  assert.equal(detail.status,200);assert.equal(((await detail.json()) as any).session.modo_atencion,'BOT');
}));

test('take and return-bot endpoints require optimistic version and call mode authority',async()=>withApp(async(base,calls)=>{
  const headers={authorization:'Bearer user-jwt','content-type':'application/json'};
  const take=await fetch(`${base}/api/whatsapp/conversations/${encodeURIComponent('whatsapp:51911111111')}/take`,{method:'POST',headers,body:JSON.stringify({version:4,reason:'Atención manual'})});
  assert.equal(take.status,200);
  const back=await fetch(`${base}/api/whatsapp/conversations/${encodeURIComponent('whatsapp:51911111111')}/return-bot`,{method:'POST',headers,body:JSON.stringify({version:5})});
  assert.equal(back.status,200);
  assert.ok(calls.some(x=>x[0]==='changeMode'&&x[1].mode==='HUMANO'&&x[1].version===4));
  assert.ok(calls.some(x=>x[0]==='changeMode'&&x[1].mode==='BOT'&&x[1].version===5));
}));

test('advisor message is sent to Meta by backend and persisted with Meta message id',async()=>withApp(async(base,calls)=>{
  const response=await fetch(`${base}/api/whatsapp/conversations/${encodeURIComponent('whatsapp:51911111111')}/messages`,{method:'POST',headers:{authorization:'Bearer user-jwt','content-type':'application/json'},body:JSON.stringify({version:4,content:'Hola desde asesor'})});
  assert.equal(response.status,200);
  assert.ok(calls.some(x=>x[0]==='sendText'&&x[1]==='51911111111'));
  assert.ok(calls.some(x=>x[0]==='advisor'&&x[1].messageId==='wamid.OUT1'));
}));

test('separate WhatsApp status endpoint reports backend-to-Meta connectivity',async()=>withApp(async base=>{
  const response=await fetch(`${base}/api/whatsapp/status`,{headers:{authorization:'Bearer user-jwt'}});
  assert.equal(response.status,200);
  const body=await response.json() as any;
  assert.equal(body.reachable,true);
  assert.equal(body.configured,true);
}));

test('CRM HTTP response never returns internal secret text from thrown adapter errors',async()=>{
  const crmAuth={async authenticate(){return{id:'crm-user-1',userId:'auth-user-1',email:'admin@s-tech.com.pe',name:'Admin',role:'ADMIN'};}} as any;
  const crm={async listWhatsAppConversations(){throw new Error('SUPABASE_SERVICE_ROLE_KEY=SUPER-SECRET-TOKEN Authorization: Bearer ALSO-SECRET');}} as any;
  const app=createStechApp({env:{STECH_PROFILE:'test'},crmAuth,crm});
  await app.listen(0,'127.0.0.1');
  try{
    const address=app.address();if(!address||typeof address==='string')throw new Error('no address');
    const response=await fetch(`http://127.0.0.1:${address.port}/api/whatsapp/conversations`,{headers:{authorization:'Bearer user-jwt'}});
    assert.equal(response.status,500);
    const text=await response.text();
    assert.ok(!text.includes('SUPER-SECRET-TOKEN'));
    assert.ok(!text.includes('ALSO-SECRET'));
    assert.match(text,/INTERNAL_ERROR/);
  }finally{await app.close();}
});

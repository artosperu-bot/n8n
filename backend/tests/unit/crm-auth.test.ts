import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseCrmAuth } from '../../src/adapters/supabase/SupabaseCrmAuth.ts';

test('CRM auth validates bearer with Supabase Auth and requires active crm_usuarios membership',async()=>{
  const calls:Array<{url:string;init:any}>=[];
  const fetcher=async(url:any,init:any={})=>{
    calls.push({url:String(url),init});
    if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'auth-user-1',email:'asesor@s-tech.com.pe'}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/rest/v1/crm_usuarios'))return new Response(JSON.stringify([{id:'crm-user-1',user_id:'auth-user-1',email:'asesor@s-tech.com.pe',nombre:'Asesor',rol:'ADMIN',activo:true}]),{status:200,headers:{'content-type':'application/json'}});
    return new Response('not found',{status:404});
  };
  const auth=new SupabaseCrmAuth({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  const actor=await auth.authenticate('Bearer user-jwt');
  assert.equal(actor.id,'crm-user-1');
  assert.equal(actor.userId,'auth-user-1');
  assert.equal(actor.role,'ADMIN');
  assert.equal(calls[0].init.headers.authorization,'Bearer user-jwt');
  assert.equal(calls[0].init.headers.apikey,'service-secret');
});

test('CRM auth rejects missing bearer without contacting Supabase',async()=>{
  let calls=0;
  const auth=new SupabaseCrmAuth({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:(async()=>{calls+=1;return new Response('{}',{status:200});}) as any});
  await assert.rejects(()=>auth.authenticate(undefined),/CRM_AUTH_REQUIRED/);
  assert.equal(calls,0);
});

test('CRM auth rejects authenticated user not enabled in crm_usuarios',async()=>{
  const fetcher=async(url:any)=>String(url).endsWith('/auth/v1/user')
    ?new Response(JSON.stringify({id:'auth-user-2',email:'no-access@example.com'}),{status:200,headers:{'content-type':'application/json'}})
    :new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  const auth=new SupabaseCrmAuth({url:'https://example.supabase.co',serviceRoleKey:'service-secret',fetcher:fetcher as any});
  await assert.rejects(()=>auth.authenticate('Bearer user-jwt'),/CRM_ACCESS_DENIED/);
});

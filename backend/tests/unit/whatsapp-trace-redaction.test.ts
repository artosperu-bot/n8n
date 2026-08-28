import test from 'node:test';
import assert from 'node:assert/strict';
import { writeTrace } from '../../src/shared/trace.ts';

test('WhatsApp trace redacts token, authorization, phone identifiers and message text',()=>{
  const original=console.log;
  const lines:string[]=[];
  console.log=(...args:unknown[])=>{lines.push(args.map(String).join(' '));};
  try{
    writeTrace({
      event:'WHATSAPP_INBOUND',
      accessToken:'EAAREALTOKEN123',
      authorization:'Bearer EAAREALTOKEN123', // EXAMPLE_ONLY: deliberate redaction fixture
      waId:'51912345678',
      phoneNumberId:'1283086411554196',
      message:'Hola, mi DNI es 12345678',
      type:'text',
      count:1,
    });
  }finally{console.log=original;}
  const output=lines.join('\n');
  assert.ok(output.includes('WHATSAPP_INBOUND'));
  assert.ok(!output.includes('EAAREALTOKEN123'));
  assert.ok(!output.includes('51912345678'));
  assert.ok(!output.includes('1283086411554196'));
  assert.ok(!output.includes('Hola, mi DNI'));
  assert.ok(output.includes('[REDACTED]'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTrace } from '../../src/shared/trace.ts';

function withTraceFile(run:(file:string)=>void){
  const dir=mkdtempSync(join(tmpdir(),'stech-trace-'));
  const file=join(dir,'trace.jsonl');
  const previous=process.env.STECH_TRACE_FILE;
  process.env.STECH_TRACE_FILE=file;
  try{run(file);}finally{
    if(previous===undefined)delete process.env.STECH_TRACE_FILE;
    else process.env.STECH_TRACE_FILE=previous;
    rmSync(dir,{recursive:true,force:true});
  }
}

test('appends one UTF-8 JSON object per line when STECH_TRACE_FILE is configured',()=>{
  withTraceFile(file=>{
    writeTrace({event:'STECH_TURN_TRACE',sessionId:'qa-trace',route:'SQL_PRICE'});
    writeTrace({event:'STECH_PRODUCT_FLOW',sessionId:'qa-trace',reason:'STATE_PATCH'});
    const lines=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(lines.length,2);
    assert.equal(lines[0].event,'STECH_TURN_TRACE');
    assert.equal(lines[1].event,'STECH_PRODUCT_FLOW');
  });
});

test('redacts PII and full-message fields before writing JSONL',()=>{
  withTraceFile(file=>{
    writeTrace({
      event:'STECH_TURN_ERROR',
      sessionId:'qa-trace',
      message:'mi correo es persona@example.com y DNI 12345678',
      email:'persona@example.com',
      address:'Av. Siempre Viva 123',
      nested:{lastUserMessage:'texto completo del cliente',reservationDocument:'87654321'},
      error:'falló para persona@example.com con 12345678',
    });
    const text=readFileSync(file,'utf8').trim();
    const row=JSON.parse(text);
    assert.equal(row.message,'[REDACTED]');
    assert.equal(row.email,'[REDACTED]');
    assert.equal(row.address,'[REDACTED]');
    assert.equal(row.nested.lastUserMessage,'[REDACTED]');
    assert.equal(row.nested.reservationDocument,'[REDACTED]');
    assert.doesNotMatch(text,/persona@example\.com|12345678|Siempre Viva|texto completo/);
  });
});

test('is fail-soft when trace file cannot be written',()=>{
  const previous=process.env.STECH_TRACE_FILE;
  process.env.STECH_TRACE_FILE=join(tmpdir(),'stech-trace-missing-dir','trace.jsonl');
  try{
    assert.doesNotThrow(()=>writeTrace({event:'STECH_REFERENCE_TRACE',sessionId:'qa-trace'}));
  }finally{
    if(previous===undefined)delete process.env.STECH_TRACE_FILE;
    else process.env.STECH_TRACE_FILE=previous;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installTraceConsoleSink, writeTrace } from '../../src/shared/trace.ts';

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

test('sanitizes STECH events before console and writes each event once while preserving non-STECH console',()=>{
  withTraceFile(file=>{
    const moduleUrl=pathToFileURL(join(process.cwd(),'src/shared/trace.ts')).href;
    const script=`
      import { installTraceConsoleSink, writeTrace } from ${JSON.stringify(moduleUrl)};
      installTraceConsoleSink();
      const raw={
        event:'STECH_TURN_ERROR',sessionId:'qa-console',message:'mensaje completo',dni:'12345678',
        authorization:'Bearer trace-secret',cookie:'session=trace-cookie',password:'trace-password',
        apiKey:'trace-api-key',token:'trace-token',error:'DNI 12345678; Authorization: Bearer trace-secret; cookie=session=trace-cookie'
      };
      console.error(JSON.stringify(raw));
      writeTrace({...raw,sessionId:'qa-write'},'error');
      console.log('NON_STECH unchanged');
    `;
    const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script],{
      cwd:process.cwd(),env:{...process.env,STECH_TRACE_FILE:file},encoding:'utf8',
    });
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout.trim(),'NON_STECH unchanged');
    assert.doesNotMatch(child.stderr,/mensaje completo|12345678|trace-secret|trace-cookie|trace-password|trace-api-key|trace-token/);
    const rows=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(rows.length,2,'two emitted STECH events must produce exactly two JSONL rows');
    assert.deepEqual(rows.map(row=>row.sessionId),['qa-console','qa-write']);
    assert.doesNotMatch(JSON.stringify(rows),/mensaje completo|12345678|trace-secret|trace-cookie|trace-password|trace-api-key|trace-token/);
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

test('captures the four existing STECH console events without changing their producers',()=>{
  withTraceFile(file=>{
    installTraceConsoleSink();
    console.log(JSON.stringify({event:'STECH_TURN_TRACE',sessionId:'qa-trace'}));
    console.log(JSON.stringify({event:'STECH_REFERENCE_TRACE',sessionId:'qa-trace'}));
    console.log(JSON.stringify({event:'STECH_PRODUCT_FLOW',sessionId:'qa-trace'}));
    console.error(JSON.stringify({event:'STECH_TURN_ERROR',sessionId:'qa-trace',error:'DNI 12345678'}));
    console.log(JSON.stringify({event:'UNRELATED_EVENT',sessionId:'qa-trace'}));
    const lines=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.deepEqual(lines.map(row=>row.event),[
      'STECH_TURN_TRACE','STECH_REFERENCE_TRACE','STECH_PRODUCT_FLOW','STECH_TURN_ERROR',
    ]);
    assert.doesNotMatch(JSON.stringify(lines),/12345678/);
  });
});

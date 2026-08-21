import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHard } from '../../qa/evaluators/hard.ts';

const observation=(response:any,override:any={})=>({httpStatus:200,ok:true,request:{sessionId:'qa-x',messageId:'qa:x:t01',message:'consulta'},response,roundTripMs:10,...override});

test('hard evaluator rejects intent mismatch',()=>{const f=evaluateHard({message:'x',expected:{intent:'PRICE'}},observation({answer:'x',state:{},debug:{intent:'STOCK'}}));assert.equal(f[0].code,'INTENT_MISMATCH');});
test('hard evaluator compares price answer with ERP evidence',()=>{const f=evaluateHard({message:'x'},observation({answer:'Cuesta S/ 999',state:{},debug:{intent:'PRICE',erp:{price:899,stock:4}}}));assert.ok(f.some(x=>x.code==='PRICE_EVIDENCE_MISMATCH'));});
test('hard evaluator rejects unsupported numeric price',()=>{const f=evaluateHard({message:'x'},observation({answer:'Cuesta S/ 777',state:{},debug:{intent:'PRICE',erp:null}}));assert.ok(f.some(x=>x.code==='UNSUPPORTED_NUMERIC_CLAIM'));});
test('stock quantity is a hard leak even when ERP knows it',()=>{const f=evaluateHard({message:'x'},observation({answer:'Hay 7 unidades disponibles',state:{},debug:{intent:'STOCK',erp:{stock:7}}}));assert.ok(f.some(x=>x.code==='STOCK_COUNT_LEAK'));});
test('simple availability passes stock disclosure gate',()=>{const f=evaluateHard({message:'x'},observation({answer:'Sí, está disponible.',state:{},debug:{intent:'STOCK',erp:{stock:7}}}));assert.equal(f.some(x=>x.code==='STOCK_COUNT_LEAK'),false);});
test('image response must contain only URLs',()=>{const f=evaluateHard({message:'x'},observation({answer:'Aquí tienes:\nhttps://x.test/1.jpg',state:{},debug:{intent:'IMAGE'}}));assert.ok(f.some(x=>x.code==='IMAGE_RESPONSE_NOT_URL_ONLY'));});

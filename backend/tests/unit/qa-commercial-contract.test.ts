import test from 'node:test';
import assert from 'node:assert/strict';
import { assessNba, evaluateCommercial } from '../../qa/evaluators/commercial.ts';
import type { QaTurnObservation } from '../../qa/types.ts';

function observation(answer:string,lastNba:string,intent='PRICE'):QaTurnObservation{
  return {
    httpStatus:200,
    ok:true,
    request:{sessionId:'qa-test',messageId:'m1',message:intent==='PRICE'?'¿Cuánto cuesta el Armor X13?':'Estoy viendo el Armor X13'},
    response:{
      answer,
      state:{lastNba,activeProduct:'Armor X13',queryTarget:'Armor X13',commercialStage:'CONSIDERACION'},
      debug:{intent,queryTarget:'Armor X13',ragCount:1,route:'RAG_PRODUCT'},
    },
    persisted:null,
    roundTripMs:10,
  };
}

test('RELATED_VALUE is an N+1 action that must be visibly delivered',()=>{
  const missing=assessNba(observation('Armor X13 está a S/ 899.','RELATED_VALUE','PRICE'));
  assert.equal(missing.n1Required,true);
  assert.equal(missing.n1Delivered,false);
  assert.equal(missing.deliveryPass,false);

  const delivered=assessNba(observation('Armor X13 está a S/ 899. También está disponible.','RELATED_VALUE','PRICE'));
  assert.equal(delivered.n1Required,true);
  assert.equal(delivered.n1Delivered,true);
  assert.equal(delivered.deliveryPass,true);
});

test('customer-facing RAG envelope labels are explicit QA failures',()=>{
  const findings=evaluateCommercial(observation('Producto ID: P-X13. Código: P000048. SKU: ARMOR-X13. Sección: PANTALLA. Contenido: pantalla 6.5 pulgadas.','ANSWER_ONLY','PRODUCT_INFO'));
  assert.ok(findings.some(f=>f.code==='INTERNAL_METADATA_LEAK'&&f.level==='RED'));
});

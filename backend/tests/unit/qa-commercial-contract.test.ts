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

function fabObservation(answer:string,attributes:string[],options:{intent?:string;route?:string;useCase?:string|null;problem?:string|null;priorities?:string[]}={}):QaTurnObservation{
  return {
    httpStatus:200,
    ok:true,
    request:{sessionId:'qa-fab',messageId:'m-fab',message:'consulta comercial'},
    response:{
      answer,
      state:{
        lastNba:options.intent==='COMPARE'?'COMPARE':'RELATED_VALUE',
        activeProduct:'Armor X13',
        queryTarget:'Armor X13',
        commercialStage:'CONSIDERACION',
        currentAttributes:attributes,
        useCase:options.useCase??null,
        problem:options.problem??null,
        priorities:options.priorities??[],
      },
      debug:{intent:options.intent??'CAPABILITY',queryTarget:'Armor X13',ragCount:1,route:options.route??'RAG_PRODUCT'},
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

test('valid Spanish contextual FAB language is not flagged as missing grounding',()=>{
  const cases=[
    fabObservation('Tiene 8 GB de RAM física + hasta 8 GB de RAM virtual. Además, para usar WhatsApp y hacer llamadas de manera sencilla, este dato puede ser útil al elegir el equipo.',['MEMORIA'],{useCase:'usar WhatsApp y hacer llamadas de manera sencilla'}),
    fabObservation('Armor 22 tiene 6600 mAh y 33 W de carga, adecuada para jornadas de trabajo exigentes.',['BATERIA'],{intent:'RECOMMEND',route:'RAG_RECOMMENDATION',useCase:'trabajo',priorities:['bateria']}),
    fabObservation('Armor X13 vs Armor 22. Mi postura: si priorizas pantalla, carga rápida y cámara, Armor 22; si prefieres un equipo más compacto y ligero, Armor X13.',['BATERÍA','PANTALLA','CÁMARA','PESO'],{intent:'COMPARE',route:'RAG_COMPARISON'}),
  ];
  for(const row of cases){
    const findings=evaluateCommercial(row);
    assert.equal(findings.some(f=>f.code==='FAB_GROUNDING_MISSING'),false,JSON.stringify(findings));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHard } from '../../qa/evaluators/hard.ts';
import { assessFabGrounding } from '../../qa/evaluators/commercial.ts';

function observation(answer:string):any{return{
  httpStatus:200,ok:true,
  request:{sessionId:'qa:test',messageId:'qa:test:t01',message:'Estoy viendo el Armor 22 para trabajo. Ya mandé reparar mi celular dos veces por caídas.'},
  response:{
    answer,
    state:{lastNba:'SOFT_CLOSE',useCase:'trabajo',problem:'reparaciones_repetidas',currentAttributes:['RESISTENCIA','DURABILIDAD','USO_EN_TRABAJO']},
    debug:{intent:'EVALUATE_USE',route:'RAG_PRODUCT',ragCount:1,erp:{price:1399,stock:9},decisionTrace:{nextBestAction:'SOFT_CLOSE'}},
  },
  persisted:null,roundTripMs:1,
};}

test('QA allows seller-led verified price when consultative turn is authorized to SOFT_CLOSE fulfillment',()=>{
  const obs=observation('Si ya lo reparaste dos veces por caídas, lo importante es no volver al mismo gasto. Armor 22 tiene resistencia a caídas de 1.5 m, IP68, IP69K y MIL-STD-810H, así que está pensado para aguantar mejor golpes, agua y polvo en el trabajo. Está a S/ 1399 y tenemos disponibilidad. ¿Prefieres envío o recojo?');
  const findings=evaluateHard({message:obs.request.message,expected:{}} as any,obs);
  assert.equal(findings.some(f=>f.code==='UNSOLICITED_PRICE'),false);
});

test('QA recognizes practical rugged FAB wording as a grounded benefit',()=>{
  const obs=observation('Si ya lo reparaste dos veces por caídas, lo importante es no volver al mismo gasto. Armor 22 tiene resistencia a caídas de 1.5 m, IP68, IP69K y MIL-STD-810H, así que está pensado para aguantar mejor golpes, agua y polvo en el trabajo.');
  assert.equal(assessFabGrounding(obs),true);
});

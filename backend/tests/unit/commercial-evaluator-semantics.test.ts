import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSpinUtility, evaluateCommercial } from '../../qa/evaluators/commercial.ts';
import type { QaTurnObservation } from '../../qa/types.ts';

function observation(args:{message:string;answer:string;state?:any;debug?:any}):QaTurnObservation{
  return{
    httpStatus:200,ok:true,
    request:{sessionId:'qa:test',messageId:'qa:test:t01',message:args.message},
    response:{answer:args.answer,state:args.state??{},debug:args.debug??{}},
    persisted:null,roundTripMs:1,
  };
}

test('focused factual question with current SPIN contribution is not a SPIN pass',()=>{
  const obs=observation({
    message:'¿Tiene NFC?',answer:'Sí, tiene NFC.',
    state:{lastIntent:'CAPABILITY',lastNba:'ANSWER_ONLY',lastSpinContribution:'NECESIDAD_SOLUCION',priorities:['nfc']},
    debug:{intent:'CAPABILITY'},
  });
  assert.equal(assessSpinUtility(obs),false);
  assert.ok(evaluateCommercial(obs).some(f=>f.code==='SPIN_UTILITY_INVALID'));
});

test('focused factual question can reuse old customer context without being treated as new SPIN',()=>{
  const obs=observation({
    message:'¿Tiene NFC?',answer:'Sí, tiene NFC.',
    state:{lastIntent:'CAPABILITY',lastNba:'ANSWER_ONLY',lastSpinContribution:null,useCase:'trabajo_en_campo',priorities:['resistencia']},
    debug:{intent:'CAPABILITY'},
  });
  assert.equal(assessSpinUtility(obs),true);
});

test('impact is a valid consumable SPIN missing fact',()=>{
  const obs=observation({
    message:'Se me cae seguido.',answer:'¿Y eso qué te genera en el trabajo: interrupciones o pérdida de tiempo?',
    state:{lastIntent:'EVALUATE_USE',lastNba:'ASK_MISSING_FACT',pendingMissingFact:'impacto del problema',useCase:'construccion',problem:'caidas_frecuentes'},
    debug:{intent:'EVALUATE_USE'},
  });
  assert.equal(assessSpinUtility(obs),true);
});

test('generic budget question before situation/problem are understood is not valid SPIN',()=>{
  const obs=observation({
    message:'Busco uno resistente.',answer:'¿Cuál es tu presupuesto máximo?',
    state:{lastIntent:'RECOMMEND',lastNba:'ASK_MISSING_FACT',pendingMissingFact:'presupuesto máximo',useCase:null,problem:null,priorities:['resistencia']},
    debug:{intent:'RECOMMEND'},
  });
  assert.equal(assessSpinUtility(obs),false);
});

test('recommendation is allowed as current answer while N+1 asks one SPIN fact',()=>{
  const obs=observation({
    message:'Busco uno resistente y con buena batería, ¿qué me recomiendas?',
    answer:'Te recomiendo Armor 22 por resistencia y batería. ¿Para qué uso principal lo necesitas?',
    state:{lastIntent:'RECOMMEND',lastNba:'ASK_MISSING_FACT',pendingMissingFact:'uso principal',recommendedProduct:'Armor 22',priorities:['resistencia','bateria']},
    debug:{intent:'RECOMMEND'},
  });
  const findings=evaluateCommercial(obs);
  assert.equal(findings.some(f=>f.code==='UNSUPPORTED_COMMERCIAL_ACTION'),false);
  assert.equal(assessSpinUtility(obs),true);
});

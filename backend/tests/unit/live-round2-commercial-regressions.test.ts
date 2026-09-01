import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { stockResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
import type { ConversationState } from '../../src/domain/types.ts';
import type { TurnDecision } from '../../src/ports/LlmProvider.ts';

function state(patch:Partial<ConversationState>={}):ConversationState{return{...patch} as ConversationState;}

function decision(patch:Partial<TurnDecision>={}):TurnDecision{return{
  primaryIntent:'OTHER',secondaryIntents:[],targetProduct:null,mentionedProducts:[],referenceType:'ACTIVE_PRODUCT_FALLBACK',explicitSwitch:false,selectedProduct:null,comparisonProducts:[],attributes:[],customerNeed:null,customerProblem:null,priorities:[],objection:null,commercialStage:null,spinContribution:null,nextBestAction:'ANSWER_ONLY',needsSql:false,needsProductRag:false,needsInstitutionalRag:false,confidence:0.9,...patch,
} as TurnDecision;}

test('battery pain statement becomes a canonical autonomy problem instead of another discovery prompt',()=>{
  const facts=extractCommercialFacts('Mi celular actual se queda sin batería antes de terminar el trabajo',state({useCase:'delivery'}));
  assert.equal(facts.problem,'autonomia_insuficiente');
  assert.ok(facts.spinFacts.some(value=>/problema:autonomia_insuficiente/i.test(value)));
});

test('explicit compare authority beats a planner downgrade to EVALUATE_USE and builds the active plus mentioned pair',()=>{
  const previous=state({activeProduct:'Armor 25T Pro',queryTarget:'Armor 25T Pro',salientProduct:'Armor 25T Pro',useCase:'trabajo_en_campo'});
  const deterministic=decision({primaryIntent:'COMPARE',targetProduct:'Armor 22',mentionedProducts:['Armor 22'],referenceType:'NAMED_QUERY_TARGET',nextBestAction:'COMPARE',needsSql:true,needsProductRag:true});
  const planner=decision({primaryIntent:'EVALUATE_USE',targetProduct:'Armor 22',mentionedProducts:['Armor 22'],referenceType:'NAMED_QUERY_TARGET',nextBestAction:'ASK_MISSING_FACT'});
  const result=validateTurnDecision(planner,previous,['Armor 25T Pro','Armor 22'],deterministic);
  assert.equal(result.primaryIntent,'COMPARE');
  assert.deepEqual(result.comparisonProducts,['Armor 25T Pro','Armor 22']);
  assert.equal(result.nextBestAction,'COMPARE');
});

test('a context-only EVALUATE_USE turn cannot jump to soft close without a problem, implication or chosen recommendation',()=>{
  const result=evaluatePostAnswerCommercialProgression({
    intent:'EVALUATE_USE',currentNba:'ANSWER_ONLY',resolvedProduct:'Armor X13',verifiedCurrentAnswer:true,
    state:state({activeProduct:'Armor X13',useCase:'trabajo',priorities:['vision_nocturna'],explicitPriorities:['vision_nocturna']}),
  });
  assert.notEqual(result.candidateNba,'SOFT_CLOSE');
});

test('stock soft close answers availability without repeating an already known price',()=>{
  const answer=stockResponse({product:'Armor X13',shortName:'Armor X13',price:899,stock:7,currency:'PEN',source:'TEST'} as any,null,true,null);
  assert.match(answer,/disponible|stock/i);
  assert.doesNotMatch(answer,/S\/\s*899|\b899\b/i);
  assert.match(answer,/env[ií]o|recoger/i);
});

test('explicit reservation confirmation is purchase intent, never an institutional policy lookup',()=>{
  const plan=resolveIntentPlan('Sí, quiero reservarlo');
  assert.equal(plan.primary,'PURCHASE');
  assert.ok(!plan.secondary.includes('POLICY'));
});

test('battery pain produces a concise grounded pain-to-benefit answer instead of a RAG dump',()=>{
  const answer=buildGroundedDirectAnswer({
    message:'Mi celular actual se queda sin batería antes de terminar el trabajo',intent:'EVALUATE_USE',attribute:'BATERIA',resolvedProduct:'Armor X12 Pro',useCase:'delivery',problem:'autonomia_insuficiente',
    rag:[{text:'Capacidad de batería: 4860 mAh. Carga cableada: 10 W. Tipo de batería: Li-Po. Autonomía en espera: 264 horas. Autonomía en llamadas: 20 horas.',source:'TEST:BATERIA',section:'BATERIA',domain:'PRODUCT',productId:'P-X12'} as any],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'4860 mAh',productId:'P-X12',source:'TEST'} as any],
  });
  assert.ok(answer);
  assert.match(answer!,/bater[ií]a|jornada|trabajo/i);
  assert.match(answer!,/4860\s*mAh/i);
  assert.doesNotMatch(answer!,/Caracter[ií]sticas confirmadas|Autonom[ií]a en espera|Autonom[ií]a en llamadas/i);
  assert.ok(answer!.length<320);
});

test('night-photo work context stays on the verified night camera instead of drifting to RAM or price',()=>{
  const answer=buildGroundedDirectAnswer({
    message:'La necesito para tomar fotos de noche durante mi trabajo',intent:'EVALUATE_USE',attribute:'CAMARA',resolvedProduct:'Armor X13',useCase:'trabajo',problem:null,
    rag:[{text:'Cámara de visión nocturna: 24 MP. Sensor cámara nocturna: OV24A1B.',source:'TEST:CAMARA',section:'CAMARA',domain:'PRODUCT',productId:'P-X13'} as any],
    verifiedFacts:[{domain:'PRODUCT_RAG',key:'CAMARA_NOCTURNA_MP',value:'24 MP',productId:'P-X13',source:'TEST'} as any,{domain:'PRODUCT_RAG',key:'CAMARA_NOCTURNA_SENSOR',value:'OV24A1B',productId:'P-X13',source:'TEST'} as any],
  });
  assert.ok(answer);
  assert.match(answer!,/24\s*MP/i);
  assert.match(answer!,/noche|nocturn/i);
  assert.doesNotMatch(answer!,/RAM|S\/|precio|stock|disponib/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCommercialFacts } from '../../src/conversation/commercial/CommercialFacts.ts';
import { resolveIntentPlan } from '../../src/conversation/intent/IntentPlan.ts';
import { validateTurnDecision } from '../../src/conversation/decision/DecisionValidator.ts';
import { evaluatePostAnswerCommercialProgression } from '../../src/conversation/nba/PostAnswerCommercialProgression.ts';
import { stockResponse } from '../../src/conversation/commercial/ResponsePolicy.ts';
import { buildGroundedDirectAnswer } from '../../src/conversation/commercial/GroundedDirectAnswer.ts';
import { safeWrite } from '../../src/conversation/writer/WriterGuard.ts';
import { reservationAdvance } from '../../src/conversation/HybridConversationEngine.ts';
import type { ConversationState } from '../../src/domain/types.ts';
import type { LlmProvider, TurnDecision } from '../../src/ports/LlmProvider.ts';

// Round-2 live failures are executable contracts; keep this file in standard CI.
// Compatibility refinements must preserve these live conversation boundaries.
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

test('writer rejects internal RAG-dump phrasing and falls back to the grounded battery benefit',async()=>{
  const llm:LlmProvider={async write(){return{text:'Armor X12 Pro: batería 4860 mAh y batería Características confirmadas de batería y carga. Autonomía en espera: 264 horas. Autonomía en llamadas: 20 horas. ¿Cómo te afecta?',model:'stub',usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0},durationMs:1};}};
  const direct='Si te quedas sin batería antes de terminar la jornada, esto ya afecta el trabajo. Armor X12 Pro tiene batería de 4860 mAh.';
  const result=await safeWrite(llm,{
    message:'Mi celular actual se queda sin batería antes de terminar el trabajo',intent:'EVALUATE_USE',resolvedCurrentIntent:'EVALUATE_USE',resolvedProduct:'Armor X12 Pro',activeProduct:'Armor X12 Pro',useCase:'delivery',problem:'autonomia_insuficiente',state:state({activeProduct:'Armor X12 Pro',useCase:'delivery',problem:'autonomia_insuficiente'}),directAnswer:direct,
    rag:[{text:'Capacidad de batería: 4860 mAh. Carga cableada: 10 W. Autonomía en espera: 264 horas. Autonomía en llamadas: 20 horas.',source:'TEST:BATERIA',section:'BATERIA',domain:'PRODUCT',productId:'P-X12'} as any],verifiedFacts:[{domain:'PRODUCT_RAG',key:'BATERIA_MAH',value:'4860 mAh',productId:'P-X12',source:'TEST'} as any],allowedProducts:['Armor X12 Pro'],nextBestAction:'ASK_MISSING_FACT',finalExecutableNba:'ASK_MISSING_FACT',executableNba:'ASK_MISSING_FACT',missingFact:'impacto',decisionImpact:true,
  } as any,direct);
  assert.doesNotMatch(result.answer,/Caracter[ií]sticas confirmadas|Autonom[ií]a en espera|Autonom[ií]a en llamadas/i);
  assert.match(result.answer,/4860\s*mAh/i);
  assert.equal((result.answer.match(/\?/g)??[]).length,1);
});

test('reservation confirmation preserves already collected data and asks only the still-missing field',()=>{
  const previous=state({activeProduct:'Armor X13',selectedProduct:'Armor X13',reservationStage:'NEED_NAME',reservationDocument:'70009999',purchaseSignal:true});
  const next=reservationAdvance(previous,'Sí, quiero reservarlo');
  assert.ok(next);
  assert.equal(next!.stage,'NEED_NAME');
  assert.equal(next!.document,'70009999');
  assert.match(next!.answer,/nombre|nombres|apellido/i);
  assert.doesNotMatch(next!.answer,/tel[eé]fono|correo|adelanto|fecha de recojo/i);
});

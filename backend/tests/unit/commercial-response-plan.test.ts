import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialResponseInstruction, buildCommercialResponsePlan, hasFabricatedCommercialPressure } from '../../src/conversation/commercial/CommercialResponsePlan.ts';

const base = {
  message: 'consulta', intent: 'CAPABILITY', state: { activeProduct: 'Armor 22' },
  directAnswer: 'Respuesta verificada.', verifiedFacts: [], commercialContractPrepared: true,
} as any;

test('isolated factual capability remains deterministic', () => {
  const plan = buildCommercialResponsePlan({ ...base, finalExecutableNba: 'ANSWER_ONLY' }, 'Sí, tiene NFC.');
  assert.equal(plan.mode, 'FACTUAL_DIRECT');
  assert.equal(plan.shouldUseLlm, false);
  assert.equal(plan.maxQuestions, 0);
});

test('verified customer context selects contextual FAB', () => {
  const plan = buildCommercialResponsePlan({
    ...base,
    state: { activeProduct: 'Armor 22', commercialStrategy: 'FAB_SPIN' },
    useCase: 'trabajo en construcción', problem: 'caídas frecuentes', priorities: ['resistencia'],
    commercialMove: {
      action: 'RELATED_VALUE', kind: 'CONTEXTUAL_BENEFIT', targetProduct: 'Armor 22', intensity: 'LIGHT',
      reason: 'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT', basis: ['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],
      attribute: 'RESISTENCIA', verifiedFacts: [{ domain:'PRODUCT_RAG', key:'RESISTENCIA_CAIDAS', value:'1.5 m' }],
      relevantCustomerContext: { useCase:'trabajo en construcción', problem:'caídas frecuentes', priorities:['resistencia'], budget:null, objection:null },
    },
    finalExecutableNba: 'RELATED_VALUE',
  } as any, 'Resistencia a caídas: 1.5 m.');
  assert.equal(plan.mode, 'CONTEXTUAL_FAB');
  assert.equal(plan.shouldUseLlm, true);
  assert.equal(plan.acknowledgeContext, true);
  assert.equal(plan.maxQuestions, 0);
});

test('pain implications are exposed to the writer context instead of being lost',()=>{
  const plan=buildCommercialResponsePlan({
    ...base,
    state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',
    implications:['perdida_horas_trabajo'],priorities:['resistencia'],
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m'}],
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA',verifiedFacts:[],relevantCustomerContext:{}},
    finalExecutableNba:'RELATED_VALUE',
  } as any,'Resistencia verificada.');
  assert.ok(plan.contextFocus.includes('perdida_horas_trabajo'));
});

test('contextual pain instruction asks for simple human language and a grounded mini-scene without fake personal anecdotes',()=>{
  const plan=buildCommercialResponsePlan({
    ...base,
    state:{activeProduct:'Armor 22',commercialStrategy:'FAB_SPIN'},
    useCase:'trabajo_construccion',problem:'caidas_frecuentes',implications:['perdida_horas_trabajo'],priorities:['resistencia'],
    verifiedFeatures:[{domain:'PRODUCT_RAG',key:'RESISTENCIA_CAIDAS',value:'1.5 m'}],
    commercialMove:{action:'RELATED_VALUE',kind:'CONTEXTUAL_BENEFIT',targetProduct:'Armor 22',intensity:'LIGHT',reason:'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT',basis:['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],attribute:'RESISTENCIA',verifiedFacts:[],relevantCustomerContext:{}},
    finalExecutableNba:'RELATED_VALUE',
  } as any,'Resistencia verificada.');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/lenguaje cotidiano|palabras simples/i);
  assert.match(instruction,/mini[- ]escena|escena cotidiana/i);
  assert.match(instruction,/no digas.*te entiendo/i);
  assert.match(instruction,/no.*(?:a mí me pasó|amigo|experiencia personal)/i);
  assert.match(instruction,/tiempo|molestia|riesgo|tranquilidad/i);
  assert.match(instruction,/1 o 2|uno o dos/i);
  assert.match(instruction,/no uses.*verdadero problema/i);
});

test('fabricated personal anecdotes are rejected as commercial pressure',()=>{
  assert.equal(hasFabricatedCommercialPressure('A mí me pasó lo mismo con mi celular.'),true);
  assert.equal(hasFabricatedCommercialPressure('A un amigo mío le pasó igual en obra.'),true);
  assert.equal(hasFabricatedCommercialPressure('Nos suele pasar mucho con clientes de construcción.'),true);
});

test('only an executable missing fact opens SPIN discovery', () => {
  const plan = buildCommercialResponsePlan({ ...base, finalExecutableNba:'ASK_MISSING_FACT', missingFact:'prioridad' }, 'Te explico lo confirmado.');
  assert.equal(plan.mode, 'DISCOVERY_SPIN');
  assert.equal(plan.maxQuestions, 1);
});

test('comparison uses guided choice', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'COMPARE', resolvedCurrentIntent:'COMPARE', finalExecutableNba:'COMPARE' }, 'A frente a B.');
  assert.equal(plan.mode, 'GUIDED_CHOICE');
});

test('price objection uses LAER', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'HANDLE_PRICE_OBJECTION', objection:'precio', finalExecutableNba:'OFFER_ALTERNATIVE' }, 'El precio es el confirmado.');
  assert.equal(plan.mode, 'OBJECTION_LAER');
});

test('purchase signal cannot restart discovery', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'PURCHASE', purchaseSignal:true, finalExecutableNba:'COLLECT_RESERVATION_DATA' }, 'Continuemos con la compra.');
  assert.equal(plan.mode, 'PURCHASE_PROGRESS');
  assert.notEqual(plan.mode, 'DISCOVERY_SPIN');
});

test('price plus availability advances to fulfillment instead of asking stock again',()=>{
  const plan=buildCommercialResponsePlan({
    ...base,intent:'PRICE_AVAILABILITY',resolvedCurrentIntent:'PRICE_AVAILABILITY',
    state:{activeProduct:'Armor 22'},finalExecutableNba:'SOFT_CLOSE',
  },'Armor 22 está a S/ 1399. También está disponible.');
  assert.equal(plan.mode,'SOFT_CLOSE');
  assert.equal(plan.closePurpose,'FULFILLMENT');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/env[ií]o/i);
  assert.match(instruction,/recoger|recojo|local/i);
  assert.doesNotMatch(instruction,/revisar disponibilidad/i);
});

test('after customer chooses delivery or pickup the next close purpose is reservation',()=>{
  const plan=buildCommercialResponsePlan({
    ...base,message:'Prefiero envío a Ate.',intent:'POLICY',resolvedCurrentIntent:'POLICY',
    state:{activeProduct:'Armor 22',pendingCommercialAction:'SOFT_CLOSE'},finalExecutableNba:'SOFT_CLOSE',
  },'Sí, hacemos envíos a Ate.');
  assert.equal(plan.closePurpose,'RESERVATION');
  const instruction=buildCommercialResponseInstruction(plan);
  assert.match(instruction,/reserv/i);
  assert.doesNotMatch(instruction,/env[ií]o o recoger|revisar disponibilidad/i);
});

test('soft close exists only when exact NBA authorizes it', () => {
  assert.equal(buildCommercialResponsePlan({ ...base, finalExecutableNba:'SOFT_CLOSE' }, 'Respuesta.').mode, 'SOFT_CLOSE');
  assert.notEqual(buildCommercialResponsePlan({ ...base, finalExecutableNba:'ANSWER_ONLY' }, 'Respuesta.').mode, 'SOFT_CLOSE');
});

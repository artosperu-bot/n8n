import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommercial } from '../../qa/evaluators/commercial.ts';

const observation = (answer: string, debug: any = {}, state: any = { lastNba: 'HANDLE_OBJECTION' }, message = 'Está muy caro') => ({
  httpStatus: 200,
  ok: true,
  request: { sessionId: 'qa-x', messageId: 'qa:x:t01', message },
  response: { answer, state, debug },
  roundTripMs: 10,
});

test('commercial evaluator flags multiple questions and robotic meta language', () => {
  const findings = evaluateCommercial(observation('Como modelo de IA, ¿qué buscas? ¿Para cuándo?'));
  assert.ok(findings.some(x => x.code === 'TOO_MANY_QUESTIONS'));
  assert.ok(findings.some(x => x.code === 'ROBOTIC_META_LANGUAGE'));
});

test('price objection needs acknowledgement', () => {
  const findings = evaluateCommercial(observation('Compra el Armor X13 porque es mejor.', { intent: 'HANDLE_PRICE_OBJECTION', priceObjection: true }));
  assert.ok(findings.some(x => x.code === 'EMPATHY_WEAK_PRICE_OBJECTION'));
});

test('telemetry and n8n delivery failures are advisory yellow findings', () => {
  const findings = evaluateCommercial(observation('Entiendo, busquemos una opción que encaje.', {
    intent: 'HANDLE_PRICE_OBJECTION',
    priceObjection: true,
    telemetry: { delivered: false, error: 'metrics down' },
    automation: { delivered: false, error: 'n8n 500' },
  }));
  assert.ok(findings.some(x => x.code === 'TELEMETRY_DELIVERY_FAILED'));
  assert.ok(findings.some(x => x.code === 'AUTOMATION_DELIVERY_FAILED'));
  assert.equal(findings.some(x => x.level === 'RED'), false);
});

test('comparison length uses the wider chat guidance without relaxing normal replies', () => {
  const comparison = evaluateCommercial(observation('x'.repeat(700), { intent: 'COMPARE' }));
  const normal = evaluateCommercial(observation('x'.repeat(700), { intent: 'PRODUCT_INFO' }));
  assert.equal(comparison.some(x => x.code === 'CHAT_TOO_LONG'), false);
  assert.equal(normal.some(x => x.code === 'CHAT_TOO_LONG'), true);
});

test('ASK_MISSING_FACT fails delivery when the answer never asks for the missing fact', () => {
  const findings=evaluateCommercial(observation(
    'Te recomiendo revisar resistencia y batería.',
    {intent:'EVALUATE_USE'},
    {lastNba:'ASK_MISSING_FACT',commercialStage:'DESCUBRIMIENTO',useCase:'construccion',problem:'caidas'},
    'Trabajo en construcción y se me cae el celular.',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_NOT_DELIVERED'));
});

test('SOFT_CLOSE fails delivery when conditional stock interest gets only a factual answer', () => {
  const findings=evaluateCommercial(observation(
    'Sí, está disponible.',
    {intent:'STOCK'},
    {lastNba:'SOFT_CLOSE',interestSignal:true,purchaseSignal:false,activeProduct:'Armor X13',commercialStage:'CONSIDERACION'},
    'si está disponible me interesa',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_NOT_DELIVERED'));
});

test('ANSWER_ONLY is valid for a policy answer but not when purchase interest clearly calls for progression', () => {
  const policy=evaluateCommercial(observation('La garantía cubre defectos de fábrica.',{intent:'WARRANTY'},{lastNba:'ANSWER_ONLY',commercialStage:'DESCUBRIMIENTO'},'¿Qué garantía tiene?'));
  const interested=evaluateCommercial(observation('Armor 22 está a S/ 1399.',{intent:'PRICE'},{lastNba:'ANSWER_ONLY',interestSignal:true,activeProduct:'Armor 22',commercialStage:'CONSIDERACION'},'¿Cuánto cuesta?'));
  assert.equal(policy.some(x=>x.code==='NBA_PROGRESSION_MISSING'),false);
  assert.ok(interested.some(x=>x.code==='NBA_PROGRESSION_MISSING'));
});

test('ASK_MISSING_FACT must not ask again for context already known', () => {
  const findings=evaluateCommercial(observation(
    '¿Para qué uso necesitas el equipo?',
    {intent:'EVALUATE_USE'},
    {lastNba:'ASK_MISSING_FACT',useCase:'construccion',problem:'caidas',commercialStage:'DESCUBRIMIENTO'},
    'También necesito buena batería.',
  ));
  assert.ok(findings.some(x=>x.code==='NBA_REPEATS_KNOWN'));
});

test('customer-facing sourcing language is flagged without breaking a real technical phrase',()=>{
  const internal=evaluateCommercial(observation('Según la ficha técnica y la fuente consultada, tiene buena autonomía.'));
  const technical=evaluateCommercial(observation('Necesitas una fuente de alimentación compatible con el cargador.'));
  assert.ok(internal.some(x=>x.code==='ROBOTIC_META_LANGUAGE'));
  assert.equal(technical.some(x=>x.code==='ROBOTIC_META_LANGUAGE'),false);
});

test('ANSWER_ONLY with an invented demo promise is a RED actionability failure',()=>{
  const findings=evaluateCommercial(observation(
    'Perfecto: puedo agendar la prueba; yo coordino y te confirmo luego.',
    {intent:'OTHER'},
    {lastNba:'ANSWER_ONLY',activeProduct:'Armor 22'},
    '¿Pueden agendarme una prueba?',
  ));
  assert.ok(findings.some(x=>x.code==='UNSUPPORTED_COMMERCIAL_ACTION'&&x.level==='RED'));
});

test('ANSWER_ONLY with a recommendation is a RED actionability failure',()=>{
  const findings=evaluateCommercial(observation('Te recomiendo el Armor 22.',{intent:'CAPABILITY'},{lastNba:'ANSWER_ONLY',activeProduct:'Armor 22'},'¿Tiene NFC?'));
  assert.ok(findings.some(x=>x.code==='UNSUPPORTED_COMMERCIAL_ACTION'&&x.level==='RED'));
});

test('isolated verified weight does not require FAB',()=>{
  const findings=evaluateCommercial(observation('El Armor 22 pesa 324 g.',{intent:'CAPABILITY',route:'RAG_PRODUCT',ragCount:1},{lastNba:'ANSWER_ONLY',currentAttributes:['FISICO']},'¿Cuánto pesa el Armor 22?'));
  assert.equal(findings.some(x=>x.code==='FAB_GROUNDING_MISSING'),false);
});

test('verified resistance with construction context requires safe FAB',()=>{
  const findings=evaluateCommercial(observation('Tiene certificación IP68.',{intent:'CAPABILITY',route:'RAG_PRODUCT',ragCount:1},{lastNba:'ANSWER_ONLY',currentAttributes:['RESISTENCIA_A_CAIDAS'],useCase:'trabajo',problem:'caidas_frecuentes',priorities:['resistencia']},'Trabajo en construcción y se me cae el celular'));
  assert.ok(findings.some(x=>x.code==='FAB_GROUNDING_MISSING'));
});

test('comparison attribute with a safe contextual advantage satisfies FAB',()=>{
  const findings=evaluateCommercial(observation('Armor 22 tiene 6600 mAh frente a 6320 mAh; esa mayor capacidad da más margen entre cargas.',{intent:'COMPARE',route:'RAG_COMPARISON',ragCount:2},{lastNba:'COMPARE',currentAttributes:['BATERIA'],comparisonProducts:['Armor X13','Armor 22']},'¿Cuál tiene mejor batería?'));
  assert.equal(findings.some(x=>x.code==='FAB_GROUNDING_MISSING'),false);
});

test('hidden A to B recommendation change is a RED continuity failure',()=>{
  const findings=evaluateCommercial(observation(
    'Listo. ¿Quieres que revise disponibilidad?',
    {intent:'RECOMMEND_WITHIN_BUDGET',route:'RAG_RECOMMENDATION',queryTarget:'Product B'},
    {lastNba:'SOFT_CLOSE',activeProduct:'Product B',recommendedProduct:'Product B',customerVisibleRecommendedProduct:'Product A',
      recommendationChanged:true,recommendationChangeFrom:'Product A',recommendationChangeReason:'mejor batería',recommendationChangeCommunicated:false,
      stageContinuityValid:true,commercialStage:'EVALUACION'},
    'máximo 1500',
  ));
  assert.ok(findings.some(x=>x.code==='COMMERCIAL_PRODUCT_SWITCH_UNEXPLAINED'&&x.level==='RED'));
});

test('communicated recommendation change passes continuity evaluation',()=>{
  const findings=evaluateCommercial(observation(
    'Con la nueva información, cambio mi recomendación de Product A a Product B por su batería verificada. ¿Quieres que revise disponibilidad?',
    {intent:'RECOMMEND_WITHIN_BUDGET',route:'RAG_RECOMMENDATION',queryTarget:'Product B'},
    {lastNba:'SOFT_CLOSE',activeProduct:'Product B',recommendedProduct:'Product B',customerVisibleRecommendedProduct:'Product B',
      recommendationChanged:true,recommendationChangeFrom:'Product A',recommendationChangeReason:'batería verificada',recommendationChangeCommunicated:true,
      stageContinuityValid:true,commercialStage:'EVALUACION'},
    'máximo 1500',
  ));
  assert.equal(findings.some(x=>x.code==='COMMERCIAL_PRODUCT_SWITCH_UNEXPLAINED'),false);
});

test('continuity evaluator detects a hidden mismatch without trusting self-reported flags',()=>{
  const findings=evaluateCommercial(observation(
    'Listo. ¿Quieres que revise disponibilidad?',
    {intent:'RECOMMEND_WITHIN_BUDGET',queryTarget:'Product B'},
    {lastNba:'SOFT_CLOSE',activeProduct:'Product B',recommendedProduct:'Product B',customerVisibleRecommendedProduct:'Product A',commercialStage:'EVALUACION'},
    'máximo 1500',
  ));
  assert.ok(findings.some(x=>x.code==='COMMERCIAL_PRODUCT_SWITCH_UNEXPLAINED'&&x.level==='RED'));
});

test('explicit selected product is the valid customer referent over an older recommendation',()=>{
  const findings=evaluateCommercial(observation(
    'Perfecto. Para iniciar la reserva de Product B, envíame tu DNI.',
    {intent:'PURCHASE',queryTarget:'Product B'},
    {lastNba:'COLLECT_RESERVATION_DATA',selectedProduct:'Product B',activeProduct:'Product B',salientProduct:'Product B',
      recommendedProduct:'Product A',customerVisibleRecommendedProduct:'Product A',explicitSwitch:true,purchaseSignal:true,commercialStage:'CIERRE'},
    'ya ese quiero',
  ));
  assert.equal(findings.some(x=>x.code==='COMMERCIAL_PRODUCT_SWITCH_UNEXPLAINED'),false);
});

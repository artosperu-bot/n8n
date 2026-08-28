import type { QaScenario } from '../types.ts';

/**
 * Primer bloque canónico de 20 conversaciones LIVE.
 *
 * Regla: son journeys multi-turno. No convertirlos en preguntas unitarias aisladas,
 * porque el objetivo es medir continuidad, referencia, estado, verdad, NBA y compra.
 * El esperado completo de backend + ia_conversaciones + ia_contexto vive en:
 * backend/docs/STECH_QA_ACCEPTANCE_20_BACKEND_SUPABASE.md
 */
export const acceptance20Scenarios: QaScenario[] = [
  {
    id: 'A20-01-PRICE-STOCK-PURCHASE',
    family: 'CLOSING',
    title: 'Precio directo → stock → compra del mismo producto',
    turns: [
      { message: '¿Cuánto cuesta el Armor 22?', expected: { intent: 'PRICE', queryTarget: 'Armor 22', activeProduct: 'Armor 22' } },
      { message: '¿Y tienes stock?', expected: { intent: 'STOCK', queryTarget: 'Armor 22', activeProduct: 'Armor 22' } },
      { message: 'Ya, quiero comprarlo.', expected: { intent: 'PURCHASE', activeProduct: 'Armor 22' } },
    ],
  },
  {
    id: 'A20-02-BATTERY-CONSTRUCTION',
    family: 'COMMERCIAL',
    title: 'Necesidad de batería + construcción → recomendación → precio',
    turns: [
      { message: 'Necesito un celular que me dure todo el día trabajando.' },
      { message: 'Trabajo en construcción, casi no tengo dónde cargarlo.' },
      { message: '¿Cuánto cuesta?', expected: { intent: 'PRICE' } },
    ],
  },
  {
    id: 'A20-03-BUDGET-BATTERY',
    family: 'COMMERCIAL',
    title: 'Presupuesto máximo + batería + recomendación final',
    turns: [
      { message: 'Tengo máximo S/900, ¿qué me recomiendas?', expected: { intent: 'RECOMMEND_WITHIN_BUDGET', budget: 900 } },
      { message: 'Quiero buena batería.', expected: { budget: 900 } },
      { message: '¿Cuál de esos comprarías tú para trabajo?', expected: { budget: 900 } },
    ],
  },
  {
    id: 'A20-04-COMPARE-DELIVERY',
    family: 'COMPARISON',
    title: 'Comparación X13 vs Armor 22 + delivery + precio del recomendado',
    turns: [
      { message: '¿Armor X13 o Armor 22?', expected: { intent: 'COMPARE' } },
      { message: 'Lo quiero para delivery.' },
      { message: '¿Y cuánto cuesta el recomendado?', expected: { intent: 'PRICE' } },
    ],
  },
  {
    id: 'A20-05-RECOMMENDED-REFERENT',
    family: 'REFERENCE',
    title: 'Referencia “el recomendado” se conserva entre NFC y precio',
    turns: [
      { message: 'Necesito uno resistente por menos de S/1500.', expected: { budget: 1500 } },
      { message: '¿El recomendado tiene NFC?', expected: { intent: 'CAPABILITY' } },
      { message: '¿Y cuánto cuesta?', expected: { intent: 'PRICE' } },
    ],
  },
  {
    id: 'A20-06-OTHER-REFERENT',
    family: 'REFERENCE',
    title: 'Referencia “el otro” dentro de una comparación',
    turns: [
      { message: 'Compárame X13 y Armor 22.', expected: { intent: 'COMPARE' } },
      { message: 'Creo que me gusta más el Armor 22.' },
      { message: '¿Y el otro cuánto cuesta?', expected: { intent: 'PRICE', queryTarget: 'Armor X13' } },
    ],
  },
  {
    id: 'A20-07-MENTION-NO-SWITCH',
    family: 'REFERENCE',
    title: 'Mención de Armor 22 no cambia el producto activo X13',
    turns: [
      { message: 'Estoy viendo el Armor X13.', expected: { activeProduct: 'Armor X13' } },
      { message: '¿La batería del Armor 22 es mejor?', expected: { explicitSwitch: false, activeProduct: 'Armor X13' } },
      { message: '¿Y el mío cuánto cuesta?', expected: { intent: 'PRICE', queryTarget: 'Armor X13', activeProduct: 'Armor X13' } },
    ],
  },
  {
    id: 'A20-08-EXPLICIT-SWITCH',
    family: 'REFERENCE',
    title: 'Cambio explícito X13 → Armor 22 y continuidad de stock',
    turns: [
      { message: 'Estoy viendo el Armor X13.', expected: { activeProduct: 'Armor X13' } },
      { message: 'Mejor hablemos del Armor 22.', expected: { activeProduct: 'Armor 22', queryTarget: 'Armor 22', explicitSwitch: true } },
      { message: '¿Tiene stock?', expected: { intent: 'STOCK', queryTarget: 'Armor 22', activeProduct: 'Armor 22' } },
    ],
  },
  {
    id: 'A20-09-PREFERENCE-NO-SWITCH',
    family: 'REFERENCE',
    title: 'Preferencia de batería no implica switch silencioso',
    turns: [
      { message: 'Estoy viendo el Armor X13 y comparándolo con el Armor 22.', expected: { activeProduct: 'Armor X13' } },
      { message: 'Prefiero la batería del Armor 22.', expected: { explicitSwitch: false, activeProduct: 'Armor X13' } },
      { message: '¿Cuál me conviene entonces?' },
    ],
  },
  {
    id: 'A20-10-MEDIUM-PURCHASE',
    family: 'CLOSING',
    title: 'Compra media sobre el producto recomendado',
    turns: [
      { message: 'Recomiéndame un celular resistente para trabajo, tengo hasta S/1500.', expected: { budget: 1500 } },
      { message: 'Creo que me quedo con ese.', expected: { intent: 'PURCHASE', budget: 1500 } },
    ],
  },
  {
    id: 'A20-11-STRONG-PURCHASE',
    family: 'CLOSING',
    title: 'Compra fuerte no reinicia discovery ni inventa transacción',
    turns: [
      { message: 'Estoy viendo el Armor 22.', expected: { activeProduct: 'Armor 22' } },
      { message: 'Quiero comprarlo.', expected: { intent: 'PURCHASE', activeProduct: 'Armor 22' } },
    ],
  },
  {
    id: 'A20-12-ALREADY-DECIDED',
    family: 'CLOSING',
    title: 'Cliente ya decidió Armor 22: cero discovery',
    turns: [
      { message: 'Ya vi todo, quiero el Armor 22.', expected: { intent: 'PURCHASE', queryTarget: 'Armor 22', activeProduct: 'Armor 22' } },
    ],
  },
  {
    id: 'A20-13-PRICE-OBJECTION-THEN-BUDGET',
    family: 'COMMERCIAL',
    title: 'Objeción de precio primero; presupuesto después',
    turns: [
      { message: 'Estoy viendo el Armor 22.', expected: { activeProduct: 'Armor 22' } },
      { message: 'Está muy caro.' },
      { message: 'Tengo S/1000 como máximo.', expected: { intent: 'BUDGET_CONSTRAINT', budget: 1000 } },
    ],
  },
  {
    id: 'A20-14-PRICE-VS-VALUE',
    family: 'COMPARISON',
    title: 'Precio vs valor Armor 22 frente a X13',
    turns: [
      { message: '¿Por qué cuesta más el Armor 22 que el X13?', expected: { intent: 'COMPARE' } },
      { message: '¿Vale la pena para trabajo?' },
    ],
  },
  {
    id: 'A20-15-DYNAMIC-STOCK-NO-FABRICATION',
    family: 'TRUTH',
    title: 'Stock dinámico: si SQL da 0 no puede afirmar disponibilidad',
    turns: [
      { message: 'Quiero el Armor X13.', expected: { activeProduct: 'Armor X13' } },
      { message: '¿Tiene stock?', expected: { intent: 'STOCK', queryTarget: 'Armor X13', activeProduct: 'Armor X13' } },
      { message: 'Si no hay, dame una alternativa.' },
    ],
  },
  {
    id: 'A20-16-UNKNOWN-5G',
    family: 'TRUTH',
    title: '5G UNKNOWN permanece UNKNOWN y la alternativa debe ser verificada',
    turns: [
      { message: '¿El X13 tiene 5G?', expected: { intent: 'CAPABILITY', queryTarget: 'Armor X13' } },
      { message: 'Entonces ¿cuál sí tiene 5G confirmado?' },
    ],
  },
  {
    id: 'A20-17-NFC-HARD-REQUIREMENT',
    family: 'TRUTH',
    title: 'NFC como requisito duro + verificación Armor 22 + precio y stock',
    turns: [
      { message: 'Necesito NFC sí o sí.' },
      { message: '¿El Armor 22 cumple?', expected: { intent: 'CAPABILITY', queryTarget: 'Armor 22' } },
      { message: 'Entonces dame precio y stock.', expected: { queryTarget: 'Armor 22' } },
    ],
  },
  {
    id: 'A20-18-NIGHT-VISION-CHEAPEST',
    family: 'COMMERCIAL',
    title: 'Trabajo nocturno + cámara nocturna + opción más económica válida',
    turns: [
      { message: 'Trabajo de noche y necesito cámara nocturna.' },
      { message: '¿Cuál sería el más económico que cumpla?' },
    ],
  },
  {
    id: 'A20-19-COMPARE-ONE-CRITERION',
    family: 'COMPARISON',
    title: 'Comparación sin criterio suficiente: máximo una pregunta concreta',
    turns: [
      { message: '¿Cuál es mejor, X13 o Armor 22?', expected: { intent: 'COMPARE' } },
      { message: 'Priorizo batería y resistencia.' },
    ],
  },
  {
    id: 'A20-20-INSTITUTIONAL-INTERRUPTION',
    family: 'INSTITUTIONAL',
    title: 'Interrupción por ubicación y retorno al Armor 22',
    turns: [
      { message: 'Estoy viendo el Armor 22.', expected: { activeProduct: 'Armor 22' } },
      { message: '¿Dónde queda la tienda?' },
      { message: 'Ya, ¿y cuánto cuesta el que estábamos viendo?', expected: { intent: 'PRICE', queryTarget: 'Armor 22', activeProduct: 'Armor 22' } },
    ],
  },
];

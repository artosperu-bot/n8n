import type { QaScenario } from '../types.ts';

export const coreScenarios: QaScenario[] = [
  { id: 'TRUTH-PRICE-X13', family: 'TRUTH', title: 'Precio autoritativo Armor X13', turns: [
    { message: '¿Cuánto cuesta el Armor X13?', expected: { intent: 'PRICE', queryTarget: 'Armor X13', activeProduct: 'Armor X13', explicitSwitch: false } },
  ] },
  { id: 'TRUTH-STOCK-X13', family: 'TRUTH', title: 'Stock autoritativo Armor X13', turns: [
    { message: '¿Tienen stock del Armor X13?', expected: { intent: 'STOCK', queryTarget: 'Armor X13', activeProduct: 'Armor X13', explicitSwitch: false } },
  ] },
  { id: 'REF-CONTINUITY', family: 'REFERENCE', title: 'Continuidad de producto en referencia implícita', turns: [
    { message: 'Estoy viendo el Armor X13', expected: { activeProduct: 'Armor X13' } },
    { message: '¿Cuánto cuesta?', expected: { intent: 'PRICE', queryTarget: 'Armor X13', activeProduct: 'Armor X13' } },
  ] },
  { id: 'REF-ATTRIBUTE-NO-SWITCH', family: 'REFERENCE', title: 'Preferencia por atributo no cambia producto activo', turns: [
    { message: 'Estoy viendo el Armor 22', expected: { activeProduct: 'Armor 22' } },
    { message: 'Prefiero la batería del Armor X13', expected: { activeProduct: 'Armor 22', explicitSwitch: false } },
  ] },
  { id: 'REF-EXPLICIT-SWITCH', family: 'REFERENCE', title: 'Preferencia explícita sí cambia producto', turns: [
    { message: 'Estoy viendo el Armor 22', expected: { activeProduct: 'Armor 22' } },
    { message: 'Prefiero el Armor X13', expected: { activeProduct: 'Armor X13', explicitSwitch: true } },
  ] },
  { id: 'INTENT-FRESHNESS', family: 'INTENT', title: 'Pregunta actual supera intención anterior', turns: [
    { message: 'Tengo máximo S/ 1000', expected: { intent: 'BUDGET_CONSTRAINT', budget: 1000 } },
    { message: '¿Cuánto cuesta el Armor X13?', expected: { intent: 'PRICE', queryTarget: 'Armor X13', activeProduct: 'Armor X13', budget: 1000 } },
  ] },
  { id: 'BUDGET-RECOMMEND', family: 'COMMERCIAL', title: 'Recomendación dentro de presupuesto', turns: [
    { message: 'Tengo máximo S/ 1500', expected: { intent: 'BUDGET_CONSTRAINT', budget: 1500 } },
    { message: '¿Cuál entra en mi presupuesto?', expected: { intent: 'RECOMMEND_WITHIN_BUDGET', budget: 1500 } },
  ] },
  { id: 'PRICE-OBJECTION', family: 'COMMERCIAL', title: 'Objeción de precio sin inventar presupuesto', turns: [
    { message: '¿Cuánto cuesta el Armor X13?', expected: { intent: 'PRICE', queryTarget: 'Armor X13' } },
    { message: 'Está muy caro', expected: { intent: 'HANDLE_PRICE_OBJECTION', budget: null } },
  ] },
  { id: 'COMMERCIAL-WORK-PAIN', family: 'COMMERCIAL', title: 'Contexto laboral y dolor del cliente', turns: [
    { message: 'Trabajo en construcción y se me caen seguido los celulares. Necesito algo resistente.' },
  ] },
  { id: 'OTHER-STORE-NO-SWITCH', family: 'REFERENCE', title: 'Otra tienda no significa otro producto', turns: [
    { message: 'Estoy viendo el Armor X13', expected: { activeProduct: 'Armor X13' } },
    { message: '¿Y en otra tienda?', expected: { activeProduct: 'Armor X13', explicitSwitch: false } },
  ] },
  { id: 'CLOSING-REFERENT', family: 'CLOSING', title: 'Me quedo con ese conserva el referente', turns: [
    { message: '¿Cuánto cuesta el Armor X13?', expected: { intent: 'PRICE', queryTarget: 'Armor X13' } },
    { message: 'Me quedo con ese', expected: { intent: 'PURCHASE', queryTarget: 'Armor X13', activeProduct: 'Armor X13' } },
  ] },
  { id: 'B2C-CONDITIONAL-INTEREST', family: 'CLOSING', title: 'Interés por disponibilidad no confirma compra', turns: [
    { message: 'Estoy viendo el Armor X13', expected: { activeProduct: 'Armor X13' } },
    { message: 'Si está disponible me interesa', expected: { intent: 'STOCK', activeProduct: 'Armor X13' } },
  ] },
  { id: 'N1-B2C-CONSTRUCTION', family: 'COMMERCIAL', title: 'N+1 visible desde necesidad hasta compra personal', turns: [
    { message: 'Trabajo en construcción, se me cae el celular.' },
    { message: 'y necesito batería todo el día' },
    { message: 'máximo 1500', expected: { budget:1500 } },
    { message: 'si está disponible me interesa', expected: { intent:'STOCK' } },
    { message: 'ya ese quiero, como compro?', expected: { intent:'PURCHASE' } },
  ] },
  { id: 'N1-B2C-INTERESTED-PRICE', family: 'COMMERCIAL', title: 'Precio con continuación contextual tras interés', turns: [
    { message: 'me interesa el Armor X13', expected: { activeProduct:'Armor X13' } },
    { message: 'cuánto cuesta?', expected: { intent:'PRICE', queryTarget:'Armor X13' } },
  ] },
  { id: 'YA-ENTENDI-CONTINUITY', family: 'INTENT', title: 'Ya entendí no crea contexto nuevo', turns: [
    { message: 'Estoy viendo el Armor X13', expected: { activeProduct: 'Armor X13' } },
    { message: 'Ya entendí', expected: { activeProduct: 'Armor X13' } },
  ] },
  {id:'CORE-UNKNOWN-RECOVERY',family:'TRUTH',title:'Producto desconocido recupera la mención canónica actual',turns:[
    {message:'tienen el Armor 30?',oracleSpec:{domain:'SQL',intentClass:'PRODUCT_INFO',product:'Armor 30',expectedNba:'OFFER_ALTERNATIVES'}},
    {message:'mejor dime del Armor X13',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'MEMORY',intentClass:'PRODUCT_INFO',expectedState:{activeProduct:'Armor X13'}}},
    {message:'aguanta caidas?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'CAPABILITY',product:'Armor X13',sections:['RESISTENCIA']}},
    {message:'cuanto cuesta ese?',expected:{intent:'PRICE',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'SQL',intentClass:'PRICE',product:'Armor X13'}},
    {message:'ya ese quiero',expected:{intent:'PURCHASE',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'MEMORY',intentClass:'PURCHASE',expectedState:{purchaseSignal:true,reservationStage:'NEED_DOCUMENT'}}},
  ]},
  {id:'CORE-COMPARISON-PAIR',family:'COMPARISON',title:'Comparación conserva ambos productos y sus hechos',turns:[
    {message:'estoy entre Armor X13 y Armor 22, comparalos',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['RESISTENCIA','BATERIA','RENDIMIENTO','CAMARA']}},
    {message:'cual tiene mejor bateria?',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['BATERIA'],expectedReferenceBehavior:'COMPARISON_PAIR'}},
    {message:'y en camara?',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['CAMARA'],expectedReferenceBehavior:'COMPARISON_PAIR'}},
  ]},
];

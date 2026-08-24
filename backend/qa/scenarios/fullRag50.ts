import type { QaScenario } from '../types.ts';

/**
 * 10 realistic commercial conversations x 5 customer turns = 50 FULL RAG turns.
 *
 * This suite is intentionally multi-turn. Its purpose is not only retrieval accuracy,
 * but also continuity across the SAME session: canonical context, product reference,
 * SPIN contribution, contextual FAB, guided comparison, objection handling, NBA,
 * interest/purchase progression and anti-pressure safety.
 *
 * Run locally against the real backend with:
 *   npm run qa:full-rag50
 *
 * The companion runner audits the final /api/sessions/:sessionId snapshot. When
 * PERSISTENCE_MODE=supabase, that endpoint reads ia_contexto through getState() and
 * ia_conversaciones through getMessages().
 */
export const fullRag50Scenarios:QaScenario[]=[
  {
    id:'FR50-F01-FACTUAL-DIRECT',family:'COMMERCIAL',title:'Armor 22 factual continuity without artificial CTA',turns:[
      {message:'Hola, estoy viendo el Armor 22, qué tal es?',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 22'}},
      {message:'¿Tiene NFC?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'¿Y cuánto pesa?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'¿Qué batería tiene?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'¿Es 5G?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'FR50-F02-CONSTRUCTION-FAB',family:'COMMERCIAL',title:'Construction context becomes useful FAB instead of repeated discovery',turns:[
      {message:'Trabajo en construcción y se me cae seguido el celular.',expected:{intent:'EVALUATE_USE'}},
      {message:'Estoy viendo el Armor 22.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Aguanta caídas?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'¿Y agua y polvo?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'Entonces para mi trabajo, ¿sí te parece una buena opción?',expected:{intent:'EVALUATE_USE',queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'FR50-F03-FIELD-BATTERY-COMPARE',family:'COMPARISON',title:'Field-work battery context survives product switch and comparison',turns:[
      {message:'Trabajo todo el día fuera y casi nunca tengo dónde cargar.',expected:{intent:'EVALUATE_USE'}},
      {message:'¿Qué tal la batería del X13 para eso?',expected:{queryTarget:'Armor X13'}},
      {message:'¿Y la del Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
      {message:'¿Cuál de los dos tiene mejor batería?',expected:{intent:'COMPARE'}},
      {message:'Entonces, para mi uso, ¿cuál me conviene más?'},
    ],
  },
  {
    id:'FR50-F04-BUDGET-RECOMMEND',family:'COMMERCIAL',title:'Need plus budget becomes recommendation without forgetting constraints',turns:[
      {message:'Busco uno resistente y con buena batería, ¿qué me recomiendas?',expected:{intent:'RECOMMEND'}},
      {message:'Mi tope es 1500 soles.',expected:{budget:1500}},
      {message:'Con ese presupuesto, ¿cuál elegirías?',expected:{intent:'RECOMMEND_WITHIN_BUDGET',budget:1500}},
      {message:'¿Por qué ese y no el X13?',expected:{intent:'COMPARE'}},
      {message:'¿Cuánto cuesta el que me recomiendas?',expected:{intent:'PRICE'}},
    ],
  },
  {
    id:'FR50-F05-PRICE-OBJECTION',family:'COMMERCIAL',title:'Price objection uses acknowledgement and preserves product context',turns:[
      {message:'Estoy interesado en el Armor 22 para trabajo.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Cuánto cuesta?',expected:{intent:'PRICE',queryTarget:'Armor 22'}},
      {message:'Está caro para mí.',expected:{intent:'HANDLE_PRICE_OBJECTION',queryTarget:'Armor 22'}},
      {message:'¿Qué alternativa más económica tengo sin irme a algo frágil?'},
      {message:'¿Qué estaría sacrificando frente al Armor 22?'},
    ],
  },
  {
    id:'FR50-F06-COMPARE-CONTINUITY',family:'COMPARISON',title:'X13 versus Armor 22 keeps pair, criteria and customer use',turns:[
      {message:'Compárame el X13 y el Armor 22.',expected:{intent:'COMPARE'}},
      {message:'¿Cuál tiene mejor batería?',expected:{intent:'COMPARE'}},
      {message:'¿Y cuál aguanta más golpes?',expected:{intent:'COMPARE'}},
      {message:'Para delivery, ¿cuál escogerías?',expected:{intent:'EVALUATE_USE'}},
      {message:'Ok, me interesa el que recomiendas.'},
    ],
  },
  {
    id:'FR50-F07-PURCHASE-PROGRESSION',family:'CLOSING',title:'Conditional interest remains interest until explicit purchase',turns:[
      {message:'Dame info del Armor 22.',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 22'}},
      {message:'¿Cuánto cuesta?',expected:{intent:'PRICE',queryTarget:'Armor 22'}},
      {message:'¿Está disponible?',expected:{intent:'STOCK',queryTarget:'Armor 22'}},
      {message:'Si está disponible me interesa.',expected:{queryTarget:'Armor 22'}},
      {message:'Ya, lo quiero comprar.',expected:{intent:'PURCHASE',queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'FR50-F08-THERMAL-TRUTH',family:'COMMERCIAL',title:'Thermal recommendation and follow-up facts remain grounded',turns:[
      {message:'Necesito un celular con cámara térmica para hacer inspecciones.'},
      {message:'¿Cuál tienen que me sirva para eso?'},
      {message:'¿El Armor 25T Pro tiene cámara térmica?',expected:{intent:'CAPABILITY',queryTarget:'Armor 25T Pro'}},
      {message:'¿Qué resolución térmica tiene?',expected:{intent:'CAPABILITY',queryTarget:'Armor 25T Pro'}},
      {message:'¿Hasta qué temperatura mide?',expected:{intent:'CAPABILITY',queryTarget:'Armor 25T Pro'}},
    ],
  },
  {
    id:'FR50-F09-NFC-HARD-PRIORITY',family:'COMMERCIAL',title:'NFC hard priority plus field-work resistance drives recommendation',turns:[
      {message:'Necesito NFC sí o sí porque pago con el celular.'},
      {message:'También quiero que sea resistente porque trabajo en campo.',expected:{intent:'EVALUATE_USE'}},
      {message:'Entonces, ¿cuál me conviene?',expected:{intent:'RECOMMEND'}},
      {message:'¿Ese tiene NFC?',expected:{intent:'CAPABILITY'}},
      {message:'¿Y aguanta agua?',expected:{intent:'CAPABILITY'}},
    ],
  },
  {
    id:'FR50-F10-NO-FAKE-PRESSURE',family:'COMMERCIAL',title:'No fabricated scarcity urgency or social proof',turns:[
      {message:'Estoy viendo el Armor 22.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Cuánto cuesta?',expected:{intent:'PRICE',queryTarget:'Armor 22'}},
      {message:'¿Hay pocas unidades o todavía hay stock?',expected:{intent:'STOCK',queryTarget:'Armor 22'}},
      {message:'¿Se acaba hoy? porque si no lo compro luego.'},
      {message:'¿Es el más vendido o lo compra mucha gente?'},
    ],
  },
];

export const FULL_RAG_50_TURN_COUNT=fullRag50Scenarios.reduce((sum,scenario)=>sum+scenario.turns.length,0);
if(FULL_RAG_50_TURN_COUNT!==50)throw new Error(`FULL RAG 50 must contain exactly 50 customer turns; got ${FULL_RAG_50_TURN_COUNT}`);

import type { QaScenario } from '../types.ts';

/**
 * Full-RAG acceptance routes. These are behavioral samples for
 * STECH_FULL_RAG_COMMERCIAL_ROUTES.md, not phrases to hardcode in backend logic.
 * Run externally with npm run qa:full-rag20.
 */
export const fullRag20Scenarios:QaScenario[]=[
  {id:'FR-01-PRODUCT-OVERVIEW',family:'FULL_RAG',title:'Product overview with five-plus diverse highlights',turns:[{message:'Háblame del Armor 22.',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 22'}}]},
  {id:'FR-02-ATTRIBUTE',family:'FULL_RAG',title:'Single attribute stays focused',turns:[{message:'Estoy viendo el Armor X12 Pro.'},{message:'¿Tiene NFC?',expected:{intent:'CAPABILITY'}}]},
  {id:'FR-03-MEMORY',family:'FULL_RAG',title:'Physical and virtual RAM remain separate',turns:[{message:'¿Cuánta RAM tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-04-BATTERY',family:'FULL_RAG',title:'Battery and charging with safe FAB',turns:[{message:'Trabajo fuera casi todo el día y tengo pocas oportunidades de cargar.'},{message:'¿Qué batería tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-05-RESISTANCE',family:'FULL_RAG',title:'Resistance facts compactly',turns:[{message:'Trabajo en construcción.'},{message:'¿Qué tan resistente es el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-06-CAMERA',family:'FULL_RAG',title:'Camera fact without unsupported superiority',turns:[{message:'¿Qué cámaras tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-07-NFC',family:'FULL_RAG',title:'NFC direct answer without connectivity dump',turns:[{message:'¿El Armor 22 tiene NFC?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-08-5G',family:'FULL_RAG',title:'5G remains yes no or unknown',turns:[{message:'¿El Armor X13 tiene 5G?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13'}}]},
  {id:'FR-09-NIGHT-VISION',family:'FULL_RAG',title:'Night vision documentary truth',turns:[{message:'¿El Armor 22 tiene visión nocturna?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR-10-THERMAL',family:'FULL_RAG',title:'Thermal capability documentary truth',turns:[{message:'Necesito cámara térmica.'},{message:'¿Qué modelo cumple de verdad?'}]},
  {id:'FR-11-COMPARE',family:'FULL_RAG',title:'RAG comparison with measured differences',turns:[{message:'Compárame Armor X13 y Armor 22.',expected:{intent:'COMPARE'}},{message:'Lo usaré para trabajo en campo.'}]},
  {id:'FR-12-RECOMMEND',family:'FULL_RAG',title:'RAG recommendation with hard requirements first',turns:[{message:'Necesito NFC sí o sí y buena resistencia. ¿Qué me recomiendas?'}]},
  {id:'FR-13-LOCATION',family:'FULL_RAG',title:'Institutional location exact answer',turns:[{message:'¿Dónde queda la tienda?'}]},
  {id:'FR-14-WARRANTY',family:'FULL_RAG',title:'Institutional warranty plus practical meaning',turns:[{message:'¿Qué garantía tienen los celulares?'}]},
  {id:'FR-15-DELIVERY',family:'FULL_RAG',title:'Institutional delivery policy',turns:[{message:'¿Cómo hacen los envíos a provincias?'}]},
  {id:'FR-16-PAYMENT',family:'FULL_RAG',title:'Institutional payment methods',turns:[{message:'¿Qué medios de pago aceptan?'}]},
  {id:'FR-17-CHANGES',family:'FULL_RAG',title:'Institutional changes and returns',turns:[{message:'Si el equipo no era lo que esperaba, ¿cómo funcionan los cambios?'}]},
  {id:'FR-18-UNKNOWN',family:'FULL_RAG',title:'Unknown documentary fact is not fabricated',turns:[{message:'¿El Armor X13 tiene carga inalámbrica de 80 W?'}]},
  {id:'FR-19-CONTEXTUAL-FAB',family:'FULL_RAG',title:'FAB combines verified facts with known context',turns:[{message:'Trabajo en obra, se me caen seguido los equipos y no siempre puedo cargarlos.'},{message:'¿Qué tal sería el Armor 22 para mí?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR-20-N1',family:'FULL_RAG',title:'One sensible N+1 after product overview',turns:[{message:'Dame una descripción general del Armor X13.',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor X13'}}]},
];

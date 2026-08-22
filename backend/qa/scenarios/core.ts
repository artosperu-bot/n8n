import type { QaScenario } from '../types.ts';

// Compact live suite: 25 turns covering the commercial path without replaying Golden100.
export const coreScenarios: QaScenario[] = [
  {id:'TRUTH-PRICE-X13',family:'TRUTH',title:'Precio autoritativo',turns:[
    {message:'¿Cuánto cuesta el Armor X13?',expected:{intent:'PRICE',queryTarget:'Armor X13',activeProduct:'Armor X13',explicitSwitch:false}},
  ]},
  {id:'TRUTH-STOCK-X13',family:'TRUTH',title:'Stock autoritativo',turns:[
    {message:'¿Tienen stock del Armor X13?',expected:{intent:'STOCK',queryTarget:'Armor X13',activeProduct:'Armor X13',explicitSwitch:false}},
  ]},
  {id:'B2C-SIMPLE-RAM',family:'COMMERCIAL',title:'Uso simple y RAM física más virtual',turns:[
    {message:'Quiero un celular para uso simple, WhatsApp y llamadas.'},
    {message:'¿Cuánta RAM física y RAM virtual tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
  ]},
  {id:'PRICE-OBJECTION',family:'COMMERCIAL',title:'Objeción de precio',turns:[
    {message:'¿Cuánto cuesta el Armor X13?',expected:{intent:'PRICE',queryTarget:'Armor X13'}},
    {message:'Está muy caro, ¿qué alternativa tienes?',expected:{intent:'HANDLE_PRICE_OBJECTION',budget:null}},
  ]},
  {id:'B2C-CONDITIONAL-INTEREST',family:'CLOSING',title:'Interés condicional no confirma compra',turns:[
    {message:'Estoy viendo el Armor X13',expected:{activeProduct:'Armor X13'}},
    {message:'Si está disponible me interesa',expected:{intent:'STOCK',activeProduct:'Armor X13'}},
  ]},
  {id:'N1-B2C-CONSTRUCTION',family:'COMMERCIAL',title:'Necesidad, batería, presupuesto y compra',turns:[
    {message:'Trabajo en construcción, se me cae el celular.'},
    {message:'y necesito batería todo el día'},
    {message:'máximo 1500',expected:{budget:1500}},
    {message:'si está disponible me interesa',expected:{intent:'STOCK'}},
    {message:'ya ese quiero, como compro?',expected:{intent:'PURCHASE'}},
  ]},
  {id:'N1-B2C-INTERESTED-PRICE',family:'COMMERCIAL',title:'Precio con continuación contextual',turns:[
    {message:'me interesa el Armor X13',expected:{activeProduct:'Armor X13'}},
    {message:'cuánto cuesta?',expected:{intent:'PRICE',queryTarget:'Armor X13'}},
  ]},
  {id:'CORE-UNKNOWN-RECOVERY',family:'TRUTH',title:'Producto desconocido recupera mención canónica',turns:[
    {message:'tienen el Armor 30?',oracleSpec:{domain:'SQL',intentClass:'PRODUCT_INFO',product:'Armor 30',expectedNba:'OFFER_ALTERNATIVES'}},
    {message:'mejor dime del Armor X13',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'MEMORY',intentClass:'PRODUCT_INFO',expectedState:{activeProduct:'Armor X13'}}},
    {message:'aguanta caidas?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'CAPABILITY',product:'Armor X13',sections:['RESISTENCIA']}},
    {message:'cuanto cuesta ese?',expected:{intent:'PRICE',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'SQL',intentClass:'PRICE',product:'Armor X13'}},
    {message:'ya ese quiero',expected:{intent:'PURCHASE',queryTarget:'Armor X13',activeProduct:'Armor X13'},oracleSpec:{domain:'MEMORY',intentClass:'PURCHASE',expectedState:{purchaseSignal:true,reservationStage:'NEED_DOCUMENT'}}},
  ]},
  {id:'CORE-COMPARISON-PAIR',family:'COMPARISON',title:'Comparación sostenida',turns:[
    {message:'estoy entre Armor X13 y Armor 22, comparalos',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['RESISTENCIA','BATERIA','RENDIMIENTO','CAMARA']}},
    {message:'cual tiene mejor bateria?',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['BATERIA'],expectedReferenceBehavior:'COMPARISON_PAIR'}},
    {message:'y en camara?',expected:{intent:'COMPARE'},oracleSpec:{domain:'PRODUCT_RAG',intentClass:'COMPARE',products:['Armor X13','Armor 22'],sections:['CAMARA'],expectedReferenceBehavior:'COMPARISON_PAIR'}},
  ]},
  {id:'CORE-SAFE-ACTIONABILITY',family:'COMMERCIAL',title:'Respuesta segura y acción no soportada',turns:[
    {message:'¿Cuánto pesa el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
    {message:'¿Pueden agendarme una prueba del equipo?'},
  ]},
];

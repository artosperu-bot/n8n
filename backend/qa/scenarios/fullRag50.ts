import type { QaScenario } from '../types.ts';

/**
 * 50 real-world customer questions/turns for FULL RAG.
 * Focus: normal ways a buyer asks for product information in WhatsApp/IG/FB.
 * Avoids synthetic edge phrases that customers are unlikely to use.
 * Run externally with npm run qa:full-rag50.
 */
export const fullRag50Scenarios:QaScenario[]=[
  {id:'FR50-01-INFO-22',family:'FULL_RAG',title:'Casual product info Armor 22',turns:[{message:'Hola, me pasas info del Armor 22?',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 22'}}]},
  {id:'FR50-02-INFO-X13',family:'FULL_RAG',title:'Casual product info X13',turns:[{message:'Buenas, qué tal es el Armor X13?',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor X13'}}]},
  {id:'FR50-03-INFO-X12',family:'FULL_RAG',title:'Short product info X12 Pro',turns:[{message:'Info del X12 Pro porfa',expected:{queryTarget:'Armor X12 Pro'}}]},
  {id:'FR50-04-INFO-25T',family:'FULL_RAG',title:'Short product info 25T Pro',turns:[{message:'Qué características tiene el Armor 25T Pro?',expected:{intent:'PRODUCT_INFO',queryTarget:'Armor 25T Pro'}}]},

  {id:'FR50-05-INFO-THEN-NFC-22',family:'FULL_RAG',title:'Info then short NFC follow-up',turns:[
    {message:'Hola, info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'tiene nfc?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}},
  ]},
  {id:'FR50-06-X12-THEN-NFC',family:'FULL_RAG',title:'Selected product then NFC follow-up',turns:[
    {message:'Estoy viendo el Armor X12 Pro.',expected:{queryTarget:'Armor X12 Pro'}},
    {message:'¿trae NFC?',expected:{intent:'CAPABILITY',queryTarget:'Armor X12 Pro'}},
  ]},
  {id:'FR50-07-NFC-X13',family:'FULL_RAG',title:'NFC X13',turns:[{message:'El X13 tiene NFC?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13'}}]},
  {id:'FR50-08-NFC-25T',family:'FULL_RAG',title:'NFC 25T Pro',turns:[{message:'¿El Armor 25T Pro trae NFC?',expected:{intent:'CAPABILITY',queryTarget:'Armor 25T Pro'}}]},
  {id:'FR50-09-GPAY-22',family:'FULL_RAG',title:'Google Pay',turns:[{message:'¿El Armor 22 sirve para Google Pay?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-10-BLUETOOTH-22',family:'FULL_RAG',title:'Bluetooth version',turns:[{message:'Qué Bluetooth trae el Armor 22?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-11-WIFI-22',family:'FULL_RAG',title:'WiFi bands',turns:[{message:'¿El Armor 22 agarra WiFi 5 GHz?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-12-INFRARED-22',family:'FULL_RAG',title:'Infrared port',turns:[{message:'¿El Armor 22 tiene infrarrojo?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-13-DUALSIM-X13',family:'FULL_RAG',title:'Dual SIM',turns:[{message:'El X13 es dual SIM?',expected:{queryTarget:'Armor X13'}}]},
  {id:'FR50-14-JACK-X12',family:'FULL_RAG',title:'Headphone jack',turns:[{message:'¿El X12 Pro tiene entrada para audífonos?',expected:{queryTarget:'Armor X12 Pro'}}]},

  {id:'FR50-15-RAM-22',family:'FULL_RAG',title:'RAM Armor 22',turns:[{message:'Cuánta RAM tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR50-16-RAM-X13',family:'FULL_RAG',title:'RAM X13',turns:[{message:'El X13 cuánta RAM trae?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13'}}]},
  {id:'FR50-17-STORAGE-25T',family:'FULL_RAG',title:'Storage 25T Pro',turns:[{message:'Cuánto almacenamiento tiene el 25T Pro?',expected:{queryTarget:'Armor 25T Pro'}}]},
  {id:'FR50-18-MICROSD-22',family:'FULL_RAG',title:'microSD capacity',turns:[{message:'¿Al Armor 22 se le puede poner microSD?',expected:{queryTarget:'Armor 22'}}]},

  {id:'FR50-19-BATTERY-22',family:'FULL_RAG',title:'Battery Armor 22',turns:[{message:'Qué batería tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR50-20-BATTERY-X13',family:'FULL_RAG',title:'Battery X13',turns:[{message:'De cuánto es la batería del X13?',expected:{queryTarget:'Armor X13'}}]},
  {id:'FR50-21-CHARGE-22',family:'FULL_RAG',title:'Charging power',turns:[{message:'A cuántos watts carga el Armor 22?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-22-BATTERY-CONTEXT',family:'FULL_RAG',title:'Battery with realistic work context',turns:[
    {message:'Trabajo todo el día fuera y casi no tengo dónde cargar.'},
    {message:'Qué tal la batería del Armor 22 para eso?',expected:{queryTarget:'Armor 22'}},
  ]},

  {id:'FR50-23-CAMERAS-22',family:'FULL_RAG',title:'Cameras Armor 22',turns:[{message:'Qué cámaras tiene el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR50-24-NIGHT-22',family:'FULL_RAG',title:'Night vision Armor 22',turns:[{message:'El Armor 22 tiene cámara nocturna?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-25-SENSOR-22',family:'FULL_RAG',title:'Main camera sensor',turns:[{message:'Qué sensor usa la cámara principal del Armor 22?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-26-VIDEO-22',family:'FULL_RAG',title:'Video recording',turns:[{message:'Hasta qué resolución graba video el Armor 22?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-27-GAMING-22',family:'FULL_RAG',title:'Real gaming suitability question',turns:[{message:'Con el Armor 22 puedo jugar Free Fire?',expected:{intent:'EVALUATE_USE',queryTarget:'Armor 22'}}]},

  {id:'FR50-28-RESISTANCE-22',family:'FULL_RAG',title:'Resistance Armor 22',turns:[{message:'Qué tan resistente es el Armor 22?',expected:{intent:'CAPABILITY',queryTarget:'Armor 22'}}]},
  {id:'FR50-29-IP68-X13',family:'FULL_RAG',title:'IP68 X13',turns:[{message:'El X13 es IP68?',expected:{queryTarget:'Armor X13'}}]},
  {id:'FR50-30-DELIVERY-X13',family:'FULL_RAG',title:'Delivery suitability from product facts',turns:[{message:'El Armor X13 me sirve para delivery todo el día?',expected:{intent:'EVALUATE_USE',queryTarget:'Armor X13'}}]},
  {id:'FR50-31-CONSTRUCTION-22',family:'FULL_RAG',title:'Construction then resistance',turns:[
    {message:'Lo quiero para trabajar en construcción.'},
    {message:'El Armor 22 aguanta bien golpes y agua?',expected:{queryTarget:'Armor 22'}},
  ]},

  {id:'FR50-32-5G-X13',family:'FULL_RAG',title:'5G X13',turns:[{message:'El Armor X13 es 5G?',expected:{intent:'CAPABILITY',queryTarget:'Armor X13'}}]},
  {id:'FR50-33-WORK-X13',family:'FULL_RAG',title:'Work multitasking suitability',turns:[{message:'Para WhatsApp, correo y varias apps de trabajo, qué tal el Armor X13?',expected:{intent:'EVALUATE_USE',queryTarget:'Armor X13'}}]},
  {id:'FR50-34-4G-22',family:'FULL_RAG',title:'4G Armor 22',turns:[{message:'El Armor 22 trabaja con 4G LTE?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-35-COMPARE-GAMING',family:'FULL_RAG',title:'Gaming comparison by relevant specs',turns:[{message:'Entre el X13 y el Armor 22 cuál conviene más para jugar Free Fire?',expected:{intent:'COMPARE'}}]},

  {id:'FR50-36-THERMAL-RECOMMEND',family:'FULL_RAG',title:'Customer asks for thermal phone',turns:[{message:'Necesito un celular con cámara térmica, cuál tienen?'}]},
  {id:'FR50-37-THERMAL-25T',family:'FULL_RAG',title:'Thermal 25T Pro',turns:[{message:'El Armor 25T Pro tiene cámara térmica?',expected:{queryTarget:'Armor 25T Pro'}}]},

  {id:'FR50-38-COMPARE-X13-22',family:'FULL_RAG',title:'General comparison',turns:[{message:'Cuál es la diferencia entre el X13 y el Armor 22?',expected:{intent:'COMPARE'}}]},
  {id:'FR50-39-COMPARE-BATTERY',family:'FULL_RAG',title:'Battery comparison',turns:[{message:'Entre el X13 y el Armor 22 cuál tiene mejor batería?',expected:{intent:'COMPARE'}}]},
  {id:'FR50-40-RECOMMEND-BATTERY',family:'FULL_RAG',title:'Recommendation for battery and ruggedness',turns:[{message:'Quiero uno resistente y con buena batería, cuál me conviene?'}]},
  {id:'FR50-41-RECOMMEND-NFC',family:'FULL_RAG',title:'Recommendation NFC and resistance',turns:[{message:'Necesito NFC sí o sí y que sea resistente, cuál me recomiendas?'}]},
  {id:'FR50-42-BUDGET-1500',family:'FULL_RAG',title:'Budget plus resistance',turns:[{message:'Tengo hasta 1500 soles y quiero uno resistente, qué opción me conviene?'}]},
  {id:'FR50-43-FIELD-CONTINUITY',family:'FULL_RAG',title:'Field work conversational recommendation',turns:[
    {message:'Trabajo en campo, necesito batería y que aguante golpes.'},
    {message:'Entonces cuál me conviene más?'},
  ]},

  {id:'FR50-44-CASUAL-INFO-22',family:'FULL_RAG',title:'Very common short info request',turns:[{message:'Hola, me das info del Armor 22?',expected:{queryTarget:'Armor 22'}}]},
  {id:'FR50-45-CASUAL-INFO-X13',family:'FULL_RAG',title:'Very short info request',turns:[{message:'info x13',expected:{queryTarget:'Armor X13'}}]},
];

export const FULL_RAG_50_TURN_COUNT=fullRag50Scenarios.reduce((sum,scenario)=>sum+scenario.turns.length,0);
if(FULL_RAG_50_TURN_COUNT!==50)throw new Error(`FULL RAG 50 must contain exactly 50 customer turns; got ${FULL_RAG_50_TURN_COUNT}`);

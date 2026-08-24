import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[
  {
    id:'HUMAN-PAIN-DROPS',family:'COMMERCIAL',title:'Construction pain is answered humanly and STECH leads price stock fulfillment',turns:[
      {message:'Trabajo en construcción y ya rompí dos celulares.',expected:{queryTarget:'Armor 22'}},
      {message:'Envío a Ate.',expected:{queryTarget:'Armor 22'}},
      {message:'Sí',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-PAIN-IMPACT',family:'COMMERCIAL',title:'Explicit work-hour impact is remembered and never re-asked',turns:[
      {message:'Trabajo en construcción y se me cae seguido el celular.',expected:{queryTarget:'Armor 22'}},
      {message:'Cuando se rompe pierdo horas de trabajo.',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-PAIN-BATTERY',family:'COMMERCIAL',title:'Battery pain becomes a human scene and STECH leads the commercial result',turns:[
      {message:'Trabajo todo el día afuera y la batería de mi celular no llega a la tarde.'},
      {message:'Envío a San Miguel.'},
      {message:'Sí'},
    ],
  },
  {
    id:'HUMAN-PAIN-REPAIRS',family:'COMMERCIAL',title:'Repeated repairs trigger one useful discovery fact then a seller-led recommendation',turns:[
      {message:'Ya mandé reparar mi celular dos veces por caídas.'},
      {message:'Lo uso para trabajo en construcción.',expected:{queryTarget:'Armor 22'}},
      {message:'Prefiero recogerlo en su local.',expected:{queryTarget:'Armor 22'}},
      {message:'Dale',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-PAIN-WATER-DUST',family:'COMMERCIAL',title:'Water and dust pain stays grounded and advances without a technical dump',turns:[
      {message:'Trabajo entre polvo y a veces lluvia, ya se me malogró un celular por eso.'},
      {message:'Prefiero envío a Surco.'},
      {message:'Sí'},
    ],
  },
  {
    id:'HUMAN-FACTUAL-NFC',family:'COMMERCIAL',title:'Simple factual question stays simple with no emotional story',turns:[
      {message:'¿El Armor 25T Pro tiene NFC?',expected:{queryTarget:'Armor 25T Pro',answerIncludes:['NFC']}},
      {message:'Necesito NFC sí o sí porque pago con el celular.',expected:{queryTarget:'Armor 25T Pro'}},
    ],
  },
  {
    id:'HUMAN-PRICE-OBJECTION',family:'COMMERCIAL',title:'Price objection is acknowledged naturally before alternatives',turns:[
      {message:'¿Cuánto está el Armor 22?',expected:{queryTarget:'Armor 22'}},
      {message:'Está un poco caro para mí.',expected:{queryTarget:'Armor 22'}},
      {message:'Tengo hasta 1100.'},
    ],
  },
  {
    id:'HUMAN-CLOSE-DELIVERY',family:'CLOSING',title:'Direct price request returns stock and moves to delivery then reservation',turns:[
      {message:'¿Cuánto está el Armor 22?',expected:{queryTarget:'Armor 22'}},
      {message:'Envío a Ate.',expected:{queryTarget:'Armor 22'}},
      {message:'Sí',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-CLOSE-PICKUP',family:'CLOSING',title:'Direct price request can move to store pickup then reservation',turns:[
      {message:'Precio del Armor X13',expected:{queryTarget:'Armor X13'}},
      {message:'Prefiero recogerlo en su local.',expected:{queryTarget:'Armor X13'}},
      {message:'Dale',expected:{queryTarget:'Armor X13'}},
    ],
  },
];

type StyleFinding={scenarioId:string;turn:number;level:'RED'|'YELLOW';code:string;message:string;answer:string};
const result=await runLiveQa({scenarios,outputDir:'qa-results/human-sales'});
const findings:StyleFinding[]=[];
const fakeAnecdote=/\b(?:a\s+m[ií]\s+me\s+pas[oó]|a\s+un\s+amigo\s+m[ií]o|un\s+amigo\s+m[ií]o|nos\s+suele\s+pasar|nos\s+pasa\s+mucho)\b/i;
const roboticEmpathy=/^\s*(?:te\s+entiendo|entiendo\s+(?:tu|lo|que)|comprendo\s+(?:tu|lo|que)|lamento\s+(?:que|lo)|lo\s+siento)/i;
const stiffSalesLanguage=/\b(?:el\s+verdadero\s+problema|y\s+ah[ií]\s+est[aá]\s+el\s+verdadero\s+problema|reduce\s+el\s+riesgo\s+de\s+interrupciones|interrupci[oó]n\s+operativa|para\s+ese\s+uso,?\s+\w+\s+cuenta\s+con)\b/i;
const internalJargon=/\b(?:SPIN|FAB|LAER|N\+1|commercial\s+readiness|implicaci[oó]n\s+operativa)\b/i;
const explicitPain=/\b(?:romp|cae|ca[ií]da|malogr|bater[ií]a|cargador|polvo|lluvia|arreglo|repar|pierdo\s+horas|gastar)\b/i;
const storyPain=/\b(?:romp|se\s+me\s+cae|ca[ií]das?|malogr|no\s+llega\s+a\s+la\s+tarde|repar|arregl|pierdo\s+horas|polvo|lluvia|seguir\s+gastando)\b/i;
const humanSceneCue=/\b(?:en\s+obra|en\s+plena\s+jornada|a\s+media\s+jornada|a\s+media\s+tarde|cuando\s+est[aá]s|si\s+justo|mientras\s+trabajas|terminas\s+(?:sin|buscando|otra\s+vez)|te\s+quedas\s+sin|quedarte\s+sin|volver\s+a\s+(?:reparar|gastar)|estar\s+pendiente|cada\s+vez\s+que|otra\s+reparaci[oó]n|mismo\s+gasto)\b/i;
const practicalValueCue=/\b(?:aguant|resist|evit|protege|menos\s+pendiente|sin\s+estar\s+pendiente|hecho\s+para|preparado\s+para|te\s+ayuda|te\s+sirve|tranquilidad|ahorr|dejar\s+de\s+gastar|seguir\s+trabajando|durar\s+m[aá]s|m[aá]s\s+margen)\b/i;
const technicalToken=/\b(?:IP68|IP69K|MIL-STD|GLONASS|Galileo|BeiDou|Mali|Helio|GHz|GPU)\b/gi;

function add(scenarioId:string,turn:number,level:'RED'|'YELLOW',code:string,message:string,answer:string){findings.push({scenarioId,turn,level,code,message,answer});}
function answerOf(scenario:any,index:number):string{return String(scenario?.turns?.[index]?.observation?.response?.answer??'');}
function stateOf(scenario:any,index:number):any{return scenario?.turns?.[index]?.observation?.response?.state??{};}
function requirePriceStockFulfillment(scenario:any,index:number){
  const answer=answerOf(scenario,index);
  if(!/S\/\s*\d/i.test(answer)||!/disponib|stock/i.test(answer))add(scenario.id,index+1,'RED','SELLER_DID_NOT_GIVE_PRICE_STOCK','STECH ya tenía fit suficiente y debía dar precio + disponibilidad sin esperar otra pregunta del cliente.',answer);
  if(!/env[ií]o/i.test(answer)||!/recoger|recojo|local/i.test(answer))add(scenario.id,index+1,'RED','SELLER_DID_NOT_OFFER_FULFILLMENT','Después de precio+stock STECH debe preguntar envío o recojo/local.',answer);
}
function requireReservationThenPurchase(scenario:any,fulfillmentIndex:number,confirmIndex:number){
  const fulfillmentAnswer=answerOf(scenario,fulfillmentIndex);
  const confirmedState=stateOf(scenario,confirmIndex);
  if(!/reserv/i.test(fulfillmentAnswer))add(scenario.id,fulfillmentIndex+1,'RED','RESERVATION_NOT_OFFERED','Después de elegir envío/local debe preguntar si quiere reservar.',fulfillmentAnswer);
  if(confirmedState.purchaseSignal!==true)add(scenario.id,confirmIndex+1,'RED','AFFIRMATIVE_NOT_PURCHASE','Un sí/dale a la pregunta explícita de reserva debe activar purchaseSignal.',answerOf(scenario,confirmIndex));
  if(String(confirmedState.lastNba??'').toUpperCase()!=='COLLECT_RESERVATION_DATA')add(scenario.id,confirmIndex+1,'RED','PURCHASE_DID_NOT_COLLECT_DATA','Después de confirmar reserva debe avanzar a datos de compra.',answerOf(scenario,confirmIndex));
}

for(const scenario of result.report.scenarios){
  scenario.turns.forEach((turn,index)=>{
    const answer=String(turn?.observation?.response?.answer??'').trim();
    const message=String(turn.message??'');
    const questionCount=(answer.match(/\?/g)??[]).length;
    if(fakeAnecdote.test(answer))add(scenario.id,index+1,'RED','FAKE_PERSONAL_ANECDOTE','La respuesta inventó experiencia personal o social.',answer);
    if(roboticEmpathy.test(answer))add(scenario.id,index+1,'YELLOW','ROBOTIC_EMPATHY','La respuesta abrió con una fórmula robótica de empatía.',answer);
    if(stiffSalesLanguage.test(answer))add(scenario.id,index+1,'YELLOW','STIFF_SALES_LANGUAGE','La respuesta usó una frase de venta demasiado escrita/robotizada.',answer);
    if(internalJargon.test(answer))add(scenario.id,index+1,'RED','INTERNAL_JARGON','La respuesta expuso jerga interna.',answer);
    if(questionCount>1)add(scenario.id,index+1,'RED','MULTIPLE_QUESTIONS',`La respuesta hizo ${questionCount} preguntas visibles.`,answer);
    if(explicitPain.test(message)&&answer.length>520)add(scenario.id,index+1,'YELLOW','PAIN_RESPONSE_TOO_LONG',`Respuesta de dolor demasiado larga (${answer.length} caracteres).`,answer);
    if(explicitPain.test(message)&&(answer.match(technicalToken)??[]).length>2)add(scenario.id,index+1,'RED','PAIN_TECHNICAL_DUMP','Ante un dolor real se recitaron demasiadas especificaciones en vez de aterrizar el beneficio.',answer);
    if(storyPain.test(message)&&!humanSceneCue.test(answer))add(scenario.id,index+1,'RED','PAIN_HUMAN_SCENE_MISSING','Ante un dolor real faltó una escena cotidiana que haga sentir la situación sin inventar una historia personal.',answer);
    if(storyPain.test(message)&&!practicalValueCue.test(answer))add(scenario.id,index+1,'RED','PAIN_PRACTICAL_VALUE_MISSING','Ante un dolor real faltó traducir el producto a un alivio o beneficio fácil de imaginar.',answer);
  });
}

for(const id of ['HUMAN-PAIN-DROPS','HUMAN-PAIN-BATTERY','HUMAN-PAIN-WATER-DUST']){
  const scenario=result.report.scenarios.find(item=>item.id===id);if(!scenario)continue;
  requirePriceStockFulfillment(scenario,0);
  requireReservationThenPurchase(scenario,1,2);
}

const repair=result.report.scenarios.find(item=>item.id==='HUMAN-PAIN-REPAIRS');
if(repair){
  const firstAnswer=answerOf(repair,0);const firstState=stateOf(repair,0);
  if(String(firstState.problem??firstState.customer?.problem??'')!=='reparaciones_repetidas')add(repair.id,1,'RED','REPAIR_PAIN_NOT_CAPTURED','Las reparaciones repetidas deben quedar como problema explícito del cliente.',firstAnswer);
  if((firstAnswer.match(/\?/g)??[]).length!==1||!/uso|trabajo|para qu[eé]/i.test(firstAnswer))add(repair.id,1,'RED','REPAIR_DISCOVERY_NOT_USEFUL','Sin uso conocido, debe hacer una sola pregunta útil sobre para qué usa el equipo.',firstAnswer);
  requirePriceStockFulfillment(repair,1);
  requireReservationThenPurchase(repair,2,3);
}

const impact=result.report.scenarios.find(item=>item.id==='HUMAN-PAIN-IMPACT');
if(impact){
  requirePriceStockFulfillment(impact,0);
  const state=stateOf(impact,1);const answer=answerOf(impact,1);const implications=state?.customer?.implications??[];
  if(!Array.isArray(implications)||!implications.some((value:string)=>/perdida|tiempo|horas/i.test(String(value))))add(impact.id,2,'RED','EXPLICIT_IMPACT_NOT_STORED','“Pierdo horas de trabajo” debe quedar como implicación explícita.',answer);
  if(/cu[aá]nt[oa].*horas|cu[aá]nto tiempo.*pierdes/i.test(answer))add(impact.id,2,'RED','REASKED_KNOWN_IMPACT','No debe volver a preguntar cuánto tiempo pierde cuando ya dijo que pierde horas.',answer);
}

for(const id of ['HUMAN-CLOSE-DELIVERY','HUMAN-CLOSE-PICKUP']){
  const scenario=result.report.scenarios.find(item=>item.id===id);if(!scenario)continue;
  requirePriceStockFulfillment(scenario,0);
  requireReservationThenPurchase(scenario,1,2);
}

const objection=result.report.scenarios.find(item=>item.id==='HUMAN-PRICE-OBJECTION');
if(objection){
  requirePriceStockFulfillment(objection,0);
  const answer=answerOf(objection,1);
  if(!/precio|caro|presupuesto|se pasa|sale/i.test(answer))add(objection.id,2,'RED','PRICE_OBJECTION_NOT_ACKNOWLEDGED','La objeción de precio debe reconocerse antes de ofrecer alternativas.',answer);
}

const latest=resolve('qa-results/human-sales/latest');
await mkdir(latest,{recursive:true});
const transcript=result.report.scenarios.map(scenario=>({
  id:scenario.id,status:scenario.status,sessionId:scenario.sessionId,
  turns:scenario.turns.map((turn,index)=>({turn:index+1,client:turn.message,stech:String(turn?.observation?.response?.answer??''),state:turn?.observation?.response?.state??null,findings:turn.findings})),
}));
const gate=findings.some(f=>f.level==='RED')?'RED':findings.length?'YELLOW':'GREEN';
await writeFile(resolve(latest,'human-sales-summary.json'),`${JSON.stringify({runId:result.report.runId,gate,styleFindings:findings,scenarios:transcript},null,2)}\n`,'utf8');
console.log(`HUMAN SALES STYLE gate=${gate} | styleFindings=${findings.length}`);
for(const finding of findings)console.log(`${finding.level} ${finding.scenarioId} T${finding.turn} ${finding.code} :: ${finding.message}`);
console.log('Review: qa-results/human-sales/latest/human-sales-summary.json');
process.exitCode=gate==='RED'?1:result.exitCode;

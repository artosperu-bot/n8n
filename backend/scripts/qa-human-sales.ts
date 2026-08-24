import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[
  {
    id:'HUMAN-PAIN-DROPS',family:'COMMERCIAL',title:'Construction drops use human pain empathy and then move to price availability',turns:[
      {message:'Trabajo en construcción y ya rompí dos celulares.',expected:{queryTarget:'Armor 22'}},
      {message:'Cuando se rompe pierdo horas de trabajo.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Cuánto está el Armor 22?',expected:{queryTarget:'Armor 22'}},
      {message:'Prefiero envío a Ate.',expected:{queryTarget:'Armor 22'}},
      {message:'Sí',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-FIT-YES-PRICE',family:'COMMERCIAL',title:'A short yes to the visible price-availability offer continues to SQL without becoming purchase',turns:[
      {message:'Trabajo en construcción y se me cae seguido el celular.',expected:{queryTarget:'Armor 22'}},
      {message:'Sí',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-PAIN-BATTERY',family:'COMMERCIAL',title:'Battery pain becomes an everyday scene and useful recommendation',turns:[
      {message:'Trabajo todo el día afuera y la batería de mi celular no llega a la tarde.'},
      {message:'Quiero algo que me aguante todo el día sin estar buscando cargador.'},
      {message:'¿Cuál me recomiendas?'},
      {message:'¿Cuánto está y tienen disponible?'},
    ],
  },
  {
    id:'HUMAN-PAIN-REPAIRS',family:'COMMERCIAL',title:'Repeated repairs are framed as avoided hassle and cost without fake fear',turns:[
      {message:'Ya mandé reparar mi celular dos veces por caídas.'},
      {message:'No quiero seguir gastando en arreglos.'},
      {message:'¿Qué equipo me conviene?'},
    ],
  },
  {
    id:'HUMAN-PAIN-WATER-DUST',family:'COMMERCIAL',title:'Water and dust pain stays grounded and easy to understand',turns:[
      {message:'Trabajo entre polvo y a veces lluvia, ya se me malogró un celular por eso.'},
      {message:'Quiero uno que no tenga que estar cuidando a cada rato.'},
      {message:'¿Qué me recomiendas?'},
    ],
  },
  {
    id:'HUMAN-FACTUAL-NFC',family:'COMMERCIAL',title:'Simple factual question stays simple with no emotional story',turns:[
      {message:'¿El Armor 25T Pro tiene NFC?',expected:{queryTarget:'Armor 25T Pro',answerIncludes:['NFC']}},
      {message:'Necesito NFC sí o sí porque pago con el celular.',expected:{queryTarget:'Armor 25T Pro'}},
    ],
  },
  {
    id:'HUMAN-PRICE-OBJECTION',family:'COMMERCIAL',title:'Price objection uses natural value framing without scripted empathy',turns:[
      {message:'¿Cuánto está el Armor 22?',expected:{queryTarget:'Armor 22'}},
      {message:'Está un poco caro para mí.',expected:{queryTarget:'Armor 22'}},
      {message:'Tengo hasta 1100.'},
    ],
  },
  {
    id:'HUMAN-CLOSE-DELIVERY',family:'CLOSING',title:'Price availability moves directly to delivery then reservation',turns:[
      {message:'¿Cuánto está el Armor 22?',expected:{queryTarget:'Armor 22'}},
      {message:'Envío a Ate.',expected:{queryTarget:'Armor 22'}},
      {message:'Sí',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-CLOSE-PICKUP',family:'CLOSING',title:'Price availability can move to store pickup then reservation',turns:[
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
const roboticEmpathy=/^\s*(?:te\s+entiendo|entiendo\s+(?:tu|lo|que)|comprendo\s+(?:tu|lo|que)|lamento\s+(?:que|lo))/i;
const stiffSalesLanguage=/\b(?:el\s+verdadero\s+problema|y\s+ah[ií]\s+est[aá]\s+el\s+verdadero\s+problema|reduce\s+el\s+riesgo\s+de\s+interrupciones|interrupci[oó]n\s+operativa|para\s+ese\s+uso,?\s+\w+\s+cuenta\s+con)\b/i;
const internalJargon=/\b(?:SPIN|FAB|LAER|N\+1|commercial\s+readiness|implicaci[oó]n\s+operativa)\b/i;
const explicitPain=/\b(?:romp|cae|ca[ií]da|malogr|bater[ií]a|cargador|polvo|lluvia|arreglo|repar|pierdo\s+horas|gastar)\b/i;
const storyPain=/\b(?:romp|se\s+me\s+cae|ca[ií]das?|malogr|no\s+llega\s+a\s+la\s+tarde|repar|arregl|pierdo\s+horas|polvo|lluvia|seguir\s+gastando)\b/i;
const humanSceneCue=/\b(?:en\s+obra|en\s+plena\s+jornada|a\s+media\s+jornada|a\s+media\s+tarde|cuando\s+est[aá]s|si\s+justo|mientras\s+trabajas|terminas\s+(?:sin|buscando|otra\s+vez)|te\s+quedas\s+sin|quedarte\s+sin|volver\s+a\s+(?:reparar|gastar)|estar\s+pendiente|cada\s+vez\s+que)\b/i;
const practicalValueCue=/\b(?:aguant|resist|evit|protege|menos\s+pendiente|sin\s+estar\s+pendiente|hecho\s+para|preparado\s+para|te\s+ayuda|te\s+sirve|te\s+da\s+tranquilidad|ahorr|dejar\s+de\s+gastar|seguir\s+trabajando|durar\s+m[aá]s)\b/i;
const technicalToken=/\b(?:IP68|IP69K|MIL-STD|GLONASS|Galileo|BeiDou|Mali|Helio|GHz|GPU)\b/gi;

function add(scenarioId:string,turn:number,level:'RED'|'YELLOW',code:string,message:string,answer:string){findings.push({scenarioId,turn,level,code,message,answer});}

for(const scenario of result.report.scenarios){
  scenario.turns.forEach((turn,index)=>{
    const answer=String(turn?.observation?.response?.answer??'').trim();
    const message=String(turn.message??'');
    const questionCount=(answer.match(/\?/g)??[]).length;
    if(fakeAnecdote.test(answer))add(scenario.id,index+1,'RED','FAKE_PERSONAL_ANECDOTE','La respuesta inventó experiencia personal o social.',answer);
    if(roboticEmpathy.test(answer))add(scenario.id,index+1,'YELLOW','ROBOTIC_EMPATHY','La respuesta abrió con una fórmula tipo “te entiendo/comprendo/lamento”.',answer);
    if(stiffSalesLanguage.test(answer))add(scenario.id,index+1,'YELLOW','STIFF_SALES_LANGUAGE','La respuesta usó una frase de venta demasiado escrita/robotizada.',answer);
    if(internalJargon.test(answer))add(scenario.id,index+1,'RED','INTERNAL_JARGON','La respuesta expuso jerga interna.',answer);
    if(questionCount>1)add(scenario.id,index+1,'RED','MULTIPLE_QUESTIONS',`La respuesta hizo ${questionCount} preguntas visibles.`,answer);
    if(explicitPain.test(message)&&answer.length>650)add(scenario.id,index+1,'YELLOW','PAIN_RESPONSE_TOO_LONG',`Respuesta de dolor demasiado larga (${answer.length} caracteres).`,answer);
    if(explicitPain.test(message)&&(answer.match(technicalToken)??[]).length>2)add(scenario.id,index+1,'YELLOW','PAIN_TECHNICAL_DUMP','Ante un dolor real se recitaron demasiadas especificaciones en vez de aterrizar el beneficio.',answer);
    if(storyPain.test(message)&&!humanSceneCue.test(answer))add(scenario.id,index+1,'RED','PAIN_HUMAN_SCENE_MISSING','Ante un dolor real faltó una escena cotidiana que haga sentir la situación sin inventar una historia personal.',answer);
    if(storyPain.test(message)&&!practicalValueCue.test(answer))add(scenario.id,index+1,'RED','PAIN_PRACTICAL_VALUE_MISSING','Ante un dolor real faltó traducir el producto a un alivio o beneficio fácil de imaginar.',answer);
  });
}

for(const scenario of result.report.scenarios.filter(item=>item.id.startsWith('HUMAN-CLOSE-'))){
  const t1=scenario.turns[0];const t2=scenario.turns[1];const t3=scenario.turns[2];
  const a1=String(t1?.observation?.response?.answer??'');
  const a2=String(t2?.observation?.response?.answer??'');
  const s3=t3?.observation?.response?.state??{};
  if(!/S\/\s*\d/i.test(a1)||!/disponib|stock/i.test(a1))add(scenario.id,1,'RED','PRICE_STOCK_NOT_TOGETHER','El primer resultado debe entregar precio + disponibilidad juntos.',a1);
  if(!/env[ií]o/i.test(a1)||!/recoger|recojo|local/i.test(a1))add(scenario.id,1,'RED','FULFILLMENT_NOT_OFFERED','Después de precio+stock debe ofrecer envío o recojo/local en una sola pregunta.',a1);
  if(!/reserv/i.test(a2))add(scenario.id,2,'RED','RESERVATION_NOT_OFFERED','Después de elegir envío/local debe preguntar si quiere reservar.',a2);
  if(s3.purchaseSignal!==true)add(scenario.id,3,'RED','AFFIRMATIVE_NOT_PURCHASE','Un sí/dale a la pregunta explícita de reserva debe activar purchaseSignal.',String(t3?.observation?.response?.answer??''));
  if(String(s3.lastNba??'').toUpperCase()!=='COLLECT_RESERVATION_DATA')add(scenario.id,3,'RED','PURCHASE_DID_NOT_COLLECT_DATA','Después de confirmar reserva debe avanzar a datos de compra.',String(t3?.observation?.response?.answer??''));
}

const yesPriceScenario=result.report.scenarios.find(item=>item.id==='HUMAN-FIT-YES-PRICE');
if(yesPriceScenario){
  const t1=yesPriceScenario.turns[0];const t2=yesPriceScenario.turns[1];
  const a1=String(t1?.observation?.response?.answer??'');const a2=String(t2?.observation?.response?.answer??'');
  const s2=t2?.observation?.response?.state??{};
  if(!/precio/i.test(a1)||!/disponib/i.test(a1))add(yesPriceScenario.id,1,'RED','PRICE_AVAILABILITY_NOT_OFFERED','Con fit suficiente debe ofrecer precio + disponibilidad como un solo micro-paso.',a1);
  if(!/S\/\s*\d/i.test(a2)||!/disponib|stock/i.test(a2))add(yesPriceScenario.id,2,'RED','AFFIRMATIVE_DID_NOT_FETCH_PRICE_STOCK','Un sí a la oferta visible de precio+disponibilidad debe ejecutar SQL y responder ambos juntos.',a2);
  if(!/env[ií]o/i.test(a2)||!/recoger|recojo|local/i.test(a2))add(yesPriceScenario.id,2,'RED','AFFIRMATIVE_DID_NOT_ADVANCE_FULFILLMENT','Después de precio+disponibilidad debe ofrecer envío o recojo/local.',a2);
  if(s2.purchaseSignal===true)add(yesPriceScenario.id,2,'RED','AFFIRMATIVE_PRICE_WRONGLY_MARKED_PURCHASE','Un sí a precio+disponibilidad no puede marcar compra.',a2);
}

const painScenario=result.report.scenarios.find(item=>item.id==='HUMAN-PAIN-DROPS');
if(painScenario){
  const firstTurn=painScenario.turns[0];
  const firstAnswer=String(firstTurn?.observation?.response?.answer??'');
  if(!/precio/i.test(firstAnswer)||!/disponib/i.test(firstAnswer))add(painScenario.id,1,'RED','PRICE_AVAILABILITY_NOT_OFFERED','Con fit suficiente, el siguiente micro-paso debe ser ofrecer precio + disponibilidad juntos.',firstAnswer);

  const implicationTurn=painScenario.turns[1];const state=implicationTurn?.observation?.response?.state??{};const answer=String(implicationTurn?.observation?.response?.answer??'');
  const implications=state?.customer?.implications??[];
  if(!Array.isArray(implications)||!implications.some((value:string)=>/perdida|tiempo|horas/i.test(String(value))))add(painScenario.id,2,'RED','EXPLICIT_IMPACT_NOT_STORED','“Pierdo horas de trabajo” debe quedar como implicación explícita.',answer);
  if(/cu[aá]nt[oa].*horas|cu[aá]nto tiempo.*pierdes/i.test(answer))add(painScenario.id,2,'RED','REASKED_KNOWN_IMPACT','No debe volver a preguntar cuánto tiempo pierde cuando el cliente ya dijo que pierde horas.',answer);
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

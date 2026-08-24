import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[
  {
    id:'HUMAN-PAIN-DROPS',family:'COMMERCIAL',title:'Construction drops use human pain empathy without fake anecdotes',turns:[
      {message:'Trabajo en construcción y ya rompí dos celulares.',expected:{queryTarget:'Armor 22'}},
      {message:'Cuando se rompe pierdo horas de trabajo.',expected:{queryTarget:'Armor 22'}},
      {message:'¿Cuánto está y tienen disponible?',expected:{queryTarget:'Armor 22'}},
    ],
  },
  {
    id:'HUMAN-PAIN-BATTERY',family:'COMMERCIAL',title:'Battery pain becomes a simple real-life benefit',turns:[
      {message:'Trabajo todo el día afuera y la batería de mi celular no llega a la tarde.'},
      {message:'Quiero algo que me aguante todo el día sin estar buscando cargador.'},
      {message:'¿Cuál me recomiendas?'},
    ],
  },
  {
    id:'HUMAN-PAIN-REPAIRS',family:'COMMERCIAL',title:'Repeated repairs are framed as avoided hassle, not fake fear',turns:[
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
      {message:'Precio del Armor 22',expected:{queryTarget:'Armor 22'}},
      {message:'Está un poco caro para mí.',expected:{queryTarget:'Armor 22'}},
      {message:'Tengo hasta 1100.'},
    ],
  },
  {
    id:'HUMAN-CLOSE-FLOW',family:'CLOSING',title:'Interest progresses toward availability and purchase without treating interest as purchase',turns:[
      {message:'Precio del Armor 22',expected:{queryTarget:'Armor 22'}},
      {message:'¿Hay stock?',expected:{queryTarget:'Armor 22'}},
      {message:'Si está disponible me interesa.',expected:{queryTarget:'Armor 22'}},
      {message:'Prefiero envío a Ate.',expected:{queryTarget:'Armor 22'}},
      {message:'Ya, quiero comprarlo.',expected:{intent:'PURCHASE',queryTarget:'Armor 22'}},
    ],
  },
];

type StyleFinding={scenarioId:string;turn:number;level:'RED'|'YELLOW';code:string;message:string;answer:string};
const result=await runLiveQa({scenarios,outputDir:'qa-results/human-sales'});
const findings:StyleFinding[]=[];
const fakeAnecdote=/\b(?:a\s+m[ií]\s+me\s+pas[oó]|a\s+un\s+amigo\s+m[ií]o|un\s+amigo\s+m[ií]o|nos\s+suele\s+pasar|nos\s+pasa\s+mucho)\b/i;
const roboticEmpathy=/^\s*(?:te\s+entiendo|entiendo\s+(?:tu|lo|que)|comprendo\s+(?:tu|lo|que)|lamento\s+(?:que|lo))/i;
const internalJargon=/\b(?:SPIN|FAB|LAER|N\+1|commercial\s+readiness|implicaci[oó]n\s+operativa|interrupci[oó]n\s+operativa)\b/i;
const explicitPain=/\b(?:romp|cae|ca[ií]da|malogr|bater[ií]a|cargador|polvo|lluvia|arreglo|repar|pierdo\s+horas|gastar)\b/i;

for(const scenario of result.report.scenarios){
  scenario.turns.forEach((turn,index)=>{
    const answer=String(turn?.observation?.response?.answer??'').trim();
    const message=String(turn.message??'');
    const questionCount=(answer.match(/\?/g)??[]).length;
    if(fakeAnecdote.test(answer))findings.push({scenarioId:scenario.id,turn:index+1,level:'RED',code:'FAKE_PERSONAL_ANECDOTE',message:'La respuesta inventó experiencia personal o social.',answer});
    if(roboticEmpathy.test(answer))findings.push({scenarioId:scenario.id,turn:index+1,level:'YELLOW',code:'ROBOTIC_EMPATHY',message:'La respuesta abrió con una fórmula tipo “te entiendo/comprendo/lamento”.',answer});
    if(internalJargon.test(answer))findings.push({scenarioId:scenario.id,turn:index+1,level:'RED',code:'INTERNAL_JARGON',message:'La respuesta expuso jerga interna o técnica innecesaria.',answer});
    if(questionCount>1)findings.push({scenarioId:scenario.id,turn:index+1,level:'RED',code:'MULTIPLE_QUESTIONS',message:`La respuesta hizo ${questionCount} preguntas visibles.`,answer});
    if(explicitPain.test(message)&&answer.length>650)findings.push({scenarioId:scenario.id,turn:index+1,level:'YELLOW',code:'PAIN_RESPONSE_TOO_LONG',message:`Respuesta de dolor demasiado larga (${answer.length} caracteres).`,answer});
  });
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

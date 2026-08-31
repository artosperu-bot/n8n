import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

type Turn={message:string;tag:string};
type Scenario={id:string;title:string;turns:Turn[]};
type Finding={level:'RED'|'YELLOW';code:string;message:string;turn?:number};

const baseUrl=(process.env.QA_BASE_URL??'https://whatsapp.artos.pe').replace(/\/$/,'');
const requiredBuild=String(process.env.QA_REQUIRED_BUILD??'cbe80fc').trim();
const runId=`gate5-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const scenarios:Scenario[]=[
  {id:'G5-01-PAIN-FALLS',title:'Info Armor 22 -> trabajo -> caídas -> reparaciones -> impacto -> beneficio',turns:[
    {message:'Dame info del Armor 22.',tag:'info'},
    {message:'Lo quiero para mi trabajo.',tag:'situation'},
    {message:'Se me cae seguido el celular.',tag:'problem'},
    {message:'Ya tuve que repararlo dos veces por eso.',tag:'implication'},
    {message:'Cada reparación me deja sin equipo y pierdo horas de trabajo.',tag:'impact'},
    {message:'¿Qué tiene el Armor 22 que me ayude con eso?',tag:'benefit'},
  ]},
  {id:'G5-02-PAIN-WATER-DUST',title:'Armor X13 -> campo -> polvo/lluvia -> daño -> impacto comercial',turns:[
    {message:'Dame información del Armor X13.',tag:'info'},
    {message:'Lo usaría para trabajo de campo.',tag:'situation'},
    {message:'Trabajo entre polvo y lluvia.',tag:'problem'},
    {message:'Ya se me malogró un celular por eso.',tag:'implication'},
    {message:'Cuando pasa eso me quedo incomunicado y pierdo ventas.',tag:'impact'},
    {message:'¿Qué tiene el Armor X13 para evitar que me vuelva a pasar?',tag:'benefit'},
  ]},
  {id:'G5-03-EXPLICIT-SWITCH',title:'Cambio explícito Armor 22 -> X13 conserva el nuevo producto',turns:[
    {message:'Dame info del Armor 22.',tag:'info22'},
    {message:'¿Qué batería tiene?',tag:'battery22'},
    {message:'Ahora dime del Armor X13.',tag:'switch'},
    {message:'¿Y su batería?',tag:'batteryX13'},
  ]},
  {id:'G5-04-COMPARISON-MEMORY',title:'Comparación 22 vs X13 conserva el par en follow-ups',turns:[
    {message:'Compárame el Armor 22 y el Armor X13.',tag:'compare'},
    {message:'¿Cuál tiene mejor batería?',tag:'battery'},
    {message:'¿Y cuál es más resistente?',tag:'resistance'},
    {message:'Para trabajo de campo, ¿cuál me conviene más y por qué?',tag:'recommend'},
  ]},
  {id:'G5-05-CLOSING-PICKUP',title:'Precio -> stock -> recojo -> compra -> datos ficticios de reserva',turns:[
    {message:'Dame info del Armor X13.',tag:'info'},
    {message:'¿Cuánto cuesta?',tag:'price'},
    {message:'¿Hay stock?',tag:'stock'},
    {message:'Prefiero recogerlo en su local.',tag:'pickup'},
    {message:'Lo quiero comprar.',tag:'purchase'},
    {message:'DNI 70009999',tag:'document'},
    {message:'Mi nombre es QA Gate Cinco',tag:'name'},
    {message:'Dirección ficticia: Av. QA 500, Lima',tag:'address'},
    {message:'Dale',tag:'confirm'},
  ]},
];

function fold(v:unknown){return String(v??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function questionCount(text:string){return (text.match(/\?/g)??[]).length;}
function hasPrice(text:string){return /(?:s\s*\/\s*|\bprecio\b|\bcuesta\b|\bvale\b)\s*\d|\bs\s*\/\s*\d/i.test(text);}
function hasAvailability(text:string){return /\b(?:hay\s+stock|stock\s+disponible|tenemos\s+disponibilidad|esta\s+disponible|si,?\s+esta\s+disponible|quedan?\s+\d+\s+unidades?)\b/i.test(fold(text));}
function internalJargon(text:string){return /\b(?:ERP|RAG|SQL|EVALUATE_USE|ASK_MISSING_FACT|SOFT_CLOSE|next\s+best\s+action|SPIN_NEEDS|PRODUCT_RAG)\b/i.test(text);}
function spinFacts(state:any){return Array.isArray(state?.spinFacts)?state.spinFacts.map(String):[];}
function sameProduct(v:unknown,name:string){return fold(v).includes(fold(name));}
function comparisonHasPair(state:any){const items=Array.isArray(state?.comparisonProducts)?state.comparisonProducts:[];return items.some((x:any)=>sameProduct(x,'Armor 22'))&&items.some((x:any)=>sameProduct(x,'Armor X13'));}
function discoveryTag(tag:string){return ['situation','problem','implication','impact','benefit'].includes(tag);}

async function jsonFetch(url:string,init?:RequestInit){const res=await fetch(url,init);const text=await res.text();let body:any=null;try{body=text?JSON.parse(text):null;}catch{body={raw:text};}return{ok:res.ok,status:res.status,body};}

const health=await jsonFetch(`${baseUrl}/health`);
const report:any={runId,baseUrl,requiredBuild,health:health.body,startedAt:new Date().toISOString(),summary:{green:0,yellow:0,red:0},scenarios:[]};
if(!health.ok){console.error(`HEALTH RED HTTP ${health.status}`);process.exitCode=1;}else{
  const build=String(health.body?.buildId??'');
  if(requiredBuild&&!build.startsWith(requiredBuild)){
    console.error(`BUILD_MISMATCH expected=${requiredBuild} actual=${build}`);report.gate='BUILD_MISMATCH';process.exitCode=1;
  } else {
    for(const scenario of scenarios){
      const sessionId=`qa-${runId}-${scenario.id.toLowerCase()}`;
      const findings:Finding[]=[];const turns:any[]=[];
      for(let i=0;i<scenario.turns.length;i++){
        const spec=scenario.turns[i];
        const response=await jsonFetch(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message:spec.message,messageId:`${sessionId}-${i+1}`})});
        const body=response.body??{};const answer=String(body?.answer??'');const state=body?.state??{};const debug=body?.debug??{};
        if(!response.ok)findings.push({level:'RED',code:'HTTP_ERROR',message:`HTTP ${response.status}`,turn:i+1});
        if(!answer.trim())findings.push({level:'RED',code:'EMPTY_ANSWER',message:'Respuesta vacía.',turn:i+1});
        if(internalJargon(answer))findings.push({level:'RED',code:'INTERNAL_JARGON',message:'Expuso jerga interna al cliente.',turn:i+1});
        if(/lo tienes pensado para/i.test(answer))findings.push({level:'RED',code:'ROBOTIC_TEMPLATE',message:'Usó plantilla robótica de reconocimiento.',turn:i+1});
        if(questionCount(answer)>1)findings.push({level:'RED',code:'MULTI_QUESTION',message:'Hizo más de una pregunta en el turno.',turn:i+1});
        if(discoveryTag(spec.tag)&&(hasPrice(answer)||hasAvailability(answer)||/\b(?:envio|recojo|delivery)\b/i.test(fold(answer))))findings.push({level:'RED',code:'PREMATURE_COMMERCIAL_FACT',message:'Filtró precio/stock/fulfillment durante discovery.',turn:i+1});
        turns.push({turn:i+1,tag:spec.tag,message:spec.message,httpStatus:response.status,answer,state:{activeProduct:state?.activeProduct??null,queryTarget:state?.queryTarget??null,recommendedProduct:state?.recommendedProduct??null,comparisonProducts:state?.comparisonProducts??[],useCase:state?.useCase??null,problem:state?.problem??null,spinFacts:spinFacts(state),purchaseSignal:state?.purchaseSignal??false,reservationStage:state?.reservationStage??null,lastIntent:state?.lastIntent??null,lastNba:state?.lastNba??null},debug:{intent:debug?.intent??null,route:debug?.route??null,nextBestAction:debug?.nextBestAction??null,writerFallback:debug?.decisionTrace?.writerFallback??null,automation:debug?.automation??null}});
      }
      const last=turns.at(-1)?.state??{};
      if(scenario.id==='G5-01-PAIN-FALLS'){
        if(!sameProduct(last.activeProduct,'Armor 22'))findings.push({level:'RED',code:'LOST_ACTIVE_PRODUCT',message:'Perdió Armor 22 durante el dolor.'});
        if(!last.problem)findings.push({level:'RED',code:'PAIN_NOT_PERSISTED',message:'No persistió el problema.'});
        if(!last.spinFacts.some((x:string)=>/^implicacion:/i.test(x)))findings.push({level:'RED',code:'IMPLICATION_NOT_PERSISTED',message:'No persistió la implicación del dolor.'});
      }
      if(scenario.id==='G5-02-PAIN-WATER-DUST'){
        if(!sameProduct(last.activeProduct,'Armor X13'))findings.push({level:'RED',code:'LOST_ACTIVE_PRODUCT',message:'Perdió Armor X13.'});
        if(!/agua|polvo|exposicion/i.test(String(last.problem??'')))findings.push({level:'RED',code:'WRONG_PAIN',message:`Problema final inesperado: ${last.problem}`});
        if(!last.spinFacts.some((x:string)=>/^implicacion:/i.test(x)))findings.push({level:'RED',code:'IMPLICATION_NOT_PERSISTED',message:'No persistió la consecuencia comercial.'});
      }
      if(scenario.id==='G5-03-EXPLICIT-SWITCH'){
        if(!sameProduct(last.activeProduct,'Armor X13')&&!sameProduct(last.queryTarget,'Armor X13'))findings.push({level:'RED',code:'SWITCH_REVERTED',message:'El follow-up volvió al producto anterior.'});
        const finalAnswer=String(turns.at(-1)?.answer??'');if(/Armor 22/i.test(finalAnswer)&&!/Armor X13/i.test(finalAnswer))findings.push({level:'RED',code:'SWITCH_ANSWER_WRONG_PRODUCT',message:'Respondió el atributo del Armor 22 después de cambiar a X13.'});
      }
      if(scenario.id==='G5-04-COMPARISON-MEMORY'&&!comparisonHasPair(last))findings.push({level:'RED',code:'COMPARISON_PAIR_LOST',message:'Perdió el par Armor 22 / Armor X13 en follow-ups.'});
      if(scenario.id==='G5-05-CLOSING-PICKUP'){
        if(last.purchaseSignal!==true)findings.push({level:'RED',code:'PURCHASE_SIGNAL_LOST',message:'No conservó intención explícita de compra.'});
        const pickupTurn=turns.find((t:any)=>t.tag==='pickup');const later=turns.filter((t:any)=>t.turn>(pickupTurn?.turn??99));
        if(later.some((t:any)=>/\bseria\s+con\s+envio\b|\bcon\s+envio\b/i.test(fold(t.answer))))findings.push({level:'RED',code:'PICKUP_FLIPPED_TO_DELIVERY',message:'Cambió recojo a envío en un follow-up.'});
        if(!last.reservationStage&&!/reserv|compra/i.test(String(last.lastNba??'')))findings.push({level:'RED',code:'RESERVATION_NOT_PROGRESSING',message:'La compra no avanzó a reserva/recolección de datos.'});
      }
      const red=findings.some(x=>x.level==='RED');const yellow=findings.some(x=>x.level==='YELLOW');const status=red?'RED':yellow?'YELLOW':'GREEN';
      report.summary[status.toLowerCase()]++;report.scenarios.push({id:scenario.id,title:scenario.title,sessionId,status,findings,turns});
      console.log(`${status} ${scenario.id} ${scenario.title}`);for(const f of findings)console.log(`  ${f.level} ${f.code}${f.turn?` turn=${f.turn}`:''}: ${f.message}`);
    }
  }
}
report.finishedAt=new Date().toISOString();report.gate=report.summary.red>0||process.exitCode===1?'STOP_BEFORE_500':'PASS_FIRST_5_RUN_500';
const out=resolve('qa-results/gate500');await mkdir(out,{recursive:true});await writeFile(resolve(out,'gate5-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
const text=[`RUN ${runId}`,`BASE ${baseUrl}`,`BUILD ${String(report.health?.buildId??'unknown')}`,`GREEN ${report.summary.green} YELLOW ${report.summary.yellow} RED ${report.summary.red}`,`GATE ${report.gate}`,...report.scenarios.flatMap((s:any)=>[`${s.status} ${s.id} ${s.title}`,...s.findings.map((f:any)=>`  ${f.level} ${f.code}${f.turn?` turn=${f.turn}`:''}: ${f.message}`),...s.turns.map((t:any)=>`  T${t.turn} USER: ${t.message}\n  T${t.turn} BOT: ${t.answer}`)])].join('\n');await writeFile(resolve(out,'gate5-report.txt'),text+'\n','utf8');
console.log(`GATE5 GREEN=${report.summary.green} YELLOW=${report.summary.yellow} RED=${report.summary.red} -> ${report.gate}`);
if(report.gate!=='PASS_FIRST_5_RUN_500')process.exitCode=1;

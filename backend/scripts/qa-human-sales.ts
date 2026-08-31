import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[
  {id:'SALES-INFO-TO-CLOSE',family:'COMMERCIAL',title:'Product info progresses through pain before price and fulfillment',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'Lo quiero para mi trabajo',expected:{queryTarget:'Armor 22'}},
    {message:'Se me cae seguido',expected:{queryTarget:'Armor 22'}},
    {message:'Cuando se rompe pierdo horas de trabajo',expected:{queryTarget:'Armor 22'}},
    {message:'Mi prioridad es que aguante bien las caídas',expected:{queryTarget:'Armor 22'}},
    {message:'¿Cuánto está?',expected:{queryTarget:'Armor 22'}},
    {message:'Prefiero recogerlo en su local',expected:{queryTarget:'Armor 22'}},
    {message:'Dale',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-RAM-DIRECT',family:'FACTUAL',title:'Specific RAM question stays direct',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'¿Cuánta RAM tiene?',expected:{queryTarget:'Armor 22'}},
    {message:'Gracias',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-NFC-DIRECT',family:'FACTUAL',title:'NFC question answers without forced discovery',turns:[
    {message:'Info del Armor 25T Pro',expected:{queryTarget:'Armor 25T Pro'}},
    {message:'¿Tiene NFC?',expected:{queryTarget:'Armor 25T Pro'}},
    {message:'Lo necesito porque pago con el celular',expected:{queryTarget:'Armor 25T Pro'}},
  ]},
  {id:'SALES-WATER-DUST',family:'COMMERCIAL',title:'Water and dust pain remains the active problem',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'Trabajo entre polvo y lluvia',expected:{queryTarget:'Armor 22'}},
    {message:'Ya se me malogró un celular por eso',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-BATTERY-PAIN',family:'COMMERCIAL',title:'Battery pain stays focused on the customer problem',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'Trabajo todo el día afuera',expected:{queryTarget:'Armor 22'}},
    {message:'La batería de mi celular no llega a la tarde',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-PRICE-OBJECTION',family:'COMMERCIAL',title:'Price objection asks budget without restarting known context',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'¿Cuánto está?',expected:{queryTarget:'Armor 22'}},
    {message:'Está un poco caro para mí',expected:{queryTarget:'Armor 22'}},
    {message:'Tengo hasta 1100',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-COMPARISON',family:'COMMERCIAL',title:'Comparison keeps exactly two products and gives guided choice',turns:[
    {message:'Compara el Armor 22 con el Armor X13'},
    {message:'¿Cuál me conviene más para trabajo en campo?'},
  ]},
  {id:'SALES-EXPLICIT-SWITCH',family:'REFERENCE',title:'Explicit product change switches current target intentionally',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'Ahora dime del Armor X13',expected:{queryTarget:'Armor X13'}},
    {message:'¿Cuánta batería tiene?',expected:{queryTarget:'Armor X13'}},
  ]},
  {id:'SALES-POLICY-OVERLAY',family:'POLICY',title:'Location policy answers without destroying product context',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'¿Dónde queda su local?',expected:{queryTarget:'Armor 22'}},
    {message:'Volviendo al Armor 22, ¿tiene NFC?',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'SALES-PREMATURE-FULFILLMENT',family:'SAFETY',title:'Shipping text cannot skip unfinished discovery',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'Lo quiero para mi trabajo',expected:{queryTarget:'Armor 22'}},
    {message:'Envío a Ate',expected:{queryTarget:'Armor 22'}},
  ]},
];

type Finding={scenarioId:string;turn:number;level:'RED'|'YELLOW';code:string;message:string;answer:string};
const result=await runLiveQa({scenarios,outputDir:'qa-results/human-sales'});
const findings:Finding[]=[];

function scenario(id:string){return result.report.scenarios.find(item=>item.id===id);}
function answer(s:any,index:number):string{return String(s?.turns?.[index]?.observation?.response?.answer??'').trim();}
function state(s:any,index:number):any{return s?.turns?.[index]?.observation?.response?.state??{};}
function debug(s:any,index:number):any{return s?.turns?.[index]?.observation?.response?.debug??{};}
function add(s:any,index:number,level:'RED'|'YELLOW',code:string,message:string){findings.push({scenarioId:s.id,turn:index+1,level,code,message,answer:answer(s,index)});}
function noPriceOrAvailability(s:any,index:number){
  const value=answer(s,index);
  if(/S\/\s*\d/i.test(value)||/\b(?:tenemos\s+disponibilidad|hay\s+stock|est[aá]\s+disponible|stock\s*:\s*\d)\b/i.test(value))add(s,index,'RED','DISCOVERY_LEAKED_PRICE_STOCK','Discovery no debe mostrar precio/stock antes de que el cliente lo pida.');
}
function oneQuestionMax(s:any,index:number){const count=(answer(s,index).match(/\?/g)??[]).length;if(count>1)add(s,index,'RED','MULTIPLE_QUESTIONS',`La respuesta hizo ${count} preguntas visibles; máximo una.`);}
function noInternalTerms(s:any,index:number){if(/\bERP\b|SQL_BRIDGE|ASK_MISSING_FACT|SOFT_CLOSE|SPIN|NBA/i.test(answer(s,index)))add(s,index,'RED','INTERNAL_LANGUAGE','La respuesta expuso lenguaje interno al cliente.');}
function hasSpinFact(s:any,index:number,pattern:RegExp):boolean{return (state(s,index).spinFacts??[]).some((value:string)=>pattern.test(String(value)));}

for(const s of result.report.scenarios){
  s.turns.forEach((_turn,index)=>{
    oneQuestionMax(s,index);
    noInternalTerms(s,index);
    if(!answer(s,index))add(s,index,'RED','EMPTY_ANSWER','El turno quedó sin respuesta.');
  });
}

const main=scenario('SALES-INFO-TO-CLOSE');
if(main){
  for(const index of [0,1,2,3,4])noPriceOrAvailability(main,index);
  if(!state(main,1).useCase)add(main,1,'RED','USE_CASE_NOT_STORED','“Para mi trabajo” debe quedar como contexto de uso.');
  if(!/caida/i.test(String(state(main,2).problem??''))&&!hasSpinFact(main,2,/problema:.*caida/i))add(main,2,'RED','DROP_PAIN_NOT_STORED','“Se me cae seguido” debe quedar como problema de caídas.');
  if(String(debug(main,2).nextBestAction??'').toUpperCase()!=='ASK_MISSING_FACT')add(main,2,'RED','PAIN_SKIPPED_DISCOVERY','Después de detectar caídas todavía debe avanzar una sola pregunta SPIN, no cerrar.');
  if(!hasSpinFact(main,3,/implicacion:.*(?:tiempo|interrup)/i))add(main,3,'RED','IMPLICATION_NOT_STORED','“Pierdo horas” debe persistirse como implicación.');
  if(!/S\/\s*\d/i.test(answer(main,5)))add(main,5,'RED','EXPLICIT_PRICE_NOT_ANSWERED','Cuando el cliente pregunta precio, debe responder el precio SQL disponible.');
  if(!/disponib|stock/i.test(answer(main,5)))add(main,5,'RED','PRICE_DID_NOT_INCLUDE_AVAILABILITY','En el turno explícito de precio puede acompañar disponibilidad verificada.');
  if(!/recoger|recojo|local/i.test(answer(main,6))||!/reserv/i.test(answer(main,6)))add(main,6,'RED','PICKUP_DID_NOT_OFFER_RESERVATION','Recojo autorizado debe conservar recojo y ofrecer una sola reserva.');
  if(state(main,7).purchaseSignal!==true)add(main,7,'RED','AFFIRMATIVE_DID_NOT_CONFIRM_PURCHASE','Dale después de la pregunta de reserva debe activar purchaseSignal.');
  if(String(state(main,7).lastNba??'').toUpperCase()!=='COLLECT_RESERVATION_DATA')add(main,7,'RED','PURCHASE_DID_NOT_ADVANCE','Después de confirmar reserva debe avanzar a captura de datos.');
}

const ram=scenario('SALES-RAM-DIRECT');
if(ram){
  if((answer(ram,1).match(/\?/g)??[]).length>0)add(ram,1,'RED','RAM_FORCED_DISCOVERY','Una pregunta puntual de RAM debe responderse directamente, sin forzar otra pregunta.');
  if(/\?/.test(answer(ram,2)))add(ram,2,'RED','THANKS_FORCED_QUESTION','“Gracias” no debe abrir un discovery nuevo.');
}

const nfc=scenario('SALES-NFC-DIRECT');
if(nfc&&(answer(nfc,1).match(/\?/g)??[]).length>0)add(nfc,1,'RED','NFC_FORCED_DISCOVERY','Una pregunta factual de NFC debe terminar después de responder.');

const water=scenario('SALES-WATER-DUST');
if(water){
  noPriceOrAvailability(water,1);noPriceOrAvailability(water,2);
  const finalProblem=String(state(water,2).problem??'');
  if(!/agua|polvo/i.test(finalProblem)&&!hasSpinFact(water,2,/problema:.*(?:agua|polvo)/i))add(water,2,'RED','WATER_DUST_CONTEXT_LOST','El problema explícito de agua/polvo debe conservarse.');
}

const battery=scenario('SALES-BATTERY-PAIN');
if(battery){
  noPriceOrAvailability(battery,1);noPriceOrAvailability(battery,2);
  if(!/bateria|autonomia/i.test(String(state(battery,2).problem??''))&&!hasSpinFact(battery,2,/problema:.*autonomia/i))add(battery,2,'RED','BATTERY_CONTEXT_LOST','La batería insuficiente debe conservarse como problema.');
}

const objection=scenario('SALES-PRICE-OBJECTION');
if(objection){
  if(!/presupuesto|tope|m[aá]ximo/i.test(answer(objection,2)))add(objection,2,'RED','OBJECTION_DID_NOT_ASK_BUDGET','La objeción de precio debe pedir un presupuesto útil cuando todavía no se conoce.');
  if(Number(state(objection,3).budget??0)!==1100)add(objection,3,'RED','BUDGET_NOT_STORED','El presupuesto S/ 1100 debe persistirse.');
}

const compare=scenario('SALES-COMPARISON');
if(compare){const pair=state(compare,1).comparisonProducts??state(compare,0).comparisonProducts??[];if(!Array.isArray(pair)||pair.length!==2)add(compare,1,'RED','COMPARISON_PAIR_INVALID','La comparación debe conservar exactamente dos productos.');}

const switched=scenario('SALES-EXPLICIT-SWITCH');
if(switched){if(!/x13/i.test(String(state(switched,1).queryTarget??'')))add(switched,1,'RED','EXPLICIT_SWITCH_LOST','El cambio explícito a Armor X13 debe convertirse en el target actual.');if(!/x13/i.test(String(state(switched,2).queryTarget??'')))add(switched,2,'RED','FOLLOWUP_LOST_SWITCH','La pregunta siguiente debe continuar sobre Armor X13.');}

const policy=scenario('SALES-POLICY-OVERLAY');
if(policy){if(String(debug(policy,1).route??'').toUpperCase()!=='RAG_INSTITUTIONAL')add(policy,1,'RED','LOCATION_NOT_ROUTED_TO_INSTITUTIONAL_RAG','La ubicación pertenece a RAG institucional.');if(!/armor 22/i.test(String(state(policy,2).queryTarget??'')))add(policy,2,'RED','POLICY_DESTROYED_PRODUCT_CONTEXT','La política no debe destruir el producto activo.');}

const premature=scenario('SALES-PREMATURE-FULFILLMENT');
if(premature){
  if(String(state(premature,2).lastIntent??'').toUpperCase()==='FULFILLMENT_SELECTION')add(premature,2,'RED','FULFILLMENT_SKIPPED_DISCOVERY','Un texto de envío no puede saltar discovery si aún hay un dato comercial pendiente.');
  if(String(state(premature,2).lastNba??'').toUpperCase()==='SOFT_CLOSE')add(premature,2,'RED','PREMATURE_SOFT_CLOSE','No debe cerrar solo porque el cliente escribió una dirección durante discovery.');
}

const red=findings.filter(f=>f.level==='RED');
const yellow=findings.filter(f=>f.level==='YELLOW');
const outDir=resolve('qa-results/human-sales/latest');await mkdir(outDir,{recursive:true});
const summary={runId:result.report.runId,scenarios:result.report.summary.scenarios,turns:result.report.summary.turns,runner:result.report.summary,approvedContract:{red:red.length,yellow:yellow.length},findings};
await writeFile(resolve(outDir,'human-sales-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
console.log(`APPROVED SALES FLOW gate=${red.length?'RED':yellow.length?'YELLOW':'GREEN'} | scenarios=${result.report.summary.scenarios} turns=${result.report.summary.turns} RED=${red.length} YELLOW=${yellow.length}`);
for(const f of findings)console.log(`${f.level} ${f.scenarioId} T${f.turn} ${f.code} :: ${f.message} :: ${f.answer}`);
console.log(`Review: ${resolve(outDir,'human-sales-summary.json')}`);
if(red.length)process.exitCode=1;

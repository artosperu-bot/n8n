import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[{
  id:'PROMISED-ARMOR22-REPAIRS-POLICY-CLOSE',
  family:'CLOSING',
  title:'Armor 22 repeated-repair pain uses concise human rugged FAB and survives policy overlay through reservation',
  turns:[
    {message:'Estoy viendo el Armor 22 para trabajo. Ya mandé reparar mi celular dos veces por caídas.',expected:{queryTarget:'Armor 22'}},
    {message:'¿Dónde queda su local?',expected:{queryTarget:'Armor 22'}},
    {message:'Prefiero recogerlo en su local.',expected:{queryTarget:'Armor 22'}},
    {message:'Dale',expected:{queryTarget:'Armor 22'}},
  ],
}];

const result=await runLiveQa({scenarios,outputDir:'qa-results/promised-sales-flow'});
const scenario=result.report.scenarios[0];
const answer=(index:number)=>String(scenario?.turns?.[index]?.observation?.response?.answer??'').trim();
const state=(index:number)=>scenario?.turns?.[index]?.observation?.response?.state??{};
const findings:Array<{level:'RED';code:string;message:string;answer:string}>=[];
const add=(code:string,message:string,value:string)=>findings.push({level:'RED',code,message,answer:value});

const pain=answer(0);
if(!/si ya lo reparaste (?:dos|varias) veces/i.test(pain))add('PROMISED_HUMAN_LEAD_MISSING','Debe abrir con una frase humana breve sobre las reparaciones repetidas.',pain);
if(!/gasto/i.test(pain)||!/ca[ií]da|repar/i.test(pain))add('PROMISED_PAIN_CONSEQUENCE_MISSING','Debe conectar las caídas/reparaciones con evitar repetir el gasto.',pain);
if(!/Armor 22/i.test(pain)||!/1[.,]5\s*m/i.test(pain))add('PROMISED_RUGGED_FEATURE_MISSING','Debe conservar Armor 22 y resistencia a caídas de 1.5 m.',pain);
for(const cert of ['IP68','IP69K','MIL-STD-810H'])if(!pain.toUpperCase().includes(cert))add('PROMISED_CERTIFICATION_MISSING',`Falta certificación verificada ${cert}.`,pain);
if(!/golpes?/i.test(pain)||!/agua/i.test(pain)||!/polvo/i.test(pain))add('PROMISED_FAB_ADVANTAGE_MISSING','Debe traducir certificaciones a golpes, agua y polvo.',pain);
if(!/aguantar|riesgo|reparaci[oó]n|quedarte|preparado/i.test(pain))add('PROMISED_FAB_BENEFIT_MISSING','Debe convertir el atributo técnico en un beneficio práctico para el trabajo.',pain);
if(!/S\/\s*1399/i.test(pain)||!/disponib/i.test(pain))add('PROMISED_PRICE_STOCK_MISSING','Debe dar S/1399 + disponibilidad juntos.',pain);
if(!/env[ií]o/i.test(pain)||!/recoger|recojo|local/i.test(pain))add('PROMISED_FULFILLMENT_OFFER_MISSING','Debe terminar ofreciendo envío o recojo.',pain);
if((pain.match(/\?/g)??[]).length!==1)add('PROMISED_TOO_MANY_QUESTIONS','Debe tener exactamente un +1 visible.',pain);
if(pain.length>390)add('PROMISED_T1_TOO_LONG',`T1 debe ser compacto para chat; actual=${pain.length} caracteres.`,pain);
if(/GLONASS|Galileo|BeiDou|Helio|Mali|GPU|GHz/i.test(pain))add('PROMISED_TECHNICAL_DUMP','No debe mezclar especificaciones ajenas al dolor de resistencia.',pain);

const policy=answer(1);
if(!/Honorio Delgado 224|San Mart[ií]n de Porres|local|direcci[oó]n|ubicaci[oó]n/i.test(policy))add('POLICY_NOT_ANSWERED','Debe responder dónde queda el local usando política institucional.',policy);
if(/reparaste|nueva ca[ií]da|mismo gasto|quedarte sin celular/i.test(policy))add('POLICY_REPLAYED_OLD_PAIN','Una pregunta de ubicación no debe repetir el dolor del turno anterior.',policy);
if(!/env[ií]o/i.test(policy)||!/recoger|recojo|local|aqu[ií]/i.test(policy))add('POLICY_DID_NOT_RESUME_FULFILLMENT','Tras responder la política debe retomar envío/recojo.',policy);
if(/reserv/i.test(policy))add('POLICY_JUMPED_TO_RESERVATION','No debe asumir modalidad ni saltar a reserva solo por una pregunta de política.',policy);
if(policy.length>220)add('POLICY_T2_TOO_LONG',`T2 de ubicación debe ser directo; actual=${policy.length} caracteres.`,policy);

const pickup=answer(2);
if(!/reserv/i.test(pickup))add('PICKUP_DID_NOT_OFFER_RESERVATION','Al elegir recojo debe preguntar si quiere reservar.',pickup);
if(/para qu[eé].*uso|uso principal|presupuesto|stock|disponibilidad/i.test(pickup))add('PICKUP_REOPENED_DISCOVERY','No debe volver a uso, presupuesto o stock después de elegir recojo.',pickup);

const confirmedState=state(3);const confirmedAnswer=answer(3);
if(confirmedState.purchaseSignal!==true)add('RESERVATION_YES_NOT_PURCHASE','“Dale” a reserva debe activar purchaseSignal.',confirmedAnswer);
if(String(confirmedState.lastNba??'').toUpperCase()!=='COLLECT_RESERVATION_DATA')add('PURCHASE_DID_NOT_COLLECT_DATA','Después de confirmar reserva debe entrar a COLLECT_RESERVATION_DATA.',confirmedAnswer);
if(!/documento|dni|nombre|direcci[oó]n|datos/i.test(confirmedAnswer))add('PURCHASE_DATA_PROMPT_MISSING','La respuesta debe empezar a pedir el siguiente dato de compra/reserva.',confirmedAnswer);

const latest=resolve('qa-results/promised-sales-flow/latest');await mkdir(latest,{recursive:true});
await writeFile(resolve(latest,'promised-sales-flow.json'),`${JSON.stringify({runId:result.report.runId,gate:findings.length?'RED':'GREEN',findings,scenario:{id:scenario?.id,turns:scenario?.turns?.map((turn,index)=>({turn:index+1,client:turn.message,stech:answer(index),state:state(index)}))}},null,2)}\n`,'utf8');
console.log(`PROMISED SALES FLOW gate=${findings.length?'RED':'GREEN'} | findings=${findings.length}`);
for(const finding of findings)console.log(`RED ${finding.code} :: ${finding.message}`);
console.log('Review: qa-results/promised-sales-flow/latest/promised-sales-flow.json');
process.exitCode=findings.length?1:result.exitCode;

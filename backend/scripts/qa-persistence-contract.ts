import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { QaScenario } from '../qa/types.ts';
import { runLiveQa } from './qa-live.ts';

const scenarios:QaScenario[]=[
  {id:'PCONTRACT-CATALOG',family:'PERSISTENCE',title:'Catalog authority',turns:[
    {message:'Info del Armor 22',expected:{queryTarget:'Armor 22'}},
  ]},
  {id:'PCONTRACT-FACTS',family:'PERSISTENCE',title:'Problem and implication remain separate customer facts',turns:[
    {message:'Trabajo en construcción y se me cae seguido el celular.',expected:{}},
    {message:'Cuando se rompe pierdo horas de trabajo.',expected:{}},
  ]},
  {id:'PCONTRACT-NFC',family:'PERSISTENCE',title:'Factual attribute is not a priority until explicitly required',turns:[
    {message:'¿El Armor 25T Pro tiene NFC?',expected:{queryTarget:'Armor 25T Pro'}},
    {message:'Necesito NFC sí o sí porque pago con el celular.',expected:{queryTarget:'Armor 25T Pro'}},
  ]},
  {id:'PCONTRACT-PURCHASE',family:'PERSISTENCE',title:'Interest is not purchase',turns:[
    {message:'Precio del Armor 22',expected:{queryTarget:'Armor 22'}},
    {message:'¿Hay stock?',expected:{queryTarget:'Armor 22'}},
    {message:'Si está disponible me interesa.',expected:{queryTarget:'Armor 22'}},
    {message:'Ya, lo quiero comprar.',expected:{queryTarget:'Armor 22'}},
  ]},
];

const run=await runLiveQa({scenarios,outputDir:'qa-results/persistence-contract'});
const url=String(process.env.SUPABASE_URL??'').replace(/\/$/,'');
const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY??'');
if(!url||!key)throw new Error('PERSISTENCE CONTRACT requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const headers={apikey:key,authorization:`Bearer ${key}`};

async function rows(table:string,sessionId:string,select:string,order?:string){
  const u=new URL(`${url}/rest/v1/${table}`);
  u.searchParams.set('session_id',`eq.${sessionId}`);
  u.searchParams.set('select',select);
  if(order)u.searchParams.set('order',order);
  const r=await fetch(u,{headers});
  if(!r.ok)throw new Error(`${table} HTTP ${r.status}: ${await r.text()}`);
  return r.json() as Promise<any[]>;
}
function arr(v:any):string[]{return Array.isArray(v)?v.map(String):[];}
function snapshot(row:any):any{return row?.contexto_comercial_snapshot&&typeof row.contexto_comercial_snapshot==='object'?row.contexto_comercial_snapshot:{};}
const allowedReadiness=new Set(['EXPLORING','DISCOVERY_NEEDED','FIT_READY','OFFER_READY','EVALUATING_PURCHASE','CLOSE_READY','PURCHASE']);
const report:any={runId:run.report.runId,gate:'GREEN',sessions:[]};

for(const scenario of run.report.scenarios){
  const conv=await rows('ia_conversaciones',scenario.sessionId,'message_id,mensaje_cliente,intencion,ruta,categoria,marca_detectada,producto_detectado,producto_id_resuelto,producto_codigo_resuelto,objetivo,confianza,costo_prompt_estimado,costo_estimado_usd,intent_score,estado_emocional,probabilidad_compra,perfil_cliente,urgencia,limitacion_agente,alcance_consulta,actividad_detectada,problemas_detectados,implicaciones_detectadas,prioridades_detectadas,pregunta_pendiente_turno,accion_pendiente_turno,nivel_interes,contexto_comercial_snapshot,fecha','fecha.asc');
  const ctx=(await rows('ia_contexto',scenario.sessionId,'session_id,contrato_version,context_version,producto_activo_id,senal_compra,accion_pendiente,alcance_consulta,contexto'))[0]??null;
  const ses=(await rows('ia_sesiones',scenario.sessionId,'session_id,probabilidad_compra,etapa_comercial'))[0]??null;
  const failures:string[]=[];
  if(conv.length!==scenario.turns.length)failures.push(`turn_count expected=${scenario.turns.length} actual=${conv.length}`);
  if(!ctx)failures.push('missing ia_contexto');
  if(!ses)failures.push('missing ia_sesiones');
  if(ctx&&String(ctx.contrato_version)!=='46.0')failures.push(`contract_version=${ctx.contrato_version}`);
  if(ctx&&Number(ctx.context_version)!==conv.length)failures.push(`context_version=${ctx.context_version} turns=${conv.length}`);
  if(ctx?.alcance_consulta!=null)failures.push('ia_contexto.alcance_consulta must be null');
  if(ses?.probabilidad_compra!=null)failures.push('ia_sesiones.probabilidad_compra must be null');

  for(const [i,row] of conv.entries()){
    for(const field of ['objetivo','confianza','costo_prompt_estimado','costo_estimado_usd','intent_score','estado_emocional','probabilidad_compra','perfil_cliente','urgencia','limitacion_agente','alcance_consulta']){
      if(row[field]!=null)failures.push(`T${i+1}.${field}=${JSON.stringify(row[field])}`);
    }
    if(row.producto_id_resuelto){
      if(row.marca_detectada!=='ULEFONE')failures.push(`T${i+1}.marca=${row.marca_detectada}`);
      if(row.categoria!=='Celulares y Teléfonos')failures.push(`T${i+1}.categoria=${row.categoria}`);
    }
    const readiness=snapshot(row)?.commercial?.readiness;
    if(readiness!=null&&!allowedReadiness.has(String(readiness)))failures.push(`T${i+1}.readiness=${readiness}`);
  }

  if(scenario.id==='PCONTRACT-FACTS'){
    const [p,i]=conv;
    if(!arr(p?.problemas_detectados).some(x=>/caid/i.test(x)))failures.push('problem not detected on first fact turn');
    if(arr(p?.implicaciones_detectadas).length!==0)failures.push('problem fabricated implication');
    if(!arr(i?.implicaciones_detectadas).length)failures.push('explicit impact not persisted as implication');
  }
  if(scenario.id==='PCONTRACT-NFC'){
    const [factual,required]=conv;
    if(arr(factual?.prioridades_detectadas).some(x=>/nfc/i.test(x)))failures.push('factual NFC question became priority');
    if(!arr(required?.prioridades_detectadas).some(x=>/nfc/i.test(x)))failures.push('explicit NFC requirement not persisted as priority');
  }
  if(scenario.id==='PCONTRACT-PURCHASE'){
    const interest=conv[2],purchase=conv[3];
    if(snapshot(interest)?.commercial?.purchaseSignal===true)failures.push('interest became purchase');
    if(snapshot(purchase)?.commercial?.purchaseSignal!==true)failures.push('explicit purchase did not become purchase');
  }

  const status=failures.length?'RED':'GREEN';
  if(status==='RED')report.gate='RED';
  report.sessions.push({id:scenario.id,sessionId:scenario.sessionId,status,failures});
}

const out=resolve('qa-results/persistence-contract/latest');
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'persistence-contract-summary.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(`PERSISTENCE CONTRACT gate=${report.gate}`);
for(const s of report.sessions)console.log(`${s.status} ${s.id}${s.failures.length?` :: ${s.failures.join(' | ')}`:''}`);
if(report.gate!=='GREEN')process.exitCode=1;

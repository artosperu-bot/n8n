import type { ConversationState } from '../../domain/types.ts';

type ProjectionMeta={messageId:string};
type PendingQuestion={kind:'DISCOVERY';target:string;missingFact:string;status:'PENDING';createdMessageId:string};
type PendingAction={type:string;accion:string;status:'PENDING';createdMessageId:string};

function clean(values:string[]|undefined):string[]{
  return [...new Set((values??[]).filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean))];
}
function changed(previous:string|null|undefined,current:string|null|undefined):string|null{
  const p=String(previous??'').trim();
  const c=String(current??'').trim();
  return c&&c!==p?c:null;
}
function added(previous:string[]|undefined,current:string[]|undefined):string[]{
  const before=new Set(clean(previous));
  return clean(current).filter(v=>!before.has(v));
}
function spinValues(facts:string[]|undefined,prefix:string):string[]{
  const p=`${prefix.toLowerCase()}:`;
  return clean(facts).filter(v=>v.toLowerCase().startsWith(p)).map(v=>v.slice(p.length).trim()).filter(Boolean);
}
function targetForMissingFact(value:string|null|undefined):string{
  const text=String(value??'').toLocaleLowerCase('es');
  if(/impact|implic|consecu/.test(text)) return 'IMPLICATION';
  if(/problema|dificultad|dolor/.test(text)) return 'PROBLEM';
  if(/prioridad|resultado|necesidad/.test(text)) return 'NEED_PAYOFF';
  if(/uso|actividad|trabajo|situacion|situación/.test(text)) return 'SITUATION';
  if(/presupuesto|budget/.test(text)) return 'BUDGET';
  return 'UNKNOWN';
}
function pendingQuestion(state:ConversationState,meta:ProjectionMeta):PendingQuestion|null{
  if(String(state.lastNba??'').toUpperCase()!=='ASK_MISSING_FACT'||!String(state.pendingMissingFact??'').trim()) return null;
  return {kind:'DISCOVERY',target:targetForMissingFact(state.pendingMissingFact),missingFact:String(state.pendingMissingFact).trim(),status:'PENDING',createdMessageId:meta.messageId};
}
function pendingAction(state:ConversationState,meta:ProjectionMeta):PendingAction|null{
  const raw=String(state.pendingCommercialAction??state.lastNba??'').trim().toUpperCase();
  if(!raw||raw==='ANSWER_ONLY'||raw==='ASK_MISSING_FACT') return null;
  return {type:raw,accion:raw,status:'PENDING',createdMessageId:meta.messageId};
}
function spinContribution(previous:ConversationState,current:ConversationState):string|null{
  const direct=String(current.lastSpinContribution??'').trim().toUpperCase();
  if(['SITUACION','PROBLEMA','IMPLICACION','NECESIDAD_SOLUCION'].includes(direct)) return direct;
  if(changed(previous.useCase??previous.sector,current.useCase??current.sector)) return 'SITUACION';
  if(changed(previous.problem,current.problem)) return 'PROBLEMA';
  if(added(spinValues(previous.spinFacts,'implicacion'),spinValues(current.spinFacts,'implicacion')).length) return 'IMPLICACION';
  if(added(previous.priorities,current.priorities).length) return 'NECESIDAD_SOLUCION';
  return null;
}
function spinPhase(state:ConversationState):string|null{
  if(clean(state.priorities).length||spinValues(state.spinFacts,'prioridad').length||spinValues(state.spinFacts,'necesidad').length) return 'NECESIDAD_SOLUCION';
  if(spinValues(state.spinFacts,'implicacion').length) return 'IMPLICACION';
  if(state.problem||spinValues(state.spinFacts,'problema').length) return 'PROBLEMA';
  if(state.useCase||state.sector) return 'SITUACION';
  return null;
}

export function projectCommercialPersistence(previous:ConversationState,current:ConversationState,meta:ProjectionMeta){
  const question=pendingQuestion(current,meta);
  const action=pendingAction(current,meta);
  const currentImplications=spinValues(current.spinFacts,'implicacion');
  const previousImplications=spinValues(previous.spinFacts,'implicacion');
  const activityDelta=changed(previous.useCase??previous.sector,current.useCase??current.sector);
  const problemDelta=changed(previous.problem,current.problem);
  const priorityDelta=added(previous.priorities,current.priorities);
  const implicationDelta=added(previousImplications,currentImplications);

  return {
    turn:{
      spin_aporte:spinContribution(previous,current),
      spin_fase_actual:spinPhase(current),
      actividad_detectada:activityDelta,
      problemas_detectados:problemDelta?[problemDelta]:[],
      implicaciones_detectadas:implicationDelta,
      prioridades_detectadas:priorityDelta,
      pregunta_pendiente_turno:question,
      accion_pendiente_turno:action,
    },
    context:{
      customer:{
        sector:current.sector??null,
        useCase:current.useCase??null,
        problem:current.problem??null,
        implications:currentImplications,
        priorities:clean(current.priorities),
      },
      commercial:{
        stage:current.commercialStage??null,
        strategy:current.commercialStrategy??null,
        interestLevel:current.levelOfInterest??0,
        interestEvents:clean(current.interestEvents),
        objection:current.objection??null,
        purchaseSignal:current.purchaseSignal??false,
      },
      pendingQuestion:question,
      pendingAction:action,
    },
  } as const;
}

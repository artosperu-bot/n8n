import type { ConversationState } from '../../domain/types.ts';

export type SpinReadiness={
  hasSituation:boolean;
  hasNeed:boolean;
  readyForStock:boolean;
  reason:'NO_SITUATION'|'SITUATION_ONLY'|'NEED_CONFIRMED';
};

function unique(values:string[]):string[]{return[...new Set(values.map(v=>String(v??'').trim().toLowerCase()).filter(Boolean))];}

export function evaluateSpinReadiness(state:ConversationState={}):SpinReadiness{
  const spinFacts=state.spinFacts??[];
  const hasSituation=Boolean(
    state.useCase
    || state.sector
    || spinFacts.some(f=>/^(?:uso|sector):/i.test(String(f)))
  );

  const contribution=String(state.lastSpinContribution??'').toUpperCase();
  const explicit=unique(((state as any).explicitPriorities??[]) as string[]);
  const priorities=unique(state.priorities??[]);
  const progressedSpin=['PROBLEMA','IMPLICACION','NECESIDAD_SOLUCION'].includes(contribution);

  // A need can be explicit ("necesito batería y resistencia"), emerge from a
  // real problem, or be recognized by the SPIN classifier. Two independent
  // priorities are also enough to avoid asking redundant discovery questions.
  const hasNeed=Boolean(
    state.problem
    || explicit.length>0
    || priorities.length>=2
    || progressedSpin
  );

  if(!hasSituation)return{hasSituation:false,hasNeed,readyForStock:false,reason:'NO_SITUATION'};
  if(!hasNeed)return{hasSituation:true,hasNeed:false,readyForStock:false,reason:'SITUATION_ONLY'};
  return{hasSituation:true,hasNeed:true,readyForStock:true,reason:'NEED_CONFIRMED'};
}

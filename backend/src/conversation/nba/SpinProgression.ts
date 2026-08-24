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

  // With a known situation, one concrete need/priority is enough to stop asking
  // redundant discovery questions. Without a situation, isolated attributes do
  // not qualify the conversation for a stock CTA.
  const contextualPriority=hasSituation&&priorities.length>=1;
  const hasNeed=Boolean(
    state.problem
    || explicit.length>0
    || contextualPriority
    || progressedSpin
  );

  if(!hasSituation)return{hasSituation:false,hasNeed,readyForStock:false,reason:'NO_SITUATION'};
  if(!hasNeed)return{hasSituation:true,hasNeed:false,readyForStock:false,reason:'SITUATION_ONLY'};
  return{hasSituation:true,hasNeed:true,readyForStock:true,reason:'NEED_CONFIRMED'};
}

import type { ConversationState } from '../../domain/types.ts';

export type SpinStage='SITUATION'|'PROBLEM'|'IMPLICATION'|'NEED_PAYOFF'|'READY';
export type SpinReadiness={
  hasSituation:boolean;
  hasProblem:boolean;
  hasImplication:boolean;
  hasNeed:boolean;
  stage:SpinStage;
  nextMissingFact:string|null;
  readyForRecommendation:boolean;
  readyForStock:boolean;
  reason:'NO_SITUATION'|'SITUATION_ONLY'|'PROBLEM_ONLY'|'IMPLICATION_ONLY'|'NEED_CONFIRMED';
};

function unique(values:string[]):string[]{return[...new Set(values.map(v=>String(v??'').trim().toLowerCase()).filter(Boolean))];}

function hasSpinFact(state:ConversationState,pattern:RegExp):boolean{
  return (state.spinFacts??[]).some(value=>pattern.test(String(value)));
}

/**
 * SPIN authority is intentionally separate from N+1.
 *
 * This function only answers: what customer context is already known and what
 * single discovery fact would be useful next? It never decides stock, price,
 * reservation or another commercial action.
 *
 * The sequence is flexible rather than rigid: when the customer already states
 * a concrete need/priority, we skip redundant P/I questions and mark discovery
 * ready. Otherwise we progress one useful question at a time S -> P -> I -> N.
 */
export function evaluateSpinReadiness(state:ConversationState={}):SpinReadiness{
  const contribution=String(state.lastSpinContribution??'').toUpperCase();
  const priorities=unique(state.priorities??[]);
  const explicit=unique(((state as any).explicitPriorities??[]) as string[]);

  const hasSituation=Boolean(
    state.useCase
    || state.sector
    || hasSpinFact(state,/^(?:uso|sector):/i)
  );
  const hasProblem=Boolean(
    state.problem
    || contribution==='PROBLEMA'
    || hasSpinFact(state,/^(?:problema):/i)
  );
  const hasImplication=Boolean(
    contribution==='IMPLICACION'
    || hasSpinFact(state,/^(?:implicacion|impacto):/i)
    || hasSpinFact(state,/\b(?:implicacion|impacto|consecuencia)\b/i)
  );
  const hasNeed=Boolean(
    explicit.length>0
    || priorities.length>0
    || contribution==='NECESIDAD_SOLUCION'
    || hasSpinFact(state,/^prioridad:/i)
  );

  if(!hasSituation){
    return{hasSituation:false,hasProblem,hasImplication,hasNeed,stage:'SITUATION',nextMissingFact:'uso principal',readyForRecommendation:false,readyForStock:false,reason:'NO_SITUATION'};
  }

  // A need explicitly supplied by the customer is enough to avoid making SPIN
  // feel like an interview. We retain S/P/I facts if they exist, but do not ask
  // questions merely to fill boxes.
  if(hasNeed){
    return{hasSituation:true,hasProblem,hasImplication,hasNeed:true,stage:'READY',nextMissingFact:null,readyForRecommendation:true,readyForStock:true,reason:'NEED_CONFIRMED'};
  }

  if(!hasProblem){
    return{hasSituation:true,hasProblem:false,hasImplication,hasNeed:false,stage:'PROBLEM',nextMissingFact:'problema principal',readyForRecommendation:false,readyForStock:false,reason:'SITUATION_ONLY'};
  }
  if(!hasImplication){
    return{hasSituation:true,hasProblem:true,hasImplication:false,hasNeed:false,stage:'IMPLICATION',nextMissingFact:'impacto del problema',readyForRecommendation:false,readyForStock:false,reason:'PROBLEM_ONLY'};
  }
  return{hasSituation:true,hasProblem:true,hasImplication:true,hasNeed:false,stage:'NEED_PAYOFF',nextMissingFact:'prioridad principal',readyForRecommendation:false,readyForStock:false,reason:'IMPLICATION_ONLY'};
}

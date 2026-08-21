import type { ConversationState } from '../../domain/types.ts';
export type StatePatch=Partial<ConversationState>&{spinResidual?:string};
export function reduceState(previous:ConversationState,patch:StatePatch):ConversationState{
  const{spinResidual,spinFacts:patchSpinFacts,...canonicalPatch}=patch;
  const spinFacts=[...new Set([...(previous.spinFacts??[]),...(patchSpinFacts??[])])];
  if(spinResidual&&spinResidual.length>3&&!spinFacts.includes(spinResidual))spinFacts.push(spinResidual);
  return{...previous,...canonicalPatch,spinFacts,turnCount:(previous.turnCount??0)+1,updatedAt:new Date().toISOString()};
}

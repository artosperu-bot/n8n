import type { ConversationState } from '../../domain/types.ts';

export type StatePatch=Partial<ConversationState>&{spinResidual?:string};

export function reduceState(previous:ConversationState,patch:StatePatch):ConversationState{
  const{spinResidual,spinFacts:patchSpinFacts,...canonicalPatch}=patch;
  const spinFacts=[...new Set([...(previous.spinFacts??[]),...(patchSpinFacts??[])])];
  if(spinResidual&&spinResidual.length>3&&!spinFacts.includes(spinResidual))spinFacts.push(spinResidual);

  const next:ConversationState={
    ...previous,
    ...canonicalPatch,
    spinFacts,
    turnCount:(previous.turnCount??0)+1,
    updatedAt:new Date().toISOString(),
  };

  const currentIntent=String(canonicalPatch.lastIntent??'').toUpperCase();
  const preserveAssistedJourney=previous.handoffActive===true
    && canonicalPatch.handoffActive===false
    && ['POLICY','WARRANTY'].includes(currentIntent)
    && (
      Number(previous.quantity??0)>=2
      || String(previous.lastIntent??'').toUpperCase()==='QUOTE'
      || String(previous.commercialStage??'').toUpperCase()==='CIERRE_ASISTIDO'
    );

  if(preserveAssistedJourney){
    next.handoffActive=true;
    next.blockAutomaticReply=previous.blockAutomaticReply??true;
    next.handoffReason=previous.handoffReason??'CONTINUAR_VENTA';
    next.pendingCommercialAction=previous.pendingCommercialAction??'ASSISTED_HANDOFF';
    next.commercialStage=previous.commercialStage??next.commercialStage;
    next.commercialStrategy=previous.commercialStrategy??next.commercialStrategy;
  }

  return next;
}

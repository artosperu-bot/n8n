import type { AutomationBus } from '../ports/AutomationBus.ts';
import type { ConversationRepository } from '../ports/ConversationRepository.ts';
import type { ErpRepository } from '../ports/ErpRepository.ts';
import type { LlmProvider } from '../ports/LlmProvider.ts';
import type { RagRepository } from '../ports/RagRepository.ts';
import type { TelemetryRepository } from '../ports/TelemetryRepository.ts';
import type { ChatInput, ChatTurnResult, ProductQuote, RagEvidence } from '../domain/types.ts';
import { classifyBudgetTurn } from './budget/BudgetResolver.ts';
import { extractCommercialFacts } from './commercial/CommercialFacts.ts';
import { imageResponse, institutionalResponse, noEvidenceResponse, priceResponse, purchaseResponse, stockResponse } from './commercial/ResponsePolicy.ts';
import { resolveIntent } from './intent/IntentResolver.ts';
import { nextBestAction } from './nba/NextBestAction.ts';
import { canonicalProductName, resolveReference } from './reference/ReferenceResolver.ts';
import { reduceState } from './state/StateReducer.ts';

type Dependencies={conversations:ConversationRepository;telemetry:TelemetryRepository;erp:ErpRepository;rag:RagRepository;llm:LlmProvider;automation:AutomationBus;};
const DIRECT_INTENTS=new Set(['PRICE','STOCK','PURCHASE','IMAGE','COMPARE','CAPABILITY','WARRANTY','POLICY','QUOTE']);
function unique<T>(values:T[]):T[]{return[...new Set(values)];}
function canonical(value:string|null|undefined):string|null{return canonicalProductName(value)??(value?String(value):null);}

export class ConversationEngine{
  private readonly deps:Dependencies;
  constructor(deps:Dependencies){this.deps=deps;}

  async processTurn(input:ChatInput):Promise<ChatTurnResult>{
    const turnStarted=performance.now();
    if(!input.sessionId?.trim())throw new Error('sessionId is required');
    if(!input.message?.trim())throw new Error('message is required');
    const previous=await this.deps.conversations.getState(input.sessionId);
    const turnNumber=(previous.turnCount??0)+1;
    await this.deps.conversations.appendMessage(input.sessionId,'user',input.message,{messageId:input.messageId??null,requestId:input.messageId??null,conversationType:input.sessionId.startsWith('qa-')?'QA_LIVE':null});

    const commercial=extractCommercialFacts(input.message,previous);
    const budget=classifyBudgetTurn(input.message,{prevBudget:previous.budget??null});
    const baseIntent=resolveIntent(input.message,{staleIntent:previous.lastIntent??null});
    let intent:string=DIRECT_INTENTS.has(baseIntent)?baseIntent:(budget.preferredIntent??baseIntent);
    if(baseIntent==='RECOMMEND'&&budget.effectiveBudget)intent='RECOMMEND_WITHIN_BUDGET';
    if(baseIntent==='CAPABILITY'&&(previous.comparisonProducts?.length??0)>=2&&/\b(los\s+dos|ambos|cual\s+de\s+los\s+dos|conviene\s+mas)\b/.test(input.message.toLocaleLowerCase('es')))intent='COMPARE';
    const reference=resolveReference(input.message,previous);

    let comparisonProducts=[...(previous.comparisonProducts??[])];
    if(reference.mentionedProducts.length>=2)comparisonProducts=reference.mentionedProducts.slice(0,2);
    else if(intent==='COMPARE'&&reference.mentionedProducts.length===1&&previous.activeProduct&&previous.activeProduct!==reference.mentionedProducts[0])comparisonProducts=unique([previous.activeProduct,reference.mentionedProducts[0]]).slice(0,2);

    let quote:ProductQuote|null=null;
    let recommendedProduct=canonical(previous.recommendedProduct)??null;
    let deterministicAnswer:string|null=null;
    let rag:RagEvidence[]=[];
    let images:Array<{url:string;type?:string|null;source:any}>=[];

    if((intent==='PRICE'||intent==='STOCK')&&reference.queryTarget){quote=await this.deps.erp.getProductQuote(reference.queryTarget);deterministicAnswer=intent==='PRICE'?priceResponse(quote):stockResponse(quote,commercial.quantity);}
    else if(intent==='IMAGE'&&reference.queryTarget){images=this.deps.erp.getProductImages?await this.deps.erp.getProductImages(reference.queryTarget,10):[];deterministicAnswer=imageResponse(images)||noEvidenceResponse();}
    else if(intent==='BUDGET_CONSTRAINT'&&budget.effectiveBudget){deterministicAnswer=`Listo, tomo S/ ${budget.effectiveBudget.max} como tu tope.`;}
    else if(intent==='RECOMMEND_WITHIN_BUDGET'&&budget.effectiveBudget){
      const options=await this.deps.erp.listProductsWithinBudget(budget.effectiveBudget.max);let best:ProductQuote|null=null;let bestScore=-1;
      const needQuery=`${input.message} ${(commercial.priorities??[]).join(' ')} ${commercial.problem??''}`;
      for(const candidate of options.slice(-4)){const name=canonical(candidate.product)??candidate.product;const evidence=await this.deps.rag.search(needQuery,name);const score=evidence.reduce((n,x)=>n+Number(x.score??0),0);if(score>bestScore||(score===bestScore&&(candidate.price??0)>(best?.price??-1))){bestScore=score;best=candidate;}}
      recommendedProduct=canonical(best?.product)??best?.product??null;
      if(recommendedProduct){rag=await this.deps.rag.search(needQuery,recommendedProduct);deterministicAnswer=`Candidato verificado dentro del presupuesto: ${recommendedProduct}.`;}
      else deterministicAnswer='No encontré una opción con precio confirmado dentro de ese presupuesto.';
    }else if(intent==='PURCHASE'){
      const target=canonical(reference.queryTarget??previous.recommendedProduct??previous.activeProduct);if(target)quote=await this.deps.erp.getProductQuote(target);deterministicAnswer=purchaseResponse({...previous,queryTarget:target},quote);
    }else if(intent==='GREETING')deterministicAnswer='Hola 👋 ¿Qué equipo estás buscando?';

    if(intent==='POLICY'||intent==='WARRANTY'){rag=await this.deps.rag.search(input.message,reference.queryTarget);deterministicAnswer=institutionalResponse(rag)??noEvidenceResponse();}
    else if(intent==='CAPABILITY'){rag=await this.deps.rag.search(input.message,reference.queryTarget);if(!rag.length)deterministicAnswer=noEvidenceResponse();}
    else if(intent==='COMPARE'){
      const pair=comparisonProducts.length>=2?comparisonProducts:reference.mentionedProducts;const compareQuery=`${input.message} ${(commercial.priorities??[]).join(' ')} ${commercial.problem??''}`;
      for(const product of pair.slice(0,2))rag.push(...(await this.deps.rag.search(compareQuery,product)).slice(0,2));if(!rag.length)deterministicAnswer=noEvidenceResponse();
    }

    const state=reduceState(previous,{activeProduct:reference.nextActiveProduct,salientProduct:canonical(reference.queryTarget),recommendedProduct,comparisonProducts,queryTarget:canonical(reference.queryTarget),explicitSwitch:reference.explicitSwitch,budget:budget.budget?.max??previous.budget??null,lastIntent:intent,lastNba:nextBestAction(intent),customerType:commercial.customerType,sector:commercial.sector,useCase:commercial.useCase,problem:commercial.problem,priorities:commercial.priorities,quantity:commercial.quantity,invoiceRequired:commercial.invoiceRequired,objection:budget.priceObjection?'precio':commercial.objection,purchaseSignal:intent==='PURCHASE'?true:commercial.purchaseSignal,spinFacts:commercial.spinFacts,lastUserMessage:input.message,spinResidual:budget.budgetConstraint?budget.spinResidual:undefined});

    const deterministicOnly=new Set(['PRICE','STOCK','IMAGE','POLICY','WARRANTY','PURCHASE','BUDGET_CONSTRAINT','GREETING']);
    const noEvidenceHardStop=(intent==='CAPABILITY'||intent==='COMPARE')&&rag.length===0;
    let answer=deterministicAnswer??'';let llmDebug:ChatTurnResult['debug']['llm'];let telemetry:{delivered:boolean;error?:string}|undefined;let actualModel='deterministic-v0.3';
    if(!deterministicOnly.has(intent)&&!noEvidenceHardStop){
      const llmResult=await this.deps.llm.write({message:input.message,intent,state,quote,rag,deterministicAnswer});answer=llmResult.text;actualModel=llmResult.model;llmDebug={model:llmResult.model,inputTokens:llmResult.usage.inputTokens,outputTokens:llmResult.usage.outputTokens,totalTokens:llmResult.usage.totalTokens,cachedInputTokens:llmResult.usage.cachedInputTokens,durationMs:llmResult.durationMs};telemetry={delivered:true};
      try{await this.deps.telemetry.recordLlmUsage({sessionId:input.sessionId,turn:turnNumber,route:intent,model:llmResult.model,inputTokens:llmResult.usage.inputTokens,outputTokens:llmResult.usage.outputTokens,cachedTokens:llmResult.usage.cachedInputTokens,durationMs:llmResult.durationMs,messageId:input.messageId??null});}catch(error){telemetry={delivered:false,error:error instanceof Error?error.message:String(error)};}
    }
    if(!answer)answer=noEvidenceResponse();
    const finalState={...state,lastAssistantMessage:answer};await this.deps.conversations.saveState(input.sessionId,finalState);await this.deps.conversations.appendMessage(input.sessionId,'assistant',answer,{model:actualModel});
    const automation=await this.deps.automation.publish({type:intent==='PURCHASE'?'purchase.intent':'conversation.turn.completed',occurredAt:new Date().toISOString(),sessionId:input.sessionId,payload:{messageId:input.messageId??null,intent,queryTarget:reference.queryTarget,state:finalState,answer}});
    return{sessionId:input.sessionId,answer,state:finalState,debug:{intent,queryTarget:canonical(reference.queryTarget),explicitSwitch:reference.explicitSwitch,budget:finalState.budget??null,priceObjection:budget.priceObjection,erp:quote,images,ragSources:rag.map(x=>x.source),llm:llmDebug,totalDurationMs:Math.max(0,Math.round(performance.now()-turnStarted)),telemetry,automation}};
  }
}

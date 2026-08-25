export type AutomationEventType='CUSTOMER_MESSAGE_RECEIVED';
export type AutomationActionType='SEND_TEXT';
export type AutomationJobStatus='PENDING'|'PROCESSING'|'SENT'|'CANCELLED'|'SKIPPED'|'FAILED'|'AMBIGUOUS';

export type AutomationRule={
  id:string;
  name:string;
  eventType:AutomationEventType;
  delaySeconds:number;
  actionType:AutomationActionType;
  messageTemplate:string;
  active:boolean;
  priority:number;
};

export type AutomationJob={
  id:string;
  ruleId:string;
  sessionId:string;
  eventType:AutomationEventType;
  basisMessageId:string|null;
  recipient:string;
  executeAt:string;
  status:AutomationJobStatus;
  attemptCount:number;
  leaseOwner?:string|null;
  leaseUntil?:string|null;
};

export type AutomationClaimedJob=AutomationJob&{
  messageTemplate:string;
};

export type ScheduleAutomationJobInput={
  ruleId:string;
  sessionId:string;
  eventType:AutomationEventType;
  basisMessageId:string|null;
  recipient:string;
  executeAt:string;
};

export type AutomationExecutionOutcome={
  jobId:string;
  sessionId:string;
  outcome:'SENT'|'FAILED'|'AMBIGUOUS'|'SKIPPED'|'CANCELLED';
  providerMessageId:string|null;
  detail?:Record<string,unknown>;
};

export type CreateAutomationRuleInput={
  name:string;
  eventType:AutomationEventType;
  delaySeconds:number;
  actionType:AutomationActionType;
  messageTemplate:string;
  active:boolean;
  priority:number;
};

export interface AutomationRepository{
  listActiveRules(eventType:AutomationEventType):Promise<AutomationRule[]>;
  cancelPending(sessionId:string,reason:string):Promise<number>;
  scheduleJob(input:ScheduleAutomationJobInput):Promise<AutomationJob|null>;
  claimDue(workerId:string,batchSize:number,leaseSeconds:number):Promise<AutomationClaimedJob[]>;
  getRule(ruleId:string):Promise<AutomationRule|null>;
  markTerminal(jobId:string,status:AutomationJobStatus,reason?:string|null):Promise<void>;
  recordExecution(input:AutomationExecutionOutcome):Promise<void>;
  listRules():Promise<AutomationRule[]>;
  createRule(input:CreateAutomationRuleInput):Promise<AutomationRule>;
  setRuleActive(id:string,active:boolean):Promise<AutomationRule>;
  listJobs(filters?:{sessionId?:string|null;limit?:number|null}):Promise<AutomationJob[]>;
}

export type AutomationAttentionMode='BOT'|'ESPERANDO_ASESOR'|'HUMANO'|'CERRADO';

export interface AutomationCrmPort{
  getAutomationState(sessionId:string):Promise<{
    mode:AutomationAttentionMode;
    latestCustomerAt:string|null;
    latestCustomerMessageId:string|null;
  }>;
  recordAutomationMessage(input:{
    sessionId:string;
    messageId:string;
    content:string;
    recipient:string;
    jobId:string;
  }):Promise<void>;
}

export interface AutomationSender{
  sendTextOnce(to:string,text:string):Promise<{messageId:string|null}>;
}

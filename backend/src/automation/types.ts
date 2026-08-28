export type AutomationEventType='CUSTOMER_MESSAGE_RECEIVED'|'BOT_MESSAGE_SENT';
export type AutomationActionType='SEND_TEXT'|'SEND_IMAGE_PRODUCT_AUTO'|'SEND_IMAGE_CUSTOM_URL';
export type AutomationJobStatus='PENDING'|'PROCESSING'|'SENT'|'CANCELLED'|'SKIPPED'|'FAILED'|'AMBIGUOUS';

export type AutomationMediaSnapshot={
  mediaUrl:string|null;
  mediaUrls:string[];
  mediaType:string|null;
  mediaProductId:string|null;
  mediaSource:string|null;
};

export type AutomationRule={
  id:string;
  name:string;
  eventType:AutomationEventType;
  delaySeconds:number;
  actionType:AutomationActionType;
  messageTemplate:string;
  mediaUrl:string|null;
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
  actionType:AutomationActionType;
  mediaUrl:string|null;
  mediaUrls:string[];
  mediaType:string|null;
  mediaProductId:string|null;
  mediaSource:string|null;
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
  actionType:AutomationActionType;
  mediaUrl:string|null;
  mediaUrls:string[];
  mediaType:string|null;
  mediaProductId:string|null;
  mediaSource:string|null;
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
  mediaUrl:string|null;
  active:boolean;
  priority:number;
};

export type UpdateAutomationRuleInput={
  name:string;
  delaySeconds:number;
  actionType:AutomationActionType;
  messageTemplate:string;
  mediaUrl:string|null;
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
  updateRule(id:string,input:UpdateAutomationRuleInput):Promise<AutomationRule>;
  setRuleActive(id:string,active:boolean):Promise<AutomationRule>;
  deleteRule(id:string,reason:string):Promise<AutomationRule>;
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
    actionType?:AutomationActionType;
    mediaUrl?:string|null;
    mediaUrls?:string[];
    mediaProductId?:string|null;
    mediaSource?:string|null;
    fallbackToText?:boolean;
  }):Promise<void>;
}

export interface AutomationSender{
  sendTextOnce(to:string,text:string):Promise<{messageId:string|null}>;
  sendImageWithCaptionOnce?(to:string,imageUrl:string,caption:string):Promise<{messageId:string|null}>;
}

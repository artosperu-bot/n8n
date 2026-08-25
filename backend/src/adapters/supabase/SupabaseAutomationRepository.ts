import type {
  AutomationClaimedJob,
  AutomationEventType,
  AutomationExecutionOutcome,
  AutomationJob,
  AutomationJobStatus,
  AutomationRepository,
  AutomationRule,
  CreateAutomationRuleInput,
  ScheduleAutomationJobInput,
} from '../../automation/types.ts';

type Options={url:string;serviceRoleKey:string;fetcher?:typeof fetch};

function mapRule(row:any):AutomationRule{return{
  id:String(row.id),name:String(row.name),eventType:String(row.event_type) as AutomationEventType,
  delaySeconds:Number(row.delay_seconds??0),actionType:String(row.action_type??'SEND_TEXT') as 'SEND_TEXT',
  messageTemplate:String(row.message_template??''),active:row.active===true,priority:Number(row.priority??100),
};}
function mapJob(row:any):AutomationJob{return{
  id:String(row.id),ruleId:String(row.rule_id),sessionId:String(row.session_id),eventType:String(row.event_type) as AutomationEventType,
  basisMessageId:row.basis_message_id==null?null:String(row.basis_message_id),recipient:String(row.recipient),executeAt:String(row.execute_at),
  status:String(row.status) as AutomationJobStatus,attemptCount:Number(row.attempt_count??0),leaseOwner:row.lease_owner??null,leaseUntil:row.lease_until??null,
};}

export class SupabaseAutomationRepository implements AutomationRepository{
  private readonly url:string;
  private readonly key:string;
  private readonly fetcher:typeof fetch;
  constructor(options:Options){this.url=options.url.replace(/\/$/,'');this.key=options.serviceRoleKey;this.fetcher=options.fetcher??fetch;}
  private headers(extra:Record<string,string>={}){return{apikey:this.key,authorization:`Bearer ${this.key}`,'content-type':'application/json',...extra};}
  private async json(response:Response,label:string):Promise<any>{
    if(!response.ok)throw new Error(`${label} HTTP ${response.status}: ${(await response.text().catch(()=>'' )).slice(0,240)}`);
    if(response.status===204)return null;
    return response.json();
  }

  async listActiveRules(eventType:AutomationEventType):Promise<AutomationRule[]>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_rules`);
    url.searchParams.set('active','eq.true');url.searchParams.set('event_type',`eq.${eventType}`);url.searchParams.set('order','priority.asc,created_at.asc');
    const response=await this.fetcher(url,{headers:this.headers()});return (await this.json(response,'automation active rules') as any[]).map(mapRule);
  }
  async listRules():Promise<AutomationRule[]>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_rules`);url.searchParams.set('order','priority.asc,created_at.asc');
    const response=await this.fetcher(url,{headers:this.headers()});return (await this.json(response,'automation rules') as any[]).map(mapRule);
  }
  async getRule(ruleId:string):Promise<AutomationRule|null>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_rules`);url.searchParams.set('id',`eq.${ruleId}`);url.searchParams.set('limit','1');
    const response=await this.fetcher(url,{headers:this.headers()});const rows=await this.json(response,'automation rule') as any[];return rows[0]?mapRule(rows[0]):null;
  }
  async createRule(input:CreateAutomationRuleInput):Promise<AutomationRule>{
    const response=await this.fetcher(`${this.url}/rest/v1/crm_automation_rules`,{method:'POST',headers:this.headers({Prefer:'return=representation'}),body:JSON.stringify({
      name:input.name,event_type:'BOT_MESSAGE_SENT',delay_seconds:input.delaySeconds,action_type:input.actionType,message_template:input.messageTemplate,active:input.active,priority:input.priority,
    })});
    const rows=await this.json(response,'automation create rule') as any[];if(!rows[0])throw new Error('AUTOMATION_RULE_CREATE_EMPTY');return mapRule(rows[0]);
  }
  async setRuleActive(id:string,active:boolean):Promise<AutomationRule>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_rules`);url.searchParams.set('id',`eq.${id}`);
    const response=await this.fetcher(url,{method:'PATCH',headers:this.headers({Prefer:'return=representation'}),body:JSON.stringify({active,updated_at:new Date().toISOString()})});
    const rows=await this.json(response,'automation set rule active') as any[];if(!rows[0])throw new Error('AUTOMATION_RULE_NOT_FOUND');return mapRule(rows[0]);
  }
  async cancelPending(sessionId:string,reason:string):Promise<number>{
    const response=await this.fetcher(`${this.url}/rest/v1/rpc/crm_cancel_pending_automation_jobs`,{method:'POST',headers:this.headers(),body:JSON.stringify({p_session_id:sessionId,p_reason:reason})});
    const value=await this.json(response,'automation cancel pending');return Number(Array.isArray(value)?value[0]??0:value??0);
  }
  async scheduleJob(input:ScheduleAutomationJobInput):Promise<AutomationJob|null>{
    const response=await this.fetcher(`${this.url}/rest/v1/rpc/crm_schedule_automation_job_once`,{method:'POST',headers:this.headers(),body:JSON.stringify({
      p_rule_id:input.ruleId,p_session_id:input.sessionId,p_event_type:input.eventType,p_basis_message_id:input.basisMessageId,p_recipient:input.recipient,p_execute_at:input.executeAt,
    })});
    const rows=await this.json(response,'automation schedule once') as any[];return rows[0]?mapJob(rows[0]):null;
  }
  async claimDue(workerId:string,batchSize:number,leaseSeconds:number):Promise<AutomationClaimedJob[]>{
    const response=await this.fetcher(`${this.url}/rest/v1/rpc/crm_claim_due_automation_jobs`,{method:'POST',headers:this.headers(),body:JSON.stringify({p_worker_id:workerId,p_batch_size:batchSize,p_lease_seconds:leaseSeconds})});
    const rows=await this.json(response,'automation claim due') as any[];
    return rows.map(row=>({...mapJob(row),messageTemplate:String(row.message_template??'')}));
  }
  async markTerminal(jobId:string,status:AutomationJobStatus,reason:string|null=null):Promise<void>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_jobs`);url.searchParams.set('id',`eq.${jobId}`);
    const body:any={status,cancel_reason:reason,lease_owner:null,lease_until:null,updated_at:new Date().toISOString()};
    if(status==='FAILED'||status==='AMBIGUOUS')body.last_error=reason;
    const response=await this.fetcher(url,{method:'PATCH',headers:this.headers({Prefer:'return=minimal'}),body:JSON.stringify(body)});await this.json(response,'automation terminal');
  }
  async recordExecution(input:AutomationExecutionOutcome):Promise<void>{
    const response=await this.fetcher(`${this.url}/rest/v1/crm_automation_executions`,{method:'POST',headers:this.headers({Prefer:'return=minimal'}),body:JSON.stringify({
      job_id:input.jobId,session_id:input.sessionId,provider_message_id:input.providerMessageId,outcome:input.outcome,detail:input.detail??{},
    })});
    if(response.status===409)return;await this.json(response,'automation execution');
  }
  async listJobs(filters:{sessionId?:string|null;limit?:number|null}={}):Promise<AutomationJob[]>{
    const url=new URL(`${this.url}/rest/v1/crm_automation_jobs`);if(filters.sessionId)url.searchParams.set('session_id',`eq.${filters.sessionId}`);url.searchParams.set('order','created_at.desc');url.searchParams.set('limit',String(Math.max(1,Math.min(200,Number(filters.limit??100)))));
    const response=await this.fetcher(url,{headers:this.headers()});return (await this.json(response,'automation jobs') as any[]).map(mapJob);
  }
}

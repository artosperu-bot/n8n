type Deferred<T>={promise:Promise<T>;resolve:(value:T)=>void;reject:(error:unknown)=>void};
type Item<T,R>={id:string;value:T;deferred:Deferred<R>};
type SessionState<T,R>={pending:Item<T,R>[];carry:Item<T,R>[];timer:ReturnType<typeof setTimeout>|null;running:boolean;byId:Map<string,Promise<R>>};

export type WhatsAppLogicalBatch<T>={
  sessionId:string;
  logicalMessageId:string;
  values:T[];
  physicalMessageIds:string[];
  status:'AGGREGATED'|'REPROCESSED';
  hasNewer:()=>boolean;
};

type Options<T,R>={
  windowMs?:number;
  idOf:(value:T)=>string;
  execute:(batch:WhatsAppLogicalBatch<T>)=>Promise<R|{superseded:true}>;
};

function deferred<T>():Deferred<T>{
  let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;
  const promise=new Promise<T>((ok,fail)=>{resolve=ok;reject=fail;});
  return{promise,resolve,reject};
}

export class WhatsAppTurnAggregator<T,R>{
  readonly #windowMs:number;
  readonly #idOf:(value:T)=>string;
  readonly #execute:(batch:WhatsAppLogicalBatch<T>)=>Promise<R|{superseded:true}>;
  readonly #sessions=new Map<string,SessionState<T,R>>();

  constructor(options:Options<T,R>){
    this.#windowMs=Math.max(0,Math.floor(options.windowMs??2500));
    this.#idOf=options.idOf;
    this.#execute=options.execute;
  }

  enqueue(sessionId:string,value:T):Promise<R>{
    const state=this.#sessions.get(sessionId)??{pending:[],carry:[],timer:null,running:false,byId:new Map<string,Promise<R>>()};
    this.#sessions.set(sessionId,state);
    const id=this.#idOf(value);
    const existing=state.byId.get(id);if(existing)return existing;
    const wait=deferred<R>();const item={id,value,deferred:wait};
    state.pending.push(item);state.byId.set(id,wait.promise);
    if(!state.running)this.#schedule(sessionId,state);
    return wait.promise;
  }

  #schedule(sessionId:string,state:SessionState<T,R>):void{
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(()=>{state.timer=null;void this.#drain(sessionId,state);},this.#windowMs);
  }

  async #drain(sessionId:string,state:SessionState<T,R>):Promise<void>{
    if(state.running||!state.pending.length)return;
    state.running=true;
    const fresh=state.pending.splice(0);
    const carried=state.carry.splice(0);
    const items=[...carried,...fresh];
    const logicalMessageId=carried.length?(fresh.at(-1)?.id??items.at(-1)!.id):items[0].id;
    const status=carried.length?'REPROCESSED':'AGGREGATED';
    try{
      const result=await this.#execute({
        sessionId,logicalMessageId,status,
        values:items.map(item=>item.value),
        physicalMessageIds:items.map(item=>item.id),
        hasNewer:()=>state.pending.length>0,
      });
      if('superseded' in result||state.pending.length){
        state.carry=items;
      }else{
        for(const item of items){state.byId.delete(item.id);item.deferred.resolve(result);}
      }
    }catch(error){
      for(const item of items){state.byId.delete(item.id);item.deferred.reject(error);}
    }finally{
      state.running=false;
      if(state.pending.length)this.#schedule(sessionId,state);
      else if(!state.carry.length&&!state.byId.size)this.#sessions.delete(sessionId);
    }
  }
}

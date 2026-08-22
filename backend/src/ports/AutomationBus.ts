import type { AutomationEvent } from '../domain/types.ts';
export type AutomationResult={delivered:boolean;error?:string};
export interface AutomationBus{publish(event:AutomationEvent):Promise<AutomationResult>;}

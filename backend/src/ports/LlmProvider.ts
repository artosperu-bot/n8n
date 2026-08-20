import type { ConversationState, ProductQuote, RagEvidence } from '../domain/types.ts';
export type LlmWriteInput={message:string;intent:string;state:ConversationState;quote?:ProductQuote|null;rag?:RagEvidence[];deterministicAnswer?:string|null};
export interface LlmProvider{write(input:LlmWriteInput):Promise<string>;}

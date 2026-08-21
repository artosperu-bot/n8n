import type { OracleCard, OracleSpec } from './oracle/types.ts';

export type QaLevel = 'GREEN' | 'YELLOW' | 'RED';
export type QaFamily = 'TRUTH' | 'REFERENCE' | 'INTENT' | 'COMMERCIAL' | 'CLOSING' | 'RELIABILITY' | 'COMPARISON' | 'INSTITUTIONAL' | 'POLICY';
export type QaRootCause = 'SEMANTIC'|'REFERENCE'|'STATE'|'SQL'|'PRODUCT_RAG'|'INSTITUTIONAL_RAG'|'WRITER'|'NBA'|'PERSISTENCE'|'HANDOFF';

export type QaExpected = {
  intent?: string;
  queryTarget?: string | null;
  activeProduct?: string | null;
  recommendedProduct?: string | null;
  explicitSwitch?: boolean;
  budget?: number | null;
  answerIncludes?: string[];
  answerExcludes?: string[];
};

export type QaTurn = { message: string; expected?: QaExpected; oracleSpec?: OracleSpec };
export type QaScenario = { id: string; family: QaFamily; title: string; turns: QaTurn[] };
export type QaFinding = { level: 'YELLOW' | 'RED'; code: string; message: string; rootCause?:QaRootCause };

export type QaTurnObservation = {
  httpStatus: number;
  ok: boolean;
  request: { sessionId: string; messageId: string; message: string };
  response: any;
  roundTripMs: number;
};

export type QaTurnResult = {
  turn: number;
  message: string;
  status: QaLevel;
  observation: QaTurnObservation;
  findings: QaFinding[];
  oracle?: OracleCard | null;
};

export type QaScenarioResult = {
  id: string;
  family: QaFamily;
  title: string;
  sessionId: string;
  status: QaLevel;
  turns: QaTurnResult[];
};

export type QaDimensionMetrics = {
  productIdentity:{pass:number;total:number};
  referenceAccuracy:{pass:number;total:number};
  factualAccuracy:{pass:number;total:number};
  noFabrication:{pass:number;total:number};
  memoryConsistency:{pass:number;total:number};
  questionResolved:{pass:number;total:number};
  nbaQuality:{pass:number;total:number};
  purchaseProgression:{pass:number;total:number};
  persistence:{pass:number;total:number};
};

export type QaReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  modes: Record<string, unknown>;
  summary: { scenarios: number; turns: number; green: number; yellow: number; red: number };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number };
  latency: { averageRoundTripMs: number; averageLlmMs: number };
  dimensions?:QaDimensionMetrics;
  rootCauses?:Partial<Record<QaRootCause,number>>;
  scenarios: QaScenarioResult[];
};

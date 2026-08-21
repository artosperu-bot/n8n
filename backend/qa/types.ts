export type QaLevel = 'GREEN' | 'YELLOW' | 'RED';
export type QaFamily = 'TRUTH' | 'REFERENCE' | 'INTENT' | 'COMMERCIAL' | 'CLOSING' | 'RELIABILITY';

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

export type QaTurn = { message: string; expected?: QaExpected };
export type QaScenario = { id: string; family: QaFamily; title: string; turns: QaTurn[] };
export type QaFinding = { level: 'YELLOW' | 'RED'; code: string; message: string };

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
};

export type QaScenarioResult = {
  id: string;
  family: QaFamily;
  title: string;
  sessionId: string;
  status: QaLevel;
  turns: QaTurnResult[];
};

export type QaReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  modes: Record<string, unknown>;
  summary: { scenarios: number; turns: number; green: number; yellow: number; red: number };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number };
  latency: { averageRoundTripMs: number; averageLlmMs: number };
  scenarios: QaScenarioResult[];
};

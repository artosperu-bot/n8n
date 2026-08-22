export type LlmMetric = {
  sessionId: string;
  turn: number;
  route: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  durationMs: number;
  messageId: string | null;
};

export interface TelemetryRepository {
  recordLlmUsage(metric: LlmMetric): Promise<void>;
}

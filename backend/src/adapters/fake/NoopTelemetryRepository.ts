import type { LlmMetric, TelemetryRepository } from '../../ports/TelemetryRepository.ts';

export class NoopTelemetryRepository implements TelemetryRepository {
  async recordLlmUsage(_metric: LlmMetric): Promise<void> {}
}

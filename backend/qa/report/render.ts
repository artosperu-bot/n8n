import type { QaReport } from '../types.ts';

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'apikey'
    || normalized.endsWith('apikey')
    || normalized.endsWith('authorization')
    || normalized.endsWith('token')
    || normalized.endsWith('password')
    || normalized.endsWith('servicerolekey')
    || normalized.endsWith('secret');
}

export function sanitizeSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(v => sanitizeSecrets(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeSecrets(child);
    }
    return out as T;
  }
  return value;
}

export function renderMarkdown(report: QaReport): string {
  const lines: string[] = [
    `# STECH Live QA — ${report.runId}`,
    '',
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Modes: ${JSON.stringify(report.modes)}`,
    `- Scenarios: ${report.summary.scenarios}`,
    `- Turns: ${report.summary.turns}`,
    `- GREEN: ${report.summary.green}`,
    `- YELLOW: ${report.summary.yellow}`,
    `- RED: ${report.summary.red}`,
    `- Input tokens: ${report.usage.inputTokens}`,
    `- Output tokens: ${report.usage.outputTokens}`,
    `- Total tokens: ${report.usage.totalTokens}`,
    `- Cached input tokens: ${report.usage.cachedInputTokens}`,
    `- Avg round-trip ms: ${report.latency.averageRoundTripMs}`,
    `- Avg LLM ms: ${report.latency.averageLlmMs}`,
    '',
    '## Scenarios',
  ];

  for (const scenario of report.scenarios) {
    lines.push('', `### ${scenario.status} — ${scenario.id}: ${scenario.title}`, `Supabase session: \`${scenario.sessionId}\``);
    for (const turn of scenario.turns) {
      lines.push(`- Turn ${turn.turn} [${turn.status}] — ${turn.message}`);
      for (const finding of turn.findings) {
        lines.push(`  - ${finding.level} ${finding.code}: ${finding.message}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

import crypto from 'node:crypto';

function pad(value: number): string { return String(value).padStart(2, '0'); }

export function createRunId(now = new Date(), entropy = crypto.randomUUID().slice(0, 4)): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `qa-${stamp}-${entropy}`;
}

export function createSessionId(runId: string, caseId: string): string {
  return `${runId}-${caseId}`;
}

export function createMessageId(runId: string, caseId: string, turnIndex: number): string {
  return `${runId}:${caseId}:t${String(turnIndex).padStart(2, '0')}`;
}

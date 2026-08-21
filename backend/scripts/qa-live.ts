import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreScenarios } from '../qa/scenarios/core.ts';
import { createMessageId, createRunId, createSessionId } from '../qa/id.ts';
import { evaluateCommercial } from '../qa/evaluators/commercial.ts';
import { evaluateHard } from '../qa/evaluators/hard.ts';
import { renderMarkdown, sanitizeSecrets } from '../qa/report/render.ts';
import type { QaFinding, QaLevel, QaReport, QaScenario, QaScenarioResult, QaTurnObservation } from '../qa/types.ts';

type Logger = Pick<Console, 'log' | 'table' | 'error'>;
type RunOptions = {
  baseUrl?: string;
  scenarios?: QaScenario[];
  fetcher?: typeof fetch;
  now?: Date;
  entropy?: string;
  writeArtifacts?: boolean;
  outputDir?: string;
  strict?: boolean;
  logger?: Logger;
};

function statusFromFindings(findings: QaFinding[]): QaLevel {
  if (findings.some(f => f.level === 'RED')) return 'RED';
  if (findings.some(f => f.level === 'YELLOW')) return 'YELLOW';
  return 'GREEN';
}

function maxStatus(statuses: QaLevel[]): QaLevel {
  if (statuses.includes('RED')) return 'RED';
  if (statuses.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

async function responseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
}

export async function runLiveQa(options: RunOptions = {}): Promise<{ report: QaReport; exitCode: number }> {
  const baseUrl = (options.baseUrl ?? process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const scenarios = options.scenarios ?? coreScenarios;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  const runId = createRunId(now, options.entropy);
  const logger = options.logger ?? console;
  const strict = options.strict ?? ['1', 'true', 'yes', 'on'].includes(String(process.env.QA_STRICT ?? '').toLowerCase());

  let healthResponse: Response;
  try {
    healthResponse = await fetcher(`${baseUrl}/health`);
  } catch (error) {
    throw new Error(`QA health check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const health = await responseJson(healthResponse);
  if (!healthResponse.ok || health.status !== 'ok') {
    throw new Error(`QA health check failed HTTP ${healthResponse.status}: ${health.error ?? 'backend no saludable'}`);
  }

  const scenarioResults: QaScenarioResult[] = [];
  for (const scenario of scenarios) {
    const sessionId = createSessionId(runId, scenario.id);
    const turnResults: QaScenarioResult['turns'] = [];

    for (let index = 0; index < scenario.turns.length; index += 1) {
      const turn = scenario.turns[index];
      const messageId = createMessageId(runId, scenario.id, index + 1);
      const request = { sessionId, messageId, message: turn.message };
      const started = performance.now();
      let observation: QaTurnObservation;

      try {
        const response = await fetcher(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
        const payload = await responseJson(response);
        observation = {
          httpStatus: response.status,
          ok: response.ok,
          request,
          response: payload,
          roundTripMs: Math.max(0, Math.round(performance.now() - started)),
        };
      } catch (error) {
        observation = {
          httpStatus: 0,
          ok: false,
          request,
          response: { error: error instanceof Error ? error.message : String(error) },
          roundTripMs: Math.max(0, Math.round(performance.now() - started)),
        };
      }

      const findings = [...evaluateHard(turn, observation), ...evaluateCommercial(observation)];
      const status = statusFromFindings(findings);
      turnResults.push({ turn: index + 1, message: turn.message, status, observation, findings });
      if (!observation.ok || observation.response?.error) break;
    }

    scenarioResults.push({
      id: scenario.id,
      family: scenario.family,
      title: scenario.title,
      sessionId,
      status: maxStatus(turnResults.map(t => t.status)),
      turns: turnResults,
    });
  }

  const allTurns = scenarioResults.flatMap(s => s.turns);
  const scenarioStatuses = scenarioResults.map(s => s.status);
  const usage = allTurns.reduce((acc, turn) => {
    const llm = turn.observation.response?.debug?.llm ?? {};
    acc.inputTokens += Number(llm.inputTokens ?? 0);
    acc.outputTokens += Number(llm.outputTokens ?? 0);
    acc.totalTokens += Number(llm.totalTokens ?? 0);
    acc.cachedInputTokens += Number(llm.cachedInputTokens ?? 0);
    return acc;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 });

  const report: QaReport = {
    runId,
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    modes: health.modes ?? {},
    summary: {
      scenarios: scenarioResults.length,
      turns: allTurns.length,
      green: scenarioStatuses.filter(s => s === 'GREEN').length,
      yellow: scenarioStatuses.filter(s => s === 'YELLOW').length,
      red: scenarioStatuses.filter(s => s === 'RED').length,
    },
    usage,
    latency: {
      averageRoundTripMs: average(allTurns.map(t => t.observation.roundTripMs)),
      averageLlmMs: average(allTurns.map(t => Number(t.observation.response?.debug?.llm?.durationMs)).filter(Number.isFinite)),
    },
    scenarios: scenarioResults,
  };

  const safeReport = sanitizeSecrets(report);
  if (options.writeArtifacts !== false) {
    const outputDir = resolve(options.outputDir ?? 'qa-results');
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, `${runId}.json`), `${JSON.stringify(safeReport, null, 2)}\n`, 'utf8');
    await writeFile(resolve(outputDir, `${runId}.md`), renderMarkdown(safeReport), 'utf8');
  }

  logger.log(`STECH Live QA ${runId}`);
  logger.table(scenarioResults.map(s => ({ status: s.status, family: s.family, case: s.id, session: s.sessionId })));
  logger.log(`GREEN=${report.summary.green} YELLOW=${report.summary.yellow} RED=${report.summary.red} | tokens=${report.usage.totalTokens}`);

  return { report: safeReport, exitCode: strict && report.summary.red > 0 ? 1 : 0 };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runLiveQa().then(({ exitCode }) => { process.exitCode = exitCode; }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

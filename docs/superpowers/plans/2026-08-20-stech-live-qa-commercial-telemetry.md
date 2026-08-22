# STECH Live QA + Commercial Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live end-to-end QA, OpenAI token/latency telemetry, Supabase traceability, deterministic and commercial evaluators, and reproducible JSON/Markdown reports without changing the commercial policy before a baseline is frozen.

**Architecture:** Keep the production backend as the system under test. Phase 1A changes the LLM return contract from plain text to a structured result, records usage through a dedicated telemetry port, and persists QA identifiers through the existing conversation repository. Phase 1B adds an external HTTP runner (`npm run qa:live`) that exercises `/health` and `/api/chat`, evaluates hard and soft rules, and writes reports under `backend/qa-results/`.

**Tech Stack:** Node.js >=22.16, TypeScript executed with Node experimental strip-types, native `node:test`, native `fetch`, OpenAI Responses API over HTTP, Supabase REST, existing n8n SQL bridge.

**Spec:** `docs/superpowers/specs/2026-08-20-stech-live-qa-commercial-telemetry-design.md`

## Global Constraints

- Do not enable RAG in Phase 1; keep `RAG_MODE=disabled`.
- Do not modify or activate production n8n workflows as part of this plan.
- Do not create phrase-specific fixes for QA cases.
- Do not create new Supabase tables in Phase 1.
- Use existing `ia_sesiones`, `ia_contexto`, `ia_conversaciones`, and `ia_metricas_tokens`.
- Persist the client message before the external LLM call so failed generations remain diagnosable.
- Never persist or print API keys, bearer tokens, SQL credentials, Supabase service-role keys, raw authorization headers, or hidden prompts.
- Hard factual/state failures override any commercial/style score.
- The live runner must test the HTTP boundary and must not import `ConversationEngine` directly.
- Generated QA artifacts live only under `backend/qa-results/` and are gitignored.
- No Phase 2 SPIN/empathy/neuroventas behavior changes until the Phase 1 baseline is frozen.

---

## File Structure Locked by This Plan

### Existing files to modify

- `backend/src/ports/LlmProvider.ts` — structured LLM result contract.
- `backend/src/adapters/openai/OpenAIProvider.ts` — map OpenAI text, usage and latency.
- `backend/src/adapters/fake/FakeLlmProvider.ts` — deterministic structured result for tests.
- `backend/src/domain/types.ts` — non-secret chat debug telemetry types.
- `backend/src/ports/ConversationRepository.ts` — optional per-turn metadata contract.
- `backend/src/adapters/fake/MemoryConversationRepository.ts` — preserve metadata compatibility without external writes.
- `backend/src/adapters/supabase/SupabaseConversationRepository.ts` — persist QA `message_id`, `request_id`, `tipo_conversacion`, actual model where available.
- `backend/src/conversation/ConversationEngine.ts` — consume structured LLM result, record telemetry, expose debug metrics.
- `backend/src/bootstrap.ts` — construct telemetry implementation.
- `backend/src/config/config.ts` — telemetry table/config defaults if needed.
- `backend/package.json` — add `qa:live` script.
- `backend/.gitignore` — ignore `qa-results/`.
- `backend/docs/CONEXIONES-REALES.md` — document QA usage and Supabase trace queries.

### New production files

- `backend/src/ports/TelemetryRepository.ts` — telemetry write interface.
- `backend/src/adapters/fake/NoopTelemetryRepository.ts` — no-op telemetry implementation.
- `backend/src/adapters/supabase/SupabaseTelemetryRepository.ts` — writes `ia_metricas_tokens`.
- `backend/qa/types.ts` — scenario, turn, evaluation and report types.
- `backend/qa/id.ts` — `runId`, `sessionId`, `messageId` generation.
- `backend/qa/scenarios/core.ts` — frozen Phase 1 baseline scenarios.
- `backend/qa/evaluators/hard.ts` — deterministic RED/GREEN rules.
- `backend/qa/evaluators/commercial.ts` — advisory GREEN/YELLOW commercial rules.
- `backend/qa/report/render.ts` — JSON-safe report model + Markdown rendering.
- `backend/scripts/qa-live.ts` — live HTTP runner.

### New tests

- `backend/tests/unit/llm-usage.test.ts`
- `backend/tests/unit/supabase-telemetry.test.ts`
- `backend/tests/unit/conversation-qa-metadata.test.ts`
- `backend/tests/unit/qa-id.test.ts`
- `backend/tests/unit/qa-hard-evaluator.test.ts`
- `backend/tests/unit/qa-commercial-evaluator.test.ts`
- `backend/tests/unit/qa-report.test.ts`
- `backend/tests/integration/qa-runner-http.test.ts`

---

### Task 1: Structured LLM Result + OpenAI Usage Mapping

**Files:**
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/adapters/fake/FakeLlmProvider.ts`
- Modify: `backend/tests/unit/real-adapters.test.ts`
- Create: `backend/tests/unit/llm-usage.test.ts`

**Interfaces:**
- Produces:

```ts
export type LlmUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
};

export type LlmResult = {
  text: string;
  model: string;
  usage: LlmUsage;
  durationMs: number;
};

export interface LlmProvider {
  write(input: LlmWriteInput): Promise<LlmResult>;
}
```

- OpenAI mapping:
  - `json.model` fallback to configured model.
  - `json.usage.input_tokens` -> `inputTokens`.
  - `json.usage.output_tokens` -> `outputTokens`.
  - `json.usage.total_tokens` -> `totalTokens`.
  - `json.usage.input_tokens_details.cached_tokens` -> `cachedInputTokens`.
  - missing usage fields -> `null`, never fabricated zero.

- [ ] **Step 1: Write failing OpenAI usage test**

Create `backend/tests/unit/llm-usage.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../../src/adapters/openai/OpenAIProvider.ts';

test('OpenAIProvider returns text, actual model, token usage and duration', async () => {
  const fetcher: typeof fetch = async () => Response.json({
    model: 'gpt-test-live',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Respuesta final' }] }],
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 20 },
    },
  });
  const llm = new OpenAIProvider({ apiKey: 'test', model: 'configured-model', fetcher });
  const result = await llm.write({
    message: 'precio?',
    intent: 'PRICE',
    state: { queryTarget: 'Armor X13' },
    deterministicAnswer: 'Armor X13: S/ 899.',
  });
  assert.equal(result.text, 'Respuesta final');
  assert.equal(result.model, 'gpt-test-live');
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    cachedInputTokens: 20,
  });
  assert.ok(result.durationMs >= 0);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/unit/llm-usage.test.ts
```

Expected: FAIL because `write()` still returns a string.

- [ ] **Step 3: Change the LLM port contract**

Replace the port with the types above while preserving the existing `LlmWriteInput` fields.

- [ ] **Step 4: Implement OpenAI structured result**

In `OpenAIProvider.write()` record `const started = performance.now()` before `fetch`, extract text exactly as today, then return:

```ts
return {
  text,
  model: String(json.model ?? this.#model),
  usage: {
    inputTokens: json.usage?.input_tokens == null ? null : Number(json.usage.input_tokens),
    outputTokens: json.usage?.output_tokens == null ? null : Number(json.usage.output_tokens),
    totalTokens: json.usage?.total_tokens == null ? null : Number(json.usage.total_tokens),
    cachedInputTokens: json.usage?.input_tokens_details?.cached_tokens == null
      ? null
      : Number(json.usage.input_tokens_details.cached_tokens),
  },
  durationMs: Math.max(0, Math.round(performance.now() - started)),
};
```

- [ ] **Step 5: Update FakeLlmProvider**

Return deterministic values:

```ts
return {
  text: input.deterministicAnswer ?? `[MODO PRUEBA] Recibí tu consulta sobre ${input.state.queryTarget ?? 'el producto'}.`,
  model: 'fake-test-llm',
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 },
  durationMs: 0,
};
```

- [ ] **Step 6: Update existing adapter tests**

Change assertions from `const text = await llm.write(...)` to `const result = ...` and assert `result.text`.

- [ ] **Step 7: Run focused tests GREEN**

```powershell
node --experimental-strip-types --test tests/unit/llm-usage.test.ts tests/unit/real-adapters.test.ts
```

Expected: zero failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/ports/LlmProvider.ts backend/src/adapters/openai/OpenAIProvider.ts backend/src/adapters/fake/FakeLlmProvider.ts backend/tests/unit/llm-usage.test.ts backend/tests/unit/real-adapters.test.ts
git commit -m "feat(backend): capture structured llm usage"
```

---

### Task 2: Dedicated Telemetry Port + Supabase Token Metrics

**Files:**
- Create: `backend/src/ports/TelemetryRepository.ts`
- Create: `backend/src/adapters/fake/NoopTelemetryRepository.ts`
- Create: `backend/src/adapters/supabase/SupabaseTelemetryRepository.ts`
- Modify: `backend/src/bootstrap.ts`
- Modify: `backend/src/config/config.ts`
- Create: `backend/tests/unit/supabase-telemetry.test.ts`

**Interfaces:**

```ts
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
```

Supabase row contract:

```ts
{
  session_id: metric.sessionId,
  turno: metric.turn,
  nodo: 'OpenAIProvider',
  ruta: metric.route,
  modelo: metric.model,
  tokens_entrada: metric.inputTokens,
  tokens_salida: metric.outputTokens,
  tokens_cacheados: metric.cachedTokens,
  duracion_ms: metric.durationMs,
  message_id: metric.messageId,
}
```

- [ ] **Step 1: Write failing Supabase payload test**

Create a fetcher spy and assert the POST target is `/rest/v1/ia_metricas_tokens` and the JSON body equals the row contract above.

- [ ] **Step 2: Run test RED**

```powershell
node --experimental-strip-types --test tests/unit/supabase-telemetry.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement port and adapters**

`NoopTelemetryRepository.recordLlmUsage()` resolves without side effects.

`SupabaseTelemetryRepository` constructor:

```ts
type Options = { url: string; key: string; table?: string; fetcher?: typeof fetch };
```

Default table is `ia_metricas_tokens`; POST uses `apikey`, bearer service-role key, and JSON content type. Non-2xx throws `Supabase telemetry write HTTP <status>`.

- [ ] **Step 4: Add config field**

Add:

```ts
supabaseTokenMetricsTable: string;
```

with:

```ts
supabaseTokenMetricsTable: env.SUPABASE_TOKEN_METRICS_TABLE ?? 'ia_metricas_tokens',
```

- [ ] **Step 5: Wire bootstrap**

When `PERSISTENCE_MODE=supabase`, create `SupabaseTelemetryRepository` with the same URL/key and metrics table. Otherwise use `NoopTelemetryRepository`. Include `telemetry` in the runtime return and pass it to `ConversationEngine` in Task 4.

- [ ] **Step 6: Run focused test GREEN**

```powershell
node --experimental-strip-types --test tests/unit/supabase-telemetry.test.ts tests/unit/config.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/ports/TelemetryRepository.ts backend/src/adapters/fake/NoopTelemetryRepository.ts backend/src/adapters/supabase/SupabaseTelemetryRepository.ts backend/src/bootstrap.ts backend/src/config/config.ts backend/tests/unit/supabase-telemetry.test.ts backend/tests/unit/config.test.ts
git commit -m "feat(backend): persist llm token telemetry"
```

---

### Task 3: QA Turn Metadata in Conversation Persistence

**Files:**
- Modify: `backend/src/ports/ConversationRepository.ts`
- Modify: `backend/src/adapters/fake/MemoryConversationRepository.ts`
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Create: `backend/tests/unit/conversation-qa-metadata.test.ts`

**Interfaces:**

Add:

```ts
export type ConversationMessageMeta = {
  messageId?: string | null;
  requestId?: string | null;
  conversationType?: string | null;
  model?: string | null;
};
```

Change:

```ts
appendMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  meta?: ConversationMessageMeta,
): Promise<void>;
```

Rules:
- QA session = `sessionId.startsWith('qa-')`.
- QA session insert in `ia_sesiones` uses `canal='qa_live'`; non-QA keeps `canal='backend'`.
- User row stores:

```ts
{
  session_id: sessionId,
  mensaje_cliente: content,
  respuesta_bot: null,
  message_id: meta?.messageId ?? null,
  request_id: meta?.requestId ?? null,
  tipo_conversacion: meta?.conversationType ?? (isQa ? 'QA_LIVE' : null),
  modelo: meta?.model ?? 'stech-backend',
  fecha: new Date().toISOString(),
}
```

- Assistant PATCH updates the same pending row and, when supplied, sets `modelo` to the actual LLM model.

- [ ] **Step 1: Write failing QA metadata test**

Test that `appendMessage('qa-run-CASE','user',...meta)` first ensures `ia_sesiones` with `qa_live`, then inserts `message_id`, `request_id`, and `QA_LIVE`; test assistant PATCH preserves same row id and sets actual model.

- [ ] **Step 2: Run RED**

```powershell
node --experimental-strip-types --test tests/unit/conversation-qa-metadata.test.ts
```

- [ ] **Step 3: Extend port and both implementations**

Memory repository may store metadata internally but `getMessages()` continues returning only `{role,content,at}` to preserve the external session API.

- [ ] **Step 4: Run Supabase persistence regressions**

```powershell
node --experimental-strip-types --test tests/unit/conversation-qa-metadata.test.ts tests/unit/supabase-conversation-real.test.ts tests/unit/fakes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/ports/ConversationRepository.ts backend/src/adapters/fake/MemoryConversationRepository.ts backend/src/adapters/supabase/SupabaseConversationRepository.ts backend/tests/unit/conversation-qa-metadata.test.ts backend/tests/unit/supabase-conversation-real.test.ts backend/tests/unit/fakes.test.ts
git commit -m "feat(backend): trace qa turns in supabase"
```

---

### Task 4: ConversationEngine Telemetry + Non-Secret Debug

**Files:**
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/conversation/ConversationEngine.ts`
- Modify: `backend/src/bootstrap.ts`
- Modify: `backend/tests/integration/conversation-engine.test.ts`

**Interfaces:**

Extend `ChatTurnResult.debug` with:

```ts
llm?: {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  durationMs: number;
};
totalDurationMs?: number;
```

Add `telemetry: TelemetryRepository` to engine dependencies.

- [ ] **Step 1: Write failing integration assertions**

Use fake LLM + telemetry spy. Assert one `recordLlmUsage()` call contains session id, next turn number, intent route and `messageId`; assert returned debug contains the structured fake LLM usage and a non-negative total duration.

- [ ] **Step 2: Run RED**

```powershell
node --experimental-strip-types --test tests/integration/conversation-engine.test.ts
```

- [ ] **Step 3: Implement process order**

At turn start:

```ts
const turnStarted = performance.now();
const previous = await conversations.getState(...);
const turnNumber = (previous.turnCount ?? 0) + 1;
const qa = input.sessionId.startsWith('qa-');
const requestId = qa ? input.sessionId.split('-').slice(0, 4).join('-') : null;
```

Do not infer `requestId` by parsing an unstable prefix in final code. Instead derive it from the QA message id when it exists:

```ts
const requestId = input.messageId?.includes(':')
  ? input.messageId.split(':').slice(0, 1).join(':')
  : null;
```

Persist the user message before LLM with:

```ts
await conversations.appendMessage(input.sessionId, 'user', input.message, {
  messageId: input.messageId ?? null,
  requestId,
  conversationType: qa ? 'QA_LIVE' : null,
});
```

After `const llmResult = await llm.write(...)`:

```ts
await telemetry.recordLlmUsage({
  sessionId: input.sessionId,
  turn: turnNumber,
  route: intent,
  model: llmResult.model,
  inputTokens: llmResult.usage.inputTokens,
  outputTokens: llmResult.usage.outputTokens,
  cachedTokens: llmResult.usage.cachedInputTokens,
  durationMs: llmResult.durationMs,
  messageId: input.messageId ?? null,
});
```

Then save canonical state and complete the same conversation row:

```ts
await conversations.saveState(input.sessionId, state);
await conversations.appendMessage(input.sessionId, 'assistant', llmResult.text, {
  messageId: input.messageId ?? null,
  requestId,
  conversationType: qa ? 'QA_LIVE' : null,
  model: llmResult.model,
});
```

Use `llmResult.text` for n8n payload and HTTP answer.

- [ ] **Step 4: Add debug metrics**

Return only non-secret usage and latency values. Never add raw OpenAI body, instructions or headers.

- [ ] **Step 5: Run focused integration + API tests**

```powershell
node --experimental-strip-types --test tests/integration/conversation-engine.test.ts tests/integration/http-api.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/types.ts backend/src/conversation/ConversationEngine.ts backend/src/bootstrap.ts backend/tests/integration/conversation-engine.test.ts backend/tests/integration/http-api.test.ts
git commit -m "feat(backend): expose and persist llm telemetry"
```

---

### Task 5: QA Identity + Frozen Scenario Model

**Files:**
- Create: `backend/qa/types.ts`
- Create: `backend/qa/id.ts`
- Create: `backend/qa/scenarios/core.ts`
- Create: `backend/tests/unit/qa-id.test.ts`

**Interfaces:**

```ts
export type QaExpected = {
  intent?: string;
  queryTarget?: string | null;
  activeProduct?: string | null;
  explicitSwitch?: boolean;
  budget?: number | null;
  answerMustContain?: string[];
  answerMustNotContain?: string[];
};

export type QaTurn = {
  message: string;
  expected?: QaExpected;
};

export type QaScenario = {
  id: string;
  family: 'TRUTH'|'REFERENCE'|'INTENT'|'COMMERCIAL'|'CLOSING'|'RELIABILITY';
  title: string;
  turns: QaTurn[];
};
```

ID functions:

```ts
export function createRunId(now = new Date(), entropy = crypto.randomUUID().slice(0, 4)): string;
export function createSessionId(runId: string, caseId: string): string;
export function createMessageId(runId: string, caseId: string, turnIndex: number): string;
```

Formatting:

```text
runId      qa-YYYYMMDD-HHmmss-xxxx
sessionId  <runId>-<caseId>
messageId  <runId>:<caseId>:t01
```

Initial frozen scenarios must include at least:
- `TRUTH-PRICE-X13`: `¿Cuánto cuesta el Armor X13?` -> `PRICE`, query target X13.
- `REF-RECOMMENDED`: budget declaration -> recommend within budget -> `¿y cuánto cuesta el recomendado?`.
- `REF-ATTRIBUTE-NO-SWITCH`: establish Armor 22 active -> `Prefiero la batería del Armor X13` -> no explicit product switch.
- `REF-OTHER-STORE`: active product -> `En otra tienda lo vi más barato` -> must not switch product.
- `INTENT-FRESHNESS`: price -> stock -> warranty sequence.
- `COMM-PRICE-OBJECTION`: price -> `Está caro, tengo máximo S/ 1000`.
- `CLOSE-SELECT`: recommendation -> `Me quedo con ese`.

- [ ] **Step 1: Write ID tests RED**

Assert stable regexes and deterministic `t01`, `t02` numbering.

- [ ] **Step 2: Implement types/id functions**

- [ ] **Step 3: Add scenario definitions**

Scenarios contain prompts and deterministic state expectations only; do not encode exact prose except verified numbers/names that are authoritative in the live response.

- [ ] **Step 4: Run test GREEN**

```powershell
node --experimental-strip-types --test tests/unit/qa-id.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/qa/types.ts backend/qa/id.ts backend/qa/scenarios/core.ts backend/tests/unit/qa-id.test.ts
git commit -m "feat(backend): define live qa scenarios and identity"
```

---

### Task 6: Hard + Commercial Evaluators

**Files:**
- Modify: `backend/qa/types.ts`
- Create: `backend/qa/evaluators/hard.ts`
- Create: `backend/qa/evaluators/commercial.ts`
- Create: `backend/tests/unit/qa-hard-evaluator.test.ts`
- Create: `backend/tests/unit/qa-commercial-evaluator.test.ts`

**Interfaces:**

```ts
export type QaFinding = {
  level: 'GREEN'|'YELLOW'|'RED';
  code: string;
  message: string;
};

export type QaTurnObservation = {
  request: { sessionId: string; messageId: string; message: string };
  response: any;
  roundTripMs: number;
};

export function evaluateHard(turn: QaTurn, observation: QaTurnObservation): QaFinding[];
export function evaluateCommercial(observation: QaTurnObservation): QaFinding[];
```

Hard evaluator rules:
- non-2xx/error-shaped response -> RED `HTTP_ERROR`.
- expected intent mismatch -> RED `INTENT_MISMATCH`.
- expected query target mismatch -> RED `QUERY_TARGET_MISMATCH`.
- expected active product mismatch -> RED `ACTIVE_PRODUCT_MISMATCH`.
- expected explicit switch mismatch -> RED `SWITCH_MISMATCH`.
- expected budget mismatch -> RED `BUDGET_MISMATCH`.
- required phrase absent -> RED `ANSWER_REQUIRED_EVIDENCE_MISSING`.
- forbidden phrase present -> RED `ANSWER_FORBIDDEN_CONTENT`.
- answer contains confident stock/price/warranty number when corresponding deterministic state/evidence is absent -> RED `UNSUPPORTED_NUMERIC_CLAIM`; implement conservatively so the evaluator does not flag unrelated common numbers such as product model names.

Commercial evaluator Phase 1 is advisory only:
- more than one `?` -> YELLOW `TOO_MANY_QUESTIONS`.
- answer length > 700 chars -> YELLOW `CHAT_TOO_LONG`.
- robot/meta phrases such as `como modelo de IA`, `según mi sistema interno`, `INTENT`, `queryTarget` -> YELLOW `ROBOTIC_META_LANGUAGE`.
- price objection response that immediately argues without acknowledging the concern -> YELLOW `EMPATHY_WEAK_PRICE_OBJECTION`; acknowledgement dictionary is limited to neutral phrases such as `entiendo`, `te resulta alto`, `se sale de tu presupuesto`, `busquemos una opción`.
- neutral direct price/stock answer is not penalized for lacking empathy.

- [ ] **Step 1: Write hard evaluator RED tests**

Cover intent mismatch, no-switch regression, and hard failure precedence.

- [ ] **Step 2: Implement hard evaluator minimally**

- [ ] **Step 3: Write commercial evaluator RED tests**

Cover too many questions, robotic meta-language, neutral direct-answer non-penalty, and price-objection acknowledgement.

- [ ] **Step 4: Implement commercial evaluator minimally**

- [ ] **Step 5: Run both suites GREEN**

```powershell
node --experimental-strip-types --test tests/unit/qa-hard-evaluator.test.ts tests/unit/qa-commercial-evaluator.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/qa/types.ts backend/qa/evaluators/hard.ts backend/qa/evaluators/commercial.ts backend/tests/unit/qa-hard-evaluator.test.ts backend/tests/unit/qa-commercial-evaluator.test.ts
git commit -m "feat(backend): add live qa evaluators"
```

---

### Task 7: Report Model + Secret-Safe Rendering

**Files:**
- Modify: `backend/qa/types.ts`
- Create: `backend/qa/report/render.ts`
- Create: `backend/tests/unit/qa-report.test.ts`
- Modify: `backend/.gitignore`

**Interfaces:**

Report object includes:

```ts
{
  runId,
  startedAt,
  baseUrl,
  modes,
  totals: { scenarios, turns, green, yellow, red },
  usage: { inputTokens, outputTokens, totalTokens, cachedInputTokens },
  latency: { averageRoundTripMs, averageLlmMs },
  scenarios: [...],
}
```

`renderMarkdown(report)` includes run ID, modes, counts, usage, latency, per-scenario findings, and Supabase session IDs.

Secret sanitizer must recursively replace values for keys matching case-insensitively:

```text
apiKey, apikey, authorization, token, password, serviceRoleKey, secret
```

with `[REDACTED]` before JSON or Markdown serialization.

- [ ] **Step 1: Write secret regression RED**

Build a synthetic report containing `authorization: 'Bearer abc'`, `token: 'abc'`, and nested `password: 'x'`; assert neither JSON nor Markdown contains those literal values.

- [ ] **Step 2: Implement sanitizer + renderer**

- [ ] **Step 3: Add `qa-results/` to `.gitignore`**

Append:

```text
qa-results/
```

- [ ] **Step 4: Run GREEN**

```powershell
node --experimental-strip-types --test tests/unit/qa-report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/qa/report/render.ts backend/qa/types.ts backend/tests/unit/qa-report.test.ts backend/.gitignore
git commit -m "feat(backend): render secret-safe qa reports"
```

---

### Task 8: Live HTTP QA Runner + `npm run qa:live`

**Files:**
- Create: `backend/scripts/qa-live.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/integration/qa-runner-http.test.ts`

**Interfaces:**

Environment:

```text
QA_BASE_URL=http://127.0.0.1:3000
QA_STRICT=false
```

Runner sequence:
1. GET `<base>/health`; abort with clear message if unreachable or non-200.
2. Create one run ID.
3. For each scenario, create one session ID.
4. Execute turns sequentially using POST `/api/chat` body `{sessionId,message,messageId}`.
5. Capture HTTP status, parsed response and round-trip latency.
6. Run hard and commercial evaluators.
7. Continue remaining cases even after RED unless transport/health makes execution impossible.
8. Aggregate token fields from `response.debug.llm`.
9. Write `qa-results/<runId>.json` and `.md` using the secret-safe renderer.
10. Print one line per scenario and final summary.
11. Exit code 1 only when `QA_STRICT=true` and at least one hard RED exists; otherwise exit 0 after reporting all failures.

- [ ] **Step 1: Write HTTP integration test RED**

Start a temporary native HTTP server in the test with:
- `/health` -> `{status:'ok',modes:{...}}`
- `/api/chat` -> deterministic response with state/debug

Invoke exported `runLiveQa({baseUrl, scenarios, writeReports:false})` and assert it makes HTTP calls, produces observations and does not import the backend engine.

- [ ] **Step 2: Implement runner as importable function + CLI entrypoint**

Export:

```ts
export async function runLiveQa(options: {
  baseUrl: string;
  scenarios?: QaScenario[];
  strict?: boolean;
  writeReports?: boolean;
}): Promise<QaRunReport>;
```

The bottom-level CLI reads env and sets `process.exitCode` from the report/strict mode.

- [ ] **Step 3: Add package script**

```json
"qa:live": "node --env-file-if-exists=.env --experimental-strip-types scripts/qa-live.ts"
```

- [ ] **Step 4: Run integration test GREEN**

```powershell
node --experimental-strip-types --test tests/integration/qa-runner-http.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/qa-live.ts backend/package.json backend/tests/integration/qa-runner-http.test.ts
git commit -m "feat(backend): add live http qa runner"
```

---

### Task 9: Documentation + Full Automated Verification

**Files:**
- Modify: `backend/docs/CONEXIONES-REALES.md`
- Modify: `backend/.env.example`

**Documentation content:**

Add:

```env
SUPABASE_TOKEN_METRICS_TABLE=ia_metricas_tokens
QA_BASE_URL=http://127.0.0.1:3000
QA_STRICT=false
```

Document two-terminal workflow:

```powershell
# terminal 1
npm start

# terminal 2
npm run qa:live
```

Document trace queries using the generated QA session id:

```sql
select session_id, canal, estado, fecha_inicio
from ia_sesiones
where session_id = '<qa-session-id>';

select session_id, ultima_intencion, presupuesto_activo, contexto, updated_by, updated_at
from ia_contexto
where session_id = '<qa-session-id>';

select session_id, message_id, request_id, mensaje_cliente, respuesta_bot,
       intencion, producto_detectado, presupuesto_detectado,
       cambio_producto_explicito, modelo, fecha
from ia_conversaciones
where session_id = '<qa-session-id>'
order by fecha;

select session_id, turno, nodo, ruta, modelo, tokens_entrada, tokens_salida,
       tokens_cacheados, duracion_ms, message_id, creado_en
from ia_metricas_tokens
where session_id = '<qa-session-id>'
order by creado_en;
```

- [ ] **Step 1: Update docs and `.env.example`**

Do not include real secrets or URLs containing tokens.

- [ ] **Step 2: Run full test suite**

```powershell
npm test
```

Expected: zero failing tests.

- [ ] **Step 3: Run build gate**

```powershell
npm run build
```

Expected: `BUILD CHECK PASS: módulos principales cargan correctamente en Node 22.`

- [ ] **Step 4: Run secret scan**

From repository root:

```powershell
git grep -n -E "(sk-[A-Za-z0-9_-]{20,}|service_role|Bearer [A-Za-z0-9._-]{20,}|SQL_SERVER_PASSWORD=.*[^R])" -- ':!backend/.env.example' ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'
```

Expected: no newly committed real secret values. Review any match manually before proceeding.

- [ ] **Step 5: Commit**

```bash
git add backend/docs/CONEXIONES-REALES.md backend/.env.example
git commit -m "docs(backend): document live qa telemetry workflow"
```

---

### Task 10: Live Baseline Freeze on the User's Running Backend

**Files generated locally only:**
- `backend/qa-results/<runId>.json`
- `backend/qa-results/<runId>.md`

**Prerequisites:**

Terminal 1 must show:

```text
Modes: LLM=openai ERP=sql-bridge Persistence=supabase n8n=n8n
```

`RAG_MODE` remains disabled.

- [ ] **Step 1: Start backend**

```powershell
npm start
```

- [ ] **Step 2: Run live QA from second terminal**

```powershell
npm run qa:live
```

- [ ] **Step 3: Inspect report without changing commercial behavior**

Record:
- total scenarios/turns;
- GREEN/YELLOW/RED counts;
- hard failure families;
- commercial YELLOW findings;
- total and average tokens;
- LLM and round-trip latency;
- generated QA session IDs.

- [ ] **Step 4: Verify one scenario physically in Supabase**

Use the four documented queries and confirm:
- session row exists with QA channel marker;
- canonical context matches returned state for key fields;
- conversation row has `message_id`, `request_id`, client and bot text;
- token metric row has actual model/usage/latency.

- [ ] **Step 5: Freeze baseline**

Do not modify commercial logic during this step. The saved report becomes the Phase 2 BEFORE evidence. If the runner itself has a defect, fix the runner/evaluator and rerun before declaring the baseline frozen.

---

## Plan Self-Review

### Spec coverage

- Live external HTTP runner: Task 8.
- Unique run/session/message identity: Task 5.
- Existing Supabase tables only: Tasks 2–4.
- Message durability before LLM: Task 3 + existing process order preserved in Task 4.
- OpenAI token/model/latency capture: Task 1.
- `ia_metricas_tokens`: Task 2.
- Non-secret debug telemetry: Task 4.
- GREEN/YELLOW/RED hard/soft split: Task 6.
- Secret-safe reports: Task 7.
- JSON/Markdown outputs: Tasks 7–8.
- Initial multi-turn scenario families: Task 5.
- `npm run qa:live`: Task 8.
- Full tests/build: Task 9.
- Baseline before commercial changes: Task 10.
- RAG excluded: Global Constraints + Task 10 prerequisites.
- No production n8n changes: Global Constraints.

### Placeholder scan

No `TBD`, `TODO`, unspecified implementation steps, or undefined neighboring interfaces remain in this plan.

### Type consistency

- `LlmResult` is produced by Task 1 and consumed by Task 4.
- `TelemetryRepository` is produced by Task 2 and consumed by Task 4/bootstrap.
- `ConversationMessageMeta` is produced by Task 3 and consumed by Task 4.
- `QaScenario/QaTurn/QaFinding/QaTurnObservation` are produced in Tasks 5–6 and consumed by Tasks 7–8.
- `QaRunReport` is completed in Task 7 and returned by `runLiveQa()` in Task 8.

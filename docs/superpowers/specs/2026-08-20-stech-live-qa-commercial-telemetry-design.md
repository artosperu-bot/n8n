# STECH Live QA + Commercial Quality + Telemetry — Design

Date: 2026-08-20
Branch: `feat/stech-backend`
Status: DESIGN APPROVED IN CHAT; implementation requires review of this written spec.

## 1. Goal

Create a repeatable live QA system for the STECH backend that exercises the same HTTP API used by real clients while `npm start` is running, stores QA sessions cleanly in the existing Supabase schema, measures token/cost-relevant telemetry, and evaluates both deterministic correctness and commercial conversation quality.

The system must help identify general root causes. It must not encourage per-phrase patches or optimize one case by breaking another.

## 2. Current baseline

The backend already has these runtime paths:

- OpenAI via `OpenAIProvider` using the Responses API.
- ERP truth via `sql-bridge` and `dbo.sp_BuscarProductosVenta`.
- Persistent conversation state in Supabase.
- Canonical state in `ia_contexto.contexto`.
- Turn history in `ia_conversaciones`.
- Session rows in `ia_sesiones`.
- n8n event delivery as a separate, non-authoritative integration.
- RAG remains disabled until its real embedding/RPC contract is adapted.

Current important gaps for this design:

- LLM usage/tokens are discarded by `OpenAIProvider` because the port returns only text.
- `ChatTurnResult.debug` does not expose enough QA evidence/telemetry to diagnose factual or latency failures.
- There is no reusable live conversation runner.
- There is no consistent GREEN/YELLOW/RED rubric for commercial behavior.
- Current SPIN/NBA state is partial; the QA baseline must expose these gaps before changing commercial behavior.

## 3. Non-goals for Phase 1

Phase 1 will NOT:

- redesign the whole commercial engine;
- enable Supabase RAG;
- modify production n8n workflows;
- create hard-coded responses for individual phrases;
- fabricate social proof, scarcity, urgency, stock, price, warranty, capability, or product facts;
- add a second source of conversational truth beside the canonical state.

Phase 1 measures first. Commercial improvements happen only after a frozen baseline exists.

## 4. Runtime workflow

Two terminals are used during development:

```text
Terminal 1
npm start

Terminal 2
npm run qa:live
```

`qa:live` sends real HTTP requests to:

```text
POST http://127.0.0.1:3000/api/chat
```

The runner is an external client of the backend. It must not import `ConversationEngine` directly, because the goal is to test the complete live path: HTTP → state → SQL bridge → OpenAI → Supabase → n8n event attempt → HTTP response.

## 5. QA session identity and Supabase storage

### 5.1 Run identity

Every QA execution gets one `runId`, for example:

```text
qa-20260820-191530-a7f2
```

Every scenario gets a separate session:

```text
<runId>-<caseId>
```

Example:

```text
qa-20260820-191530-a7f2-REF-004
```

Every turn gets a deterministic `messageId`:

```text
<runId>:<caseId>:t01
<runId>:<caseId>:t02
```

This allows a failed case to be traced across backend responses, Supabase rows, token metrics and n8n events.

### 5.2 Existing Supabase tables

No new QA database tables are required in Phase 1.

Use the existing schema:

- `ia_sesiones`: one session row per QA scenario.
- `ia_contexto`: canonical current state for that scenario.
- `ia_conversaciones`: one persisted turn per user/assistant exchange.
- `ia_metricas_tokens`: one row per OpenAI generation call.

QA sessions should be distinguishable from real conversations without changing the canonical state contract. The persistence adapter will recognize the `qa-` session prefix and use a QA-specific channel/source marker where the existing schema permits it, for example `canal='qa_live'`, while normal backend sessions keep their normal source.

Where available, persist:

- `message_id` = deterministic QA turn id;
- `request_id` = `runId`;
- `tipo_conversacion` = `QA_LIVE`;
- `modelo` = actual model name used;
- intent/product/budget projections already produced by the backend.

The canonical conversation state remains in `ia_contexto.contexto`; QA metadata must not replace or fork that state.

### 5.3 Failure durability

The user's message must be persisted before calling external generation dependencies. If OpenAI fails after the message arrives, the conversation row remains with a null/empty bot response and can be diagnosed later.

A successful assistant response completes the same turn row rather than creating an unrelated second conversation row.

## 6. LLM result and token telemetry

### 6.1 Port contract

Change `LlmProvider.write()` from returning only `string` to returning a structured result:

```ts
type LlmResult = {
  text: string;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedInputTokens?: number | null;
  };
  durationMs: number;
};
```

Fake/test LLMs return deterministic usage values suitable for tests. The production OpenAI adapter maps the actual usage fields returned by the Responses API.

### 6.2 Telemetry persistence

Introduce a separate telemetry port rather than mixing token concerns into the conversation repository:

```text
TelemetryRepository
  recordLlmUsage(...)
```

Implementations:

- `SupabaseTelemetryRepository` → inserts into `ia_metricas_tokens`.
- `NoopTelemetryRepository` → used in isolated tests or when telemetry is explicitly disabled.

A metrics row should include, where available:

- `session_id`
- `turno`
- `nodo = 'OpenAIProvider'`
- `ruta` / intent
- `modelo`
- `tokens_entrada`
- `tokens_salida`
- `tokens_cacheados`
- `duracion_ms`
- `message_id`

`conversacion_id` may remain null in Phase 1 if linking it would require coupling the conversation persistence contract to telemetry. Session + turn + messageId are sufficient for traceability.

### 6.3 HTTP debug telemetry

The normal answer remains user-oriented. The `debug` object may include non-secret metrics such as:

```json
{
  "llm": {
    "model": "...",
    "inputTokens": 123,
    "outputTokens": 47,
    "totalTokens": 170,
    "durationMs": 812
  },
  "totalDurationMs": 1045
}
```

Never expose API keys, bearer tokens, Supabase keys, SQL credentials, raw authorization headers, or hidden prompts.

## 7. QA runner architecture

Add a script invoked by:

```text
npm run qa:live
```

Suggested files:

```text
backend/scripts/qa-live.ts
backend/qa/scenarios/*.ts
backend/qa/evaluators/*.ts
backend/qa/report/*.ts
backend/qa-results/            # generated, gitignored
```

The runner should:

1. verify `/health` first;
2. create a unique runId;
3. execute scenarios sequentially by default to make state/replay diagnosis simple;
4. keep one session per scenario;
5. send a deterministic messageId on every turn;
6. capture response, state, debug and round-trip latency;
7. evaluate hard and soft criteria;
8. write a machine-readable JSON report and human-readable Markdown summary;
9. print a compact terminal table;
10. exit non-zero only for hard RED failures when `QA_STRICT=true`; default developer mode may finish the entire suite before exiting so all failures are visible.

Generated QA reports must not contain secrets.

## 8. Evaluation model

Use three levels:

- **GREEN** — required behavior demonstrated.
- **YELLOW** — usable but commercially/linguistically weak, ambiguous, inefficient or not yet measurable enough for a hard fail.
- **RED** — factual, state, safety, routing or contract violation.

Do not allow a soft style score to override a hard factual RED.

### 8.1 Hard deterministic gates

Examples:

- HTTP response succeeds.
- Price/stock answers use authoritative ERP evidence.
- No invented numeric price/stock/warranty/capability.
- `UNKNOWN` is not transformed into false certainty.
- `queryTarget`, `activeProduct`, `recommendedProduct`, `explicitSwitch`, `budget`, `lastIntent` and `lastNba` evolve according to the contract.
- stale intent does not override the explicit current question.
- mention of another product does not automatically switch the active product.
- explicit preference/switch does switch when intended.
- reference words such as `ese`, `el recomendado`, `el otro` resolve to the correct referent in context.
- a n8n event failure does not erase a successful turn when n8n is non-strict.
- persisted Supabase state after a turn matches the returned canonical state for key fields.

### 8.2 Commercial quality soft gates

These are scored separately from factual correctness.

**SPIN / discovery**

- recognizes situation/problem/implication/need-payoff information already given;
- does not ask the same discovery question again;
- asks at most one useful question when a question is needed;
- does not interrogate when the user asked a direct price/stock question;
- uses discovered facts later instead of discarding them.

**Empathy**

- acknowledges a real concern before counter-arguing when appropriate;
- does not use canned sympathy for neutral questions;
- sounds natural in Peruvian Spanish;
- avoids robotic meta-language.

**Responsible persuasive selling / neuroventas**

- frames verified features as customer benefits tied to the expressed need;
- reduces cognitive load with clear choices;
- uses contrast only when evidence supports it;
- never invents scarcity, social proof, urgency or fear;
- avoids coercion and dark-pattern pressure.

**N+1 / Next Best Action**

For this project, N+1 is treated as the next useful commercial action represented by the existing NBA concept unless a future specification defines a different meaning.

Evaluate whether the response advances exactly one useful step: clarify, recommend, resolve objection, confirm choice, close, hand off, etc., without jumping several stages.

**Naturalness / non-robotic style**

- avoids repeated templates across adjacent turns;
- avoids excessive headings/list formatting in chat answers;
- avoids generic closings when a concrete next action exists;
- concise enough for messaging channels.

### 8.3 Token/efficiency gates

Report per turn and per scenario:

- input tokens;
- output tokens;
- total tokens;
- cached tokens when available;
- LLM latency;
- end-to-end latency.

Phase 1 records thresholds as advisory YELLOW limits, not hard RED, until a real baseline distribution is measured.

## 9. Initial scenario families

The first live suite should include multi-turn cases, not only one-shot prompts.

### A. Truth / ERP

- price of named product;
- stock of named product;
- budget recommendation using live prices;
- unknown/nonexistent product;
- price objection without fabricating a budget.

### B. Reference and active-product continuity

- `¿y cuánto cuesta ese?`;
- `precio del recomendado`;
- `me quedo con ese`;
- `el otro` during a comparison;
- `Prefiero la batería del X` must not be treated like `Prefiero el X`;
- mention of `otra tienda` must not be interpreted as `otro producto`.

### C. Intent freshness

- price → stock → warranty sequence;
- stale budget intent followed by a direct product question;
- `Ya entendí` should not be treated as a new use context.

### D. SPIN / empathy / objection

- user explains work environment and pain point;
- user says price is high;
- user is worried about durability;
- user needs a device for a worker/team;
- user is undecided between two options.

### E. Closing / next action

- purchase signal;
- `me quedo con ese`;
- request to continue purchase;
- ambiguity that should cause one clarification rather than an invented assumption.

### F. Reliability / persistence

- same session across multiple turns;
- restart backend and continue a persisted session;
- n8n event 500 with non-strict mode;
- Supabase row/state verification.

## 10. General-fix workflow

The QA runner exists to support root-cause engineering, not score chasing.

For every RED family:

1. freeze the failing transcript and returned state;
2. classify the loss family: intent, reference, state reduction, ERP evidence, LLM writing, persistence, telemetry, automation, or commercial policy;
3. identify the earliest incorrect state transition;
4. write or update a focused regression reproducing the general rule;
5. fix the responsible module, not the individual phrase;
6. run focused tests;
7. run full `npm test` and build;
8. rerun the entire live suite;
9. compare BEFORE → AFTER, including tokens and commercial quality;
10. reject a fix if it improves one case by degrading unrelated GREEN cases.

## 11. Reports

Each `qa:live` run writes:

```text
backend/qa-results/<runId>.json
backend/qa-results/<runId>.md
```

The Markdown summary should include:

- runId and timestamp;
- backend modes;
- total scenarios/turns;
- GREEN/YELLOW/RED counts;
- hard failure families;
- commercial quality scores;
- token totals and averages;
- latency totals/percentiles where practical;
- links/ids needed to find the corresponding Supabase sessions;
- concise recommended next root-cause investigations.

Do not automatically modify production logic based on QA results.

## 12. Testing strategy

Implementation follows TDD.

Required automated coverage:

- OpenAI usage mapping;
- fake LLM structured usage contract;
- token telemetry persistence payload;
- QA session/message id generation;
- hard evaluators for state/reference/truth rules;
- soft evaluator scoring boundaries;
- report serialization;
- QA runner HTTP error behavior;
- no-secret report regression;
- existing backend test suite remains green.

Live QA is an additional gate; it does not replace unit/integration tests.

## 13. Implementation phases

### Phase 1A — Observability contracts

- structured LLM result;
- token usage + durations;
- `TelemetryRepository` and Supabase metrics writer;
- non-secret debug telemetry;
- QA metadata persistence where supported by existing columns.

### Phase 1B — Live QA runner

- scenario model;
- HTTP runner;
- deterministic evaluators;
- soft commercial evaluators;
- JSON/Markdown reports;
- `npm run qa:live`.

### Phase 1C — Baseline freeze

Run the full live suite without changing commercial behavior. Save baseline counts and identify failure families.

### Phase 2 — Commercial engine improvements

Only after the baseline:

- richer SPIN state;
- empathy policy;
- objection strategy;
- responsible benefit framing;
- N+1/NBA policy;
- close/handoff behavior;
- natural-language style constraints.

Every Phase 2 change must prove BEFORE → AFTER against the same frozen live scenarios plus unit regressions.

### Phase 3 — RAG integration

Separate scope. Adapt the real embedding generation and Supabase RPC contract, then add capability/warranty truth cases to the live suite.

## 14. Acceptance criteria for Phase 1

Phase 1 is complete only when:

- `npm test` passes with zero failures;
- `npm run build` passes;
- `npm start` works with the current real adapters;
- a second terminal can run `npm run qa:live` against the live backend;
- QA sessions are traceable in `ia_sesiones`, `ia_contexto` and `ia_conversaciones`;
- OpenAI token/latency metrics appear in `ia_metricas_tokens`;
- reports contain no secrets;
- at least the initial scenario families execute to completion;
- baseline GREEN/YELLOW/RED results are recorded without hiding current commercial weaknesses;
- no production n8n activation/publication is required.

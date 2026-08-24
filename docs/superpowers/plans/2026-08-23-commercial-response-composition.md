# STECH Commercial Response Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FULL RAG and other grounded commercial routes produce persuasive, empathetic, evidence-grounded sales responses by reusing the existing canonical commercial contract, exact NBA, OpenAI writer, and WriterGuard without changing SQL/RAG/memory/concurrency authorities.

**Architecture:** Reuse `prepareCommercialWriteInput()` as the bounded commercial context projection already present in the codebase. Add one finite deterministic `CommercialResponsePlan`, attach it to `LlmWriteInput`, keep `FullRagAnswerKernel` as immutable factual core, selectively delegate contextual modes to the existing `OpenAIProvider`, and retain `WriterGuard.safeWrite()` as final safety/fallback. Direct factual modes remain deterministic, so this change adds commercial quality without creating a second memory, a second factual authority, or independent n8n sales agents.

**Tech Stack:** Node.js >=22.16, TypeScript executed with Node experimental strip-types, native `node:test`, OpenAI Responses API, existing SQL/RAG/Supabase adapters and existing local QA runner.

**Spec:** `docs/superpowers/specs/2026-08-23-commercial-response-composition-memory-design.md`

## Global Constraints

- SQL/ERP remains the dynamic authority for product identity, price, stock, availability, images and operational data.
- Product RAG remains the authority for documented product specifications/capabilities; institutional RAG remains the authority for policies.
- `ia_contexto.contexto` remains the single accumulated canonical commercial memory; `ia_conversaciones` remains the per-turn audit record.
- P0 concurrency `Acquire -> Renew -> Persist -> Release` remains frozen.
- No n8n production workflow change, activation, publication or production mutation is part of this work.
- No Supabase DDL, new table, migration, re-embedding or schema change is required for the first version.
- Current explicit intent outranks historical state and stale N+1.
- `FullRagAnswerKernel` factual output and verified SQL/RAG facts are immutable from the commercial writer's perspective.
- `UNKNOWN` remains `UNKNOWN`; commercial language cannot upgrade it to supported/unsupported.
- Maximum one useful customer question in a response; zero when no question changes the decision or next step.
- Never invent price, stock, capability, promotion, scarcity, urgency, social proof, purchase probability, emotional state or unsupported performance.
- `finalExecutableNba` / `executableNba` is the only authority for the action/CTA that may be verbalized.
- Direct isolated factual turns bypass the LLM when contextual composition does not add justified commercial value.
- LLM/composer failure must return the grounded deterministic answer instead of retrying into hallucination.
- Do not hardcode product names, prices or QA phrases as special-case fixes.
- Technical tests and build run locally; conversational QA runs locally through the HTTP boundary with fresh session/message IDs, never through GitHub Actions.
- Automated QA may certify deterministic truth/continuity/action contracts; final naturalness, empathy and persuasion quality remain human-review dimensions.

## Existing Implementation to Reuse

The implementation must reuse these existing owners rather than create parallel abstractions:

- `backend/src/conversation/commercial/CommercialWriteContract.ts` — `prepareCommercialWriteInput()` already projects canonical state, verified facts, customer context, commercial move, exact executable NBA and supported actions.
- `backend/src/conversation/commercial/FullRagAnswerKernel.ts` — existing deterministic FULL RAG factual core.
- `backend/src/adapters/openai/OpenAIProvider.ts` — existing customer-facing commercial composer/writer.
- `backend/src/conversation/writer/WriterGuard.ts` — existing generated-answer validation, NBA execution and deterministic fallback.
- `backend/src/conversation/commercial/ResponsePolicy.ts` — existing safe deterministic commercial rendering and contextual benefit helpers.
- `backend/src/conversation/nba/PostAnswerCommercialProgression.ts` — existing deterministic N+1/progression authority; do not duplicate it inside the response planner.
- `backend/src/conversation/state/StateReducer.ts` — existing state/product/stage continuity authority; do not move response-planning behavior into it.

The only new production module introduced by this plan is the finite response-plan selector.

---

### Task 1: Add the finite `CommercialResponsePlan` contract and selector

**Files:**
- Modify: `backend/src/ports/LlmProvider.ts`
- Create: `backend/src/conversation/commercial/CommercialResponsePlan.ts`
- Create: `backend/tests/unit/commercial-response-plan.test.ts`

**Interfaces:**
- Consumes: `LlmWriteInput` after `prepareCommercialWriteInput()` plus a grounded `factualCore: string`.
- Produces: `buildCommercialResponsePlan(input: LlmWriteInput, factualCore: string): CommercialResponsePlan`.
- Adds to `LlmWriteInput`: `commercialResponsePlan?: CommercialResponsePlan | null`.

Use these exact types in `LlmProvider.ts`:

```ts
export type CommercialResponseMode =
  | 'FACTUAL_DIRECT'
  | 'DISCOVERY_SPIN'
  | 'CONTEXTUAL_FAB'
  | 'GUIDED_CHOICE'
  | 'OBJECTION_LAER'
  | 'SOFT_CLOSE'
  | 'PURCHASE_PROGRESS'
  | 'HANDOFF';

export type CommercialResponsePlan = {
  mode: CommercialResponseMode;
  strategy: string | null;
  shouldUseLlm: boolean;
  acknowledgeContext: boolean;
  contextFocus: string[];
  factualCore: string;
  exactNba: string;
  maxQuestions: 0 | 1;
  allowedActions: string[];
  forbiddenClaims: string[];
};
```

The selector must be finite and code-owned. It must not call an LLM and must not create a new NBA. Its priority is:

```ts
HANDOFF
PURCHASE_PROGRESS
OBJECTION_LAER
GUIDED_CHOICE
DISCOVERY_SPIN
SOFT_CLOSE
CONTEXTUAL_FAB
FACTUAL_DIRECT
```

Decision rules:

```ts
const intent = String(input.resolvedCurrentIntent ?? input.intent ?? '').toUpperCase();
const strategy = String(input.state?.commercialStrategy ?? '').toUpperCase();
const exactNba = String(input.finalExecutableNba ?? input.executableNba ?? input.nextBestAction ?? 'ANSWER_ONLY').toUpperCase();
const hasContext = Boolean(input.useCase || input.problem || (input.priorities?.length ?? 0) > 0 || input.objection);
const hasContextualMove = input.commercialMove?.kind === 'CONTEXTUAL_BENEFIT';
```

Mode rules:

- `HANDOFF` when exact NBA is `ASSISTED_HANDOFF` or handoff is already authoritative in state.
- `PURCHASE_PROGRESS` when purchase signal/current intent is `PURCHASE` or exact NBA is `COLLECT_RESERVATION_DATA` / `EXECUTE_RESERVATION`.
- `OBJECTION_LAER` when intent is `HANDLE_PRICE_OBJECTION`, strategy is `LAER`, or an explicit objection exists.
- `GUIDED_CHOICE` when intent is `COMPARE` or strategy is `ELECCION_GUIADA`.
- `DISCOVERY_SPIN` only when exact NBA is `ASK_MISSING_FACT`.
- `SOFT_CLOSE` only when exact NBA is exactly `SOFT_CLOSE`.
- `CONTEXTUAL_FAB` when there is a verified `CONTEXTUAL_BENEFIT` commercial move, or verified features plus genuine customer context in `FAB_SPIN` routes.
- Otherwise `FACTUAL_DIRECT`.

`shouldUseLlm` must be `false` for `FACTUAL_DIRECT` and safe deterministic `HANDOFF`; it may be `true` for contextual modes. `maxQuestions` is `1` only when the exact NBA itself requires/allows a question (`ASK_MISSING_FACT`, `SOFT_CLOSE`, or a supported purchase-data step); otherwise `0`.

`contextFocus` is a bounded deduplicated list from `useCase`, `problem`, priorities and objection. It is context for wording, never factual product evidence.

`forbiddenClaims` must always include these semantic categories:

```ts
[
  'UNVERIFIED_FACT',
  'FAKE_SCARCITY',
  'FAKE_URGENCY',
  'INVENTED_SOCIAL_PROOF',
  'UNSUPPORTED_PERFORMANCE',
  'UNAUTHORIZED_ACTION',
]
```

- [ ] **Step 1: Write the failing selector tests**

Create `backend/tests/unit/commercial-response-plan.test.ts` with focused cases:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialResponsePlan } from '../../src/conversation/commercial/CommercialResponsePlan.ts';

const base = {
  message: 'consulta', intent: 'CAPABILITY', state: { activeProduct: 'Armor 22' },
  directAnswer: 'Respuesta verificada.', verifiedFacts: [], commercialContractPrepared: true,
} as any;

test('isolated factual capability remains deterministic', () => {
  const plan = buildCommercialResponsePlan({ ...base, finalExecutableNba: 'ANSWER_ONLY' }, 'Sí, tiene NFC.');
  assert.equal(plan.mode, 'FACTUAL_DIRECT');
  assert.equal(plan.shouldUseLlm, false);
  assert.equal(plan.maxQuestions, 0);
});

test('verified customer context selects contextual FAB', () => {
  const plan = buildCommercialResponsePlan({
    ...base,
    state: { activeProduct: 'Armor 22', commercialStrategy: 'FAB_SPIN' },
    useCase: 'trabajo en construcción', problem: 'caídas frecuentes', priorities: ['resistencia'],
    commercialMove: {
      action: 'RELATED_VALUE', kind: 'CONTEXTUAL_BENEFIT', targetProduct: 'Armor 22', intensity: 'LIGHT',
      reason: 'VERIFIED_FEATURE_WITH_CUSTOMER_CONTEXT', basis: ['VERIFIED_PRODUCT_FEATURE','CUSTOMER_CONTEXT'],
      attribute: 'RESISTENCIA', verifiedFacts: [{ domain:'PRODUCT_RAG', key:'RESISTENCIA_CAIDAS', value:'1.5 m' }],
      relevantCustomerContext: { useCase:'trabajo en construcción', problem:'caídas frecuentes', priorities:['resistencia'], budget:null, objection:null },
    },
    finalExecutableNba: 'RELATED_VALUE',
  } as any, 'Resistencia a caídas: 1.5 m.');
  assert.equal(plan.mode, 'CONTEXTUAL_FAB');
  assert.equal(plan.shouldUseLlm, true);
  assert.equal(plan.acknowledgeContext, true);
  assert.equal(plan.maxQuestions, 0);
});

test('only an executable missing fact opens SPIN discovery', () => {
  const plan = buildCommercialResponsePlan({ ...base, finalExecutableNba:'ASK_MISSING_FACT', missingFact:'prioridad' }, 'Te explico lo confirmado.');
  assert.equal(plan.mode, 'DISCOVERY_SPIN');
  assert.equal(plan.maxQuestions, 1);
});

test('comparison uses guided choice', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'COMPARE', resolvedCurrentIntent:'COMPARE', finalExecutableNba:'COMPARE' }, 'A frente a B.');
  assert.equal(plan.mode, 'GUIDED_CHOICE');
});

test('price objection uses LAER', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'HANDLE_PRICE_OBJECTION', objection:'precio', finalExecutableNba:'OFFER_ALTERNATIVE' }, 'El precio es el confirmado.');
  assert.equal(plan.mode, 'OBJECTION_LAER');
});

test('purchase signal cannot restart discovery', () => {
  const plan = buildCommercialResponsePlan({ ...base, intent:'PURCHASE', purchaseSignal:true, finalExecutableNba:'COLLECT_RESERVATION_DATA' }, 'Continuemos con la compra.');
  assert.equal(plan.mode, 'PURCHASE_PROGRESS');
  assert.notEqual(plan.mode, 'DISCOVERY_SPIN');
});

test('soft close exists only when exact NBA authorizes it', () => {
  assert.equal(buildCommercialResponsePlan({ ...base, finalExecutableNba:'SOFT_CLOSE' }, 'Respuesta.').mode, 'SOFT_CLOSE');
  assert.notEqual(buildCommercialResponsePlan({ ...base, finalExecutableNba:'ANSWER_ONLY' }, 'Respuesta.').mode, 'SOFT_CLOSE');
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run from `backend`:

```powershell
node --experimental-strip-types --test tests/unit/commercial-response-plan.test.ts
```

Expected: failure because `CommercialResponsePlan.ts` does not exist.

- [ ] **Step 3: Add the types and minimal deterministic selector**

Implement the exact types above in `LlmProvider.ts`, add the optional `commercialResponsePlan` field to `LlmWriteInput`, then implement `buildCommercialResponsePlan()` with only the finite rules defined in this task. Do not call `evaluatePostAnswerCommercialProgression()` from the selector; it consumes the already-authorized NBA instead of creating one.

- [ ] **Step 4: Run selector tests GREEN plus contract-adjacent tests**

```powershell
node --experimental-strip-types --test tests/unit/commercial-response-plan.test.ts tests/unit/final-executable-nba.test.ts tests/unit/post-answer-commercial-progression.test.ts
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/ports/LlmProvider.ts backend/src/conversation/commercial/CommercialResponsePlan.ts backend/tests/unit/commercial-response-plan.test.ts
git commit -m "feat(backend): add commercial response plan"
```

---

### Task 2: Selectively compose FULL RAG responses instead of always returning the kernel directly

**Files:**
- Modify: `backend/src/conversation/commercial/FullRagLlmProvider.ts`
- Modify: `backend/tests/unit/full-rag-final-composition.test.ts`
- Modify: `backend/tests/unit/full-rag-commercial-language.test.ts`

**Interfaces:**
- Consumes: prepared `LlmWriteInput`, `buildFullRagAnswer()`, `buildCommercialResponsePlan()`.
- Produces: factual direct kernel output without LLM for `FACTUAL_DIRECT`; bounded delegate call for contextual plans; unchanged `LlmResult` contract.

Target kernel branch:

```ts
if (kernel) {
  const factualCore = humanizeKernel(kernel.answer, enriched);
  const plannedInput: LlmWriteInput = {
    ...enriched,
    directAnswer: factualCore,
    deterministicAnswer: factualCore,
  };
  plannedInput.commercialResponsePlan = buildCommercialResponsePlan(plannedInput, factualCore);
  Object.assign(input, plannedInput);

  if (!plannedInput.commercialResponsePlan.shouldUseLlm) {
    return deterministicResult(factualCore, `full-rag-kernel-${kernel.mode.toLowerCase()}`);
  }

  const result = await this.#delegate.write(plannedInput);
  return {
    ...result,
    text: humanizeKernel(sanitize(result.text, plannedInput), plannedInput),
  };
}
```

Do not change `buildFullRagAnswer()` extraction/parsing logic. `factualCore` stays immutable input truth; the delegate is allowed to rephrase/contextualize it but not replace its facts.

- [ ] **Step 1: Add failing FULL RAG routing tests**

Extend `full-rag-final-composition.test.ts` with a spy provider and tests that prove:

```ts
let calls = 0;
let received:any = null;
const delegate = {
  async write(input:any) {
    calls += 1;
    received = input;
    return { text:'Respuesta comercial contextual.', model:'fake', usage:{inputTokens:1,outputTokens:1,totalTokens:2,cachedInputTokens:0}, durationMs:1 };
  }
};
```

Required cases:

1. `CAPABILITY` + NFC + `ANSWER_ONLY` -> delegate calls remain `0`.
2. Construction + drops + verified resistance + `CONTEXTUAL_BENEFIT` -> delegate called exactly once; `received.directAnswer` equals the grounded kernel answer and `received.commercialResponsePlan.mode === 'CONTEXTUAL_FAB'`.
3. `COMPARE` -> `GUIDED_CHOICE` plan reaches delegate when the kernel has a comparison answer.
4. `SOFT_CLOSE` appears only when the input's final executable NBA is `SOFT_CLOSE`; an `ANSWER_ONLY` turn never gains a stock question merely because customer context exists.

- [ ] **Step 2: Run FULL RAG focused tests and confirm RED**

```powershell
node --experimental-strip-types --test tests/unit/full-rag-final-composition.test.ts tests/unit/full-rag-commercial-language.test.ts
```

Expected: new spy assertions fail because current kernel branch returns before the delegate.

- [ ] **Step 3: Implement the selective kernel branch**

Import `buildCommercialResponsePlan` and apply the target branch above. Preserve current `usesDocumentaryRag()` handling outside kernel routes. Do not change SQL/RAG routing, retrieval sections, product resolution or kernel evidence parsing.

- [ ] **Step 4: Verify failure safety through `safeWrite()`**

Add a test using a delegate whose `write()` throws and call through the existing `safeWrite()` boundary. Assert the answer still contains the grounded kernel fact and contains no invented fact/action. The expected fallback must be the deterministic factual core, not a generic sales sentence.

- [ ] **Step 5: Run FULL RAG and writer-adjacent tests GREEN**

```powershell
node --experimental-strip-types --test tests/unit/full-rag-final-composition.test.ts tests/unit/full-rag-commercial-language.test.ts tests/unit/full-rag-capability-bundle.test.ts tests/unit/commercial-writer-guardrails.test.ts
```

Expected: zero failures.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/src/conversation/commercial/FullRagLlmProvider.ts backend/tests/unit/full-rag-final-composition.test.ts backend/tests/unit/full-rag-commercial-language.test.ts
git commit -m "feat(backend): compose contextual full rag answers"
```

---

### Task 3: Make the existing OpenAI writer obey the response plan explicitly

**Files:**
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/tests/unit/openai-writer-evidence-boundary.test.ts`
- Create: `backend/tests/unit/openai-commercial-response-plan.test.ts`

**Interfaces:**
- Consumes: `LlmWriteInput.commercialResponsePlan`, immutable `directAnswer`, verified facts, exact NBA and bounded customer context.
- Produces: the same `LlmResult`; no new model call or API endpoint.

Add `commercialResponsePlan` to the JSON object passed inside `CONTRATO_COMERCIAL` in `OpenAIProvider.write()`.

Add these rules to the existing writer instructions without removing current factual guardrails:

```text
COMMERCIAL_RESPONSE_PLAN is an internal communication plan, not a source of product facts.
RESPUESTA_DIRECTA and VERIFICADOS remain factual authority; never alter their numbers, price, stock or capability truth.
FACTUAL_DIRECT: answer the current fact and finish; no discovery, generic empathy opener or extra CTA.
CONTEXTUAL_FAB: acknowledge the known use/problem/priority only when it changes the recommendation criterion; connect a verified feature to a safe practical effect and customer benefit.
GUIDED_CHOICE: use 2-4 decision-relevant contrasts, weight known priorities, and recommend only when evidence supports a winner.
OBJECTION_LAER: acknowledge the real objection before explaining value or an authorized alternative; do not become defensive.
DISCOVERY_SPIN: ask exactly one missing fact only when the plan allows one; never repeat known context.
SOFT_CLOSE and PURCHASE_PROGRESS: do not restart discovery; execute only EXECUTABLE_NBA and at most one supported next step.
Empathy means demonstrating that customer context changed the criterion, not parroting the customer sentence.
Ethical neuroventas means reducing decision effort/uncertainty with verified evidence and relevant contrast; never fabricate scarcity, urgency, popularity, social proof, performance or pressure.
Never expose response-mode names or internal sales-technique labels to the customer.
```

- [ ] **Step 1: Write a failing request-payload test**

Create `openai-commercial-response-plan.test.ts` with a fetcher spy. Call `OpenAIProvider.write()` using a `CONTEXTUAL_FAB` plan and assert `body.input` includes a serialized `commercialResponsePlan`, the immutable direct answer, verified evidence and exact NBA.

Example core assertions:

```ts
assert.match(body.input,/CONTEXTUAL_FAB/);
assert.match(body.input,/Resistencia a caídas: 1\.5 m/);
assert.match(body.input,/RELATED_VALUE/);
assert.doesNotMatch(body.input,/dato crudo interno/i);
```

Also assert the instruction string contains the semantic rules for `FACTUAL_DIRECT`, `CONTEXTUAL_FAB`, `OBJECTION_LAER` and ethical no-scarcity/no-urgency behavior.

- [ ] **Step 2: Run OpenAI writer tests RED**

```powershell
node --experimental-strip-types --test tests/unit/openai-commercial-response-plan.test.ts tests/unit/openai-writer-evidence-boundary.test.ts
```

Expected: the new response plan is absent from the request payload/instructions.

- [ ] **Step 3: Extend the existing writer request minimally**

Add only the response-plan field and instruction clauses. Keep the current rule that raw RAG is not sent as writer evidence when verified facts are absent. Do not add full conversation history or full `ia_contexto` JSON to the writer.

- [ ] **Step 4: Run OpenAI tests GREEN**

```powershell
node --experimental-strip-types --test tests/unit/openai-commercial-response-plan.test.ts tests/unit/openai-writer-evidence-boundary.test.ts tests/unit/llm-usage.test.ts
```

Expected: zero failures and the raw-RAG boundary remains intact.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/src/adapters/openai/OpenAIProvider.ts backend/tests/unit/openai-commercial-response-plan.test.ts backend/tests/unit/openai-writer-evidence-boundary.test.ts
git commit -m "feat(backend): bound writer with commercial response plan"
```

---

### Task 4: Enforce response-plan limits in the existing `WriterGuard`

**Files:**
- Modify only if the new tests are RED: `backend/src/conversation/writer/WriterGuard.ts`
- Modify: `backend/tests/unit/commercial-writer-guardrails.test.ts`

**Interfaces:**
- Consumes: existing guard input plus optional `commercialResponsePlan`.
- Produces: existing `WriterGuardResult`; guard failure uses existing deterministic fallback behavior.

Do not replace `guardGeneratedAnswer`, `executeNba`, `prepareCommercialWriteInput` or current numeric/evidence/product checks. Add the smallest plan-aware validation only where existing guardrails do not already enforce the requirement.

Required plan-aware contracts:

- `maxQuestions === 0` cannot leave a generated customer question.
- `FACTUAL_DIRECT` / exact NBA `ANSWER_ONLY` cannot introduce a recommendation, stock-check CTA, reservation CTA or new discovery.
- `allowedActions` cannot be exceeded by generated text.
- General fabricated commercial pressure must be rejected: fake scarcity, urgency or social proof that is not present in supplied verified evidence.
- Existing unsupported-performance/numeric/product/price/stock guards remain authoritative.
- A grounded `CONTEXTUAL_FAB` response that connects verified resistance/battery/etc. to genuine stored context must continue to pass.

- [ ] **Step 1: Add guard regressions before changing production code**

Add these cases to `commercial-writer-guardrails.test.ts`:

```ts
test('FACTUAL_DIRECT removes an unauthorized follow-up question', async () => { /* plan maxQuestions 0, LLM appends price question, expect only grounded fact */ });

test('ANSWER_ONLY response plan rejects unauthorized recommendation CTA', async () => { /* LLM says te recomiendo/quieres reservar, expect deterministic direct answer */ });

test('fabricated scarcity falls back to grounded answer', async () => { /* LLM says quedan muy pocas unidades without verified scarcity, expect fallback */ });

test('fabricated urgency/social proof falls back to grounded answer', async () => { /* LLM says todos lo están comprando/aprovecha hoy without evidence, expect fallback */ });

test('grounded contextual FAB remains allowed', async () => { /* verified 1.5 m + construction/drop context, expect contextual answer accepted */ });
```

Use generic semantic categories in the implementation. The test phrases are examples of the class; do not create product-specific or exact-string-only patches.

- [ ] **Step 2: Run guard tests and identify which cases are actually RED**

```powershell
node --experimental-strip-types --test tests/unit/commercial-writer-guardrails.test.ts
```

Expected: existing protections may already pass some cases. Change production code only for demonstrated RED cases.

- [ ] **Step 3: Implement the smallest plan-aware guard**

If required, add a helper such as:

```ts
function responsePlanViolation(input:LlmWriteInput, answer:string):string|null
```

It returns a stable violation code (`PLAN_MAX_QUESTIONS`, `PLAN_UNAUTHORIZED_ACTION`, `FABRICATED_COMMERCIAL_PRESSURE`) and plugs into the existing fallback path. Reuse existing trailing-question/action checks before adding new regexes.

- [ ] **Step 4: Run guard + FULL RAG regressions GREEN**

```powershell
node --experimental-strip-types --test tests/unit/commercial-writer-guardrails.test.ts tests/unit/full-rag-final-composition.test.ts tests/unit/final-commercial-behavior.test.ts
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 4 only if production guard code changed**

```bash
git add backend/src/conversation/writer/WriterGuard.ts backend/tests/unit/commercial-writer-guardrails.test.ts
git commit -m "fix(backend): enforce commercial response plan guardrails"
```

If all new tests pass with existing guard behavior, commit only the regression tests with message `test(backend): cover commercial response plan guardrails`.

---

### Task 5: Extend deterministic QA for structural commercial failures without pretending to score persuasion automatically

**Files:**
- Modify only where current evaluator lacks the contract: `backend/qa/evaluators/commercial.ts`
- Modify: `backend/tests/unit/qa-commercial-evaluator.test.ts`

**Interfaces:**
- Consumes: real customer-facing answer, canonical state/debug/NBA.
- Produces: existing `QaFinding[]`; deterministic violations may be RED/YELLOW according to existing project semantics.

Add only observable structural checks:

- fabricated commercial pressure (unsupported scarcity/urgency/social proof) -> RED when stated as fact/pressure without verified debug evidence;
- `ANSWER_ONLY` / factual direct behavior with an unauthorized action/question continues to be caught by the existing actionability checks;
- contextual FULL RAG with genuine customer context continues to require grounded FAB/value relevance using existing `assessFabGrounding()` semantics;
- literal customer echo / repetitive generic acknowledgement remains a quality advisory, not automatic persuasion certification;
- empathy/neuroventas/naturalness overall remain human-review dimensions.

- [ ] **Step 1: Add evaluator regressions**

Add cases proving unsupported scarcity/urgency/social-proof pressure is flagged, while a normal grounded availability sentence (`Sí, está disponible.`) is not flagged. Preserve current price-objection empathy, SPIN, FAB, NBA and continuity tests.

- [ ] **Step 2: Run evaluator tests and confirm RED only for missing contracts**

```powershell
node --experimental-strip-types --test tests/unit/qa-commercial-evaluator.test.ts
```

- [ ] **Step 3: Add the smallest general evaluator detection**

Implement semantic commercial-pressure classification as a structural evidence check, not a score saying the bot is or is not persuasive. Do not turn style heuristics into automatic PASS certification.

- [ ] **Step 4: Run evaluator tests GREEN**

```powershell
node --experimental-strip-types --test tests/unit/qa-commercial-evaluator.test.ts tests/unit/qa-hard-evaluator.test.ts
```

Expected: zero failures.

- [ ] **Step 5: Commit Task 5**

```bash
git add backend/qa/evaluators/commercial.ts backend/tests/unit/qa-commercial-evaluator.test.ts
git commit -m "test(backend): harden commercial response evaluation"
```

---

### Task 6: Prove memory, state, NBA and data authorities stayed untouched

**Files:**
- Expected production changes: none in `SupabaseConversationRepository.ts`, SQL adapters, RAG repositories, `StateReducer.ts`, reservation/concurrency code or n8n workflows.
- Test existing authority/continuity suites only.

**Interfaces:**
- Consumes: the completed response-composition changes.
- Produces: adjacent regression evidence that commercial wording did not become state/data authority.

- [ ] **Step 1: Run state/NBA continuity tests**

```powershell
node --experimental-strip-types --test tests/unit/post-answer-commercial-progression.test.ts tests/unit/final-executable-nba.test.ts tests/unit/decision-routing-authority.test.ts tests/unit/commercial-facts.test.ts
```

- [ ] **Step 2: Run persistence/context regressions available in the repo**

Run the existing tests that cover Supabase commercial context and persistence contracts, using the exact filenames present in `backend/tests` at execution time. At minimum include the Supabase conversation/context and persistence-contract suites already used by this branch.

- [ ] **Step 3: If any adjacent test fails, follow root-cause policy instead of editing blindly**

Use:

```text
FAIL -> reproduce -> first broken boundary -> first responsible owner -> exact root -> smallest general fix -> fresh regression -> adjacent regression
```

Do not edit `StateReducer`, SQL/RAG, Supabase schema or concurrency simply to make a response-composition test green unless that component is proven to be the first broken owner.

- [ ] **Step 4: Confirm no data-authority diff**

Review the final diff and verify there are no changes to SQL procedures, SQL bridge routing, RAG retrieval authority, embedding configuration, Supabase schema, reservation stored procedure contract, or P0 locking.

No separate commit is needed unless a proven adjacent root required a minimal general correction.

---

### Task 7: Full technical verification and authority documentation

**Files:**
- Modify after tests are green: `docs/STECH_BACKEND_AUTHORITY.md`

**Interfaces:**
- Produces: a documented runtime boundary and locally reproducible technical verification.

Update the runtime flow to:

```text
HTTP -> HybridConversationEngine -> deterministic intent/reference/state authorities -> SQL/RAG evidence -> NBA -> CommercialResponsePlan -> guarded writer -> atomic persistence -> optional n8n event
```

Document that:

- `CommercialWriteContract` remains the bounded canonical writer input;
- `CommercialResponsePlan` determines communication mode but never facts/NBA;
- FULL RAG direct factual answers may bypass LLM;
- contextual FULL RAG may use the bounded OpenAI writer;
- WriterGuard/factual fallback remains mandatory;
- no new Supabase schema or second memory was introduced.

- [ ] **Step 1: Run focused changed tests**

```powershell
node --experimental-strip-types --test tests/unit/commercial-response-plan.test.ts tests/unit/full-rag-final-composition.test.ts tests/unit/full-rag-commercial-language.test.ts tests/unit/openai-commercial-response-plan.test.ts tests/unit/openai-writer-evidence-boundary.test.ts tests/unit/commercial-writer-guardrails.test.ts tests/unit/qa-commercial-evaluator.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run the full technical suite**

```powershell
npm test
```

Expected: zero failures.

- [ ] **Step 3: Run build validation**

```powershell
npm run build
```

Expected: build check PASS.

- [ ] **Step 4: Review diff and security boundary**

Review changed files for secrets, raw prompts containing credentials, SQL credentials, Supabase service-role keys, Authorization headers, customer PII and accidental production/n8n edits. None may be committed.

- [ ] **Step 5: Update authority document and commit verification docs**

```bash
git add docs/STECH_BACKEND_AUTHORITY.md
git commit -m "docs: record commercial response composition authority"
```

---

### Task 8: User-run local conversational certification through the real HTTP boundary

**Files:**
- No GitHub Actions workflow changes.
- QA output remains under existing ignored `backend/qa-results/` paths.

**Interfaces:**
- Consumes: branch after technical suite/build is green.
- Produces: real conversational evidence for TECHNICAL, CONTEXT, COMMERCIAL, COHERENCE, N+1 and REAL RESPONSE plus human review of EMPATHY, NEUROVENTAS, FAB/LAER and naturalness.

Use fresh isolated sessions. Do not reuse contaminated prior sessions unless the case specifically tests continuity.

- [ ] **Step 1: User updates and validates locally**

```powershell
cd C:\DESAROLLO\n8n
git pull --ff-only
cd backend
npm run build
npm test
```

- [ ] **Step 2: Start the backend**

```powershell
npm start
```

Keep it running.

- [ ] **Step 3: In a second terminal run the focused live suite**

```powershell
cd C:\DESAROLLO\n8n\backend
npm run qa:live:core
```

Do not use GitHub Actions for this conversational certification.

- [ ] **Step 4: Manually/through the local runner verify these critical journeys with fresh session IDs**

1. `¿El Armor 22 tiene NFC?` -> direct verified answer, no generic empathy, no forced SPIN, no unrelated CTA.
2. Construction + frequent drops + battery need -> remembered context, grounded resistance/battery FAB, useful human commercial language; stock CTA only if exact NBA authorizes it.
3. `Está muy caro` -> objection acknowledged before value/alternative; no defensive catalog dump.
4. Armor X13 vs Armor 22 -> preserved pair, 2-4 relevant differences, no third product, recommendation only from evidence/priorities.
5. Budget recommendation -> real SQL price/budget filter; budget does not become SPIN problem or fake price objection.
6. Unsupported/unknown capability -> truthful `UNKNOWN` behavior; no oversell.
7. `Me lo llevo` / strong purchase -> no discovery restart; progress only through supported purchase/handoff/reservation flow.
8. Commercial-pressure stress -> no fake scarcity, urgency, popularity/social proof or unsupported performance.
9. Multi-turn continuity -> product/use/problem/priorities/objection/stage/NBA remain coherent across `ia_contexto` and the visible answer.
10. Writer failure/fallback -> customer still receives the grounded factual answer and no invented action.

- [ ] **Step 5: Score the live evidence**

For every critical journey record:

```text
TECHNICAL: PASS / WEAK / FAIL
CONTEXT: PASS / WEAK / FAIL
COMMERCIAL: PASS / WEAK / FAIL
COHERENCE: PASS / WEAK / FAIL
N+1: PASS / WEAK / FAIL
REAL RESPONSE: PASS / WEAK / FAIL
EMPATHY (human): PASS / WEAK / FAIL
NEUROVENTAS (human): PASS / WEAK / FAIL
FAB/LAER (human, when applicable): PASS / WEAK / FAIL
```

A technical HTTP success is not certification. Any FAIL follows the repository root-cause workflow before another edit.

## Definition of Done

The feature is complete only when all of the following are true:

- Isolated factual answers stay correct, concise and free of forced sales chatter.
- Contextual FULL RAG answers can use the existing writer to express empathy/FAB/neuroventas without modifying factual truth.
- No wrong product, reference, price, stock, capability, policy or unsupported action is introduced.
- The exact executable NBA remains the only CTA/action authority.
- Maximum one useful question is respected.
- Known customer context is used meaningfully instead of generic acknowledgement or literal echo.
- Price objections use bounded LAER behavior when applicable.
- Comparisons/recommendations reduce decision effort using verified relevant differences, not arbitrary superiority.
- Writer failure falls back to the deterministic grounded answer.
- Existing state, persistence, SQL/RAG, reservation and concurrency contracts remain intact.
- `npm test` passes locally.
- `npm run build` passes locally.
- Fresh local HTTP conversational QA confirms the critical journeys and human commercial dimensions.
- Production and production n8n workflows remain unchanged until a separate promotion decision is made.

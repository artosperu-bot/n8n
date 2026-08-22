# STECH Certification Roots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five approved certification roots in the mandated order with contract-level TDD and safe local QA.

**Architecture:** Keep deterministic authority at existing boundaries. Trace sanitization produces one safe event consumed by console and JSONL; reservation capture uses a general ownership predicate; budget authority is enforced before validation; ranking exposes evidence sufficiency instead of inventing a winner; conditional interest changes only if its current regression fails.

**Tech Stack:** Node.js 22, TypeScript strip-types, `node:test`, local JSONL, existing fake adapters.

**Spec:** `docs/superpowers/specs/2026-08-21-stech-certification-roots-design.md`

## Global Constraints

- Order: trace, reservation, budget, recommendation sufficiency, conditional interest.
- No production, Supabase schema, SQL authority, price/stock normalization, RAG authority, reference, switch/no-switch, or concurrency changes.
- Reservation SQL execution remains blocked; never invent its signature or success.
- Before every production change, run and confirm a failing contract regression.
- Preserve the untracked `backend/package-lock.json`.

---

### Task 1: Trace privacy and uniqueness

**Files:**
- Modify: `backend/tests/unit/trace-writer.test.ts`
- Modify: `backend/src/shared/trace.ts`

**Interfaces:**
- Consumes: `writeTrace(payload, level)` and `installTraceConsoleSink()`.
- Produces: one sanitized STECH event delivered to console and at most one JSONL row; non-STECH console calls unchanged.

- [ ] Add a child-process regression that installs the sink, emits a STECH error containing message, DNI, Authorization, cookie, password, API key and token, invokes `writeTrace`, and asserts console/JSONL contain none of those values and JSONL has exactly one row.
- [ ] Run `node --experimental-strip-types --test tests/unit/trace-writer.test.ts`; expect privacy/uniqueness assertions to fail against current source.
- [ ] Centralize sensitive-key normalization and change the wrapper to serialize the sanitized event before calling the original console method. Ensure only the wrapper or `writeTrace` appends, never both.
- [ ] Re-run the trace test; expect all trace contracts green. Run adjacent `tests/unit/conversation-qa-metadata.test.ts`.
- [ ] Review `git diff --stat` and focused trace diff; commit only trace source/test.

### Task 2: Reservation turn ownership

**Files:**
- Modify: `backend/tests/integration/hybrid-turn-engine.test.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`

**Interfaces:**
- Consumes: reservation stage, current message, deterministic intent/reference resolution.
- Produces: a general `reservationOwnsTurn(state, message)` decision; compatible data advances reservation, other valid intents use the normal pipeline while reservation state remains pending.

- [ ] Add regressions for NEED_DOCUMENT plus warranty, human request, named product switch, explicit abandonment, and a valid document. Assert interruption intent/route, preserved pending state except abandonment, and no false reservation success.
- [ ] Run the single integration file; expect warranty/human/switch/abandonment cases to fail because reservation currently captures all input.
- [ ] Implement structural field compatibility plus semantic ownership. Do not encode an expanding intent blacklist; use the existing deterministic pipeline to detect valid competing intent and explicit reservation-operation language.
- [ ] Re-run the integration file and adjacent reservation tests in `sales-turn-v04` and `root-remediation-regressions`.
- [ ] Review diff and commit only reservation source/test.

### Task 3: Deterministic budget authority

**Files:**
- Modify: `backend/tests/integration/hybrid-turn-engine.test.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`

**Interfaces:**
- Consumes: parsed budget classification and planner decision.
- Produces: deterministic budget primary intent with compatible secondary attributes preserved.

- [ ] Add a planner=`CAPABILITY` reproduction for `maximo 1500 soles` with known use context; assert budget persistence and `RECOMMEND_WITHIN_BUDGET` routing.
- [ ] Run the single test file; expect final intent mismatch.
- [ ] Generalize semantic authority so explicit deterministic budget evidence beats incompatible planner primary intents, without changing SQL/RAG/normalization.
- [ ] Re-run the integration file and budget resolver/decision authority tests.
- [ ] Review diff and commit only budget source/test.

### Task 4: Recommendation evidence sufficiency

**Files:**
- Modify: `backend/tests/unit/recommendation-policy.test.ts`
- Modify: `backend/tests/integration/hybrid-turn-engine.test.ts`
- Modify: `backend/src/conversation/recommendation/RecommendationPolicy.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Modify if required: `backend/src/domain/types.ts`

**Interfaces:**
- Produces: explicit no-winner/tie observability from authoritative candidate facts; engine presents neutral alternatives or asks one useful criterion without changing active product.

- [ ] Add unit behavior proving zero comparable evidence has no authoritative winner and catalog order is irrelevant; add integration behavior proving active product is preserved and no recommendation winner is persisted.
- [ ] Run those files; expect current first-row selection to fail.
- [ ] Add the smallest sufficiency/tie result to ranking trace and make the engine branch safely when no differentiating winner exists. Price may break ties only when explicitly prioritized.
- [ ] Re-run recommendation and integration tests plus state/reference adjacent regressions.
- [ ] Review diff and commit only recommendation source/tests/types actually needed.

### Task 5: Conditional purchase interest

**Files:**
- Modify initially: `backend/tests/integration/hybrid-turn-engine.test.ts`
- Modify only on RED: `backend/src/conversation/commercial/CommercialFacts.ts`, `backend/src/conversation/nba/NextBestAction.ts`, or the smallest existing owner proven by the failure.

**Interfaces:**
- Produces: conditional commercial interest without confirmed purchase or reservation start, with a useful bounded NBA.

- [ ] Add the current-HEAD regression for `si está disponible me interesa`; assert interest signal/equivalent true, confirmed purchase false, reservation not started, stock remains authoritative, and NBA progresses usefully.
- [ ] Run it. If green, keep no new production logic and document existing behavior. If red, identify the first broken existing abstraction before editing.
- [ ] On RED only, implement the minimal general correction and re-run integration plus commercial-facts/NBA tests.
- [ ] Review diff and commit the regression and only any proven minimal source change.

### Task 6: Operational authority and final verification

**Files:**
- Create: `docs/STECH_BACKEND_AUTHORITY.md`
- Modify only if needed for the runner contract: `backend/qa/*` or `backend/scripts/qa-live.ts`

**Interfaces:**
- Produces: <=200-line continuation authority and one existing local QA command with isolated sessions, PASS/FAIL, first failing turn, state/decision/evidence fields, and JSONL trace.

- [ ] Write the compact authority document from verified evidence only, including reservation SQL and Live QA gates.
- [ ] Verify the existing local runner contract; change it only if a concrete required output is absent, using TDD for behavior changes.
- [ ] Run focused changed tests, full `npm test`, `npm run build`, and a safe local `npm start` health/chat smoke with fakes and a temporary trace file.
- [ ] Inspect trace output for PII/credential leakage, review full `git diff --stat` and `git diff`, and confirm production/Supabase remained untouched.
- [ ] Commit documentation/runner changes and prepare the single local conversational QA command if external Live evidence is now required.

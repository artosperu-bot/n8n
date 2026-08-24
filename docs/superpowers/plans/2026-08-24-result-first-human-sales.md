# STECH Result-First Human Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make STECH proactively lead fit -> price+availability -> fulfillment -> reservation while keeping customer memory explicit-only and responses human/simple.

**Architecture:** Separate conversation progression from content generation. Deterministic customer facts control memory; explicit commercial actions control the next step; the writer receives a compact pain/fit evidence core rather than a full technical dump. Live QA becomes seller-led and records the running build identifier.

**Tech Stack:** Node 22, TypeScript, node:test, SQL Server bridge, Supabase, OpenAI writer.

**Spec:** `docs/superpowers/specs/2026-08-24-result-first-human-sales-design.md`

## Global Constraints
- Do not change Supabase schema or SQL price/stock authority.
- Do not persist planner-authored SPIN facts.
- Price and stock are returned together.
- A short affirmative is purchase only after an explicit reservation question.
- Maximum one visible commercial question per turn.
- No fake personal anecdotes, scarcity, urgency, or social proof.

---

### Task 1: Lock result-first behavior with unit tests

**Files:**
- Modify: `backend/tests/unit/result-first-sales-flow.test.ts`
- Modify: `backend/tests/unit/commercial-facts.test.ts`
- Modify: `backend/tests/unit/commercial-spin-n1-regressions.test.ts`

**Interfaces:**
- Consumes: `nextBestAction`, `evaluatePostAnswerCommercialProgression`, `extractCommercialFacts`, response-plan builders.
- Produces: executable behavioral contract for seller-led progression and explicit-only memory.

- [ ] Add tests that require a grounded recommendation to advance to price+availability.
- [ ] Add tests that a short yes to a visible price+availability offer becomes PRICE, not PURCHASE.
- [ ] Add tests that PRICE with resolved SQL result advances to fulfillment.
- [ ] Add tests that fulfillment choice advances to reservation.
- [ ] Add tests that planner-authored implication prose cannot enter persisted spinFacts.
- [ ] Run the focused unit suite locally and confirm the new tests fail for the intended reasons.

### Task 2: Make deterministic customer facts the only SPIN persistence authority

**Files:**
- Modify: `backend/src/application/ChatService.ts`
- Modify: `backend/src/conversation/commercial/CommercialFacts.ts`

**Interfaces:**
- Consumes: `extractCommercialFacts(message, previous)`.
- Produces: `spinFacts` containing only deterministic explicit customer facts.

- [ ] Stop appending raw planner `spinContribution` into `spinFacts`.
- [ ] Preserve `lastSpinContribution` as an audit classification derived from deterministic state deltas, not free-form planner prose.
- [ ] Expand explicit pain extraction for repeated repairs and declared losses without inventing implications.
- [ ] Run focused tests and confirm explicit facts persist while fabricated implications do not.

### Task 3: Replace overloaded close semantics with result-first actions

**Files:**
- Modify: `backend/src/conversation/nba/NextBestAction.ts`
- Modify: `backend/src/conversation/nba/PostAnswerCommercialProgression.ts`
- Modify: `backend/src/conversation/nba/NbaCompatibility.ts`
- Modify: `backend/src/conversation/decision/DecisionValidator.ts`
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/conversation/commercial/CommercialCapabilities.ts`
- Modify: `backend/src/conversation/commercial/CommercialWriteContract.ts`

**Interfaces:**
- Produces actions: `OFFER_PRICE_AVAILABILITY`, `OFFER_FULFILLMENT`, `OFFER_RESERVATION`, `COLLECT_RESERVATION_DATA`.

- [ ] Allow grounded fit/recommendation to produce `OFFER_PRICE_AVAILABILITY`.
- [ ] Ensure current `RECOMMEND` does not block post-answer progression.
- [ ] PRICE/STOCK with a resolved product produces `OFFER_FULFILLMENT`.
- [ ] POLICY fulfillment selection after fulfillment offer produces `OFFER_RESERVATION`.
- [ ] Preserve purchase authority: only explicit purchase or affirmative to reservation activates `COLLECT_RESERVATION_DATA`.
- [ ] Run focused unit suite.

### Task 4: Make pain writing human before it reaches the LLM

**Files:**
- Modify: `backend/src/conversation/commercial/FullRagAnswerKernel.ts`
- Modify: `backend/src/conversation/commercial/CommercialResponsePlan.ts`
- Modify: `backend/src/conversation/commercial/FullRagLlmProvider.ts`
- Modify: `backend/tests/unit/commercial-writer-guardrails.test.ts`

**Interfaces:**
- Consumes explicit context + verified facts.
- Produces compact factual core with at most two context-relevant facts for pain/fit turns.

- [ ] Add a compact pain/fit factual-core path that does not emit full technical summaries.
- [ ] Make writer instructions use everyday language, one grounded scene when useful, and practical benefit.
- [ ] Keep factual questions such as NFC direct and non-emotional.
- [ ] Add guardrail tests for no technical dump, no fake anecdote, and one question maximum.

### Task 5: Rebuild live QA around seller-led conversations

**Files:**
- Modify: `backend/scripts/qa-human-sales.ts`
- Modify: `backend/scripts/qa-live.ts`
- Modify: `backend/package.json` only if script metadata changes are required.

**Interfaces:**
- Produces `qa-results/human-sales/latest/human-sales-summary.json` with runtime build id and seller-led flow findings.

- [ ] Replace fit scenarios that require the customer to ask price/stock with seller-led turns.
- [ ] Add positive assertions for price+availability, fulfillment, reservation, and purchase-data progression.
- [ ] Add runtime build/commit identifier to the report/health metadata when available.
- [ ] Keep n8n delivery errors separate from conversational gate failures.
- [ ] Run `npm run qa:human-sales` locally against a freshly restarted backend.

### Task 6: Final focused verification

**Files:** none.

- [ ] Run focused unit tests including `result-first-sales-flow.test.ts`.
- [ ] Run `npm run build`.
- [ ] Restart backend and verify health/build identity.
- [ ] Run `npm run qa:human-sales` locally.
- [ ] Do not run broader commercial50 until the human-sales gate is free of RED findings.

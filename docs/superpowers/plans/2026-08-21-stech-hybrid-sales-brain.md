# STECH Hybrid Sales Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace over-deterministic conversation decisions with a GPT-5-mini-led semantic/commercial planner while retaining deterministic truth/side-effect guards.

**Architecture:** Add a structured `TurnDecision` contract to the LLM port. `ConversationEngine` uses a safe deterministic fast path only for unambiguous direct factual requests; all ambiguous/consultative turns ask GPT-5 mini for a semantic/commercial decision, validate it against state/catalog, execute SQL/RAG, compute dynamic N+1, then either answer deterministically or use the model as a grounded writer. Supabase remains canonical memory.

**Tech Stack:** Node.js 22, TypeScript strip-types, OpenAI Responses API, SQL bridge, Supabase REST, node:test.

**Spec:** `docs/superpowers/specs/2026-08-21-stech-hybrid-sales-brain-design.md`

## Global Constraints
- No new production database tables.
- No new n8n production workflow changes.
- No hardcoded product names/prices to pass QA.
- SQL/RAG remain factual authority.
- Raw stock quantity must never be exposed.
- Images remain verified URL-only output.
- Strong purchase signal must preserve referent and progress to handoff.
- Planner/writer failures must be fail-soft.
- Existing 117-test green baseline must remain green before live QA.

---

### Task 1: Structured semantic/commercial planner
**Files:**
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/adapters/fake/FakeLlmProvider.ts`
- Create: `backend/tests/unit/llm-turn-decision.test.ts`

**Interfaces:**
- Add `TurnDecision`, `LlmDecisionInput`, `LlmDecisionResult`.
- Add `decide(input): Promise<LlmDecisionResult>` to `LlmProvider`.

- [ ] Write a failing test where planner receives current message + compact state and returns structured JSON for an ambiguous referent and dynamic NBA.
- [ ] Run focused test and verify RED.
- [ ] Implement OpenAI `decide()` using Responses API and JSON-only instructions; parse/normalize fields, usage and latency.
- [ ] Implement deterministic fake decision provider for tests.
- [ ] Run focused tests GREEN.
- [ ] Commit.

### Task 2: Decision validation and dynamic N+1
**Files:**
- Create: `backend/src/conversation/decision/DecisionValidator.ts`
- Modify: `backend/src/conversation/nba/NextBestAction.ts`
- Create: `backend/tests/unit/decision-validator.test.ts`
- Modify: `backend/tests/unit/next-best-action-v04.test.ts`

**Interfaces:**
- `validateTurnDecision(decision, state, catalogCandidates)` preserves hard reference/switch invariants.
- `nextBestAction(intent, state, decision?)` uses model proposal but enforces purchase/handoff and no-repeat constraints.

- [ ] Add RED tests for stale recommendation vs recent selection, product mention vs switch, unknown model -> alternative search, and purchase signal -> handoff.
- [ ] Implement minimal validator and dynamic NBA.
- [ ] Run focused GREEN.
- [ ] Commit.

### Task 3: Integrate planner into ConversationEngine
**Files:**
- Modify: `backend/src/conversation/ConversationEngine.ts`
- Create: `backend/tests/integration/hybrid-turn-engine.test.ts`

**Interfaces:**
- Direct factual fast path allowed only when intent and target are unambiguous.
- Otherwise planner drives primary/secondary intent, target/reference, commercial stage, SPIN/NBA and tool requirements.
- Existing deterministic resolver is fallback only when planner fails.

- [ ] Add RED integration tests for ambiguous `ese/el otro`, comparison follow-up, objection, and work-context recommendation.
- [ ] Call `llm.decide()` before route/tool execution for non-fast-path turns.
- [ ] Validate planner decision before applying state.
- [ ] Use decision to drive route/RAG sections/NBA.
- [ ] Keep deterministic price/stock/image output after verified tool execution.
- [ ] Run focused GREEN.
- [ ] Commit.

### Task 4: Unknown/unavailable product recovery
**Files:**
- Modify: `backend/src/conversation/ConversationEngine.ts`
- Modify: `backend/src/conversation/commercial/ResponsePolicy.ts`
- Create: `backend/tests/integration/unknown-product-alternatives.test.ts`

- [ ] RED: requested nonexistent model with known need must search actual catalog and propose relevant available alternatives, not dead-end.
- [ ] RED: no relevant alternatives => truthful no-confirmation response, no fabrication.
- [ ] Implement catalog fallback and grounded alternative recommendation.
- [ ] Ensure no unsolicited price unless requested.
- [ ] GREEN and commit.

### Task 5: Planner-aware grounded writer
**Files:**
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/writer/WriterGuard.ts`
- Modify: `backend/tests/unit/openai-resilience.test.ts`

- [ ] RED test proving writer receives validated decision + compact evidence and can express natural commercial reasoning.
- [ ] Remove instruction that forbids model from reasoning commercially; instead forbid only factual override and unsupported action claims.
- [ ] Keep compact evidence, 1–3 sentence norm and max one useful question.
- [ ] Keep writer failure safe fallback.
- [ ] GREEN and commit.

### Task 6: Rich canonical persistence
**Files:**
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Modify: `backend/tests/unit/supabase-conversation-real.test.ts`
- Modify: `backend/tests/unit/supabase-state-projection.test.ts`

- [ ] RED tests for planner confidence, route, resolved product, stage, strategy, SPIN contribution, next action and handoff projections.
- [ ] Persist canonical decision fields inside `contexto` and supported scalar columns.
- [ ] Preserve request/message id uniqueness.
- [ ] GREEN and commit.

### Task 7: Live QA gates for general behavior
**Files:**
- Modify: `backend/qa/scenarios/journeys.ts`
- Modify: `backend/qa/evaluators/hard.ts`
- Modify: `backend/qa/evaluators/commercial.ts`
- Modify: relevant tests.

- [ ] Add/strengthen journeys for unknown product alternatives, multi-intent turns, general product info, dynamic N+1, comparison follow-ups, image-only output and purchase handoff.
- [ ] RED only for product/referent/truth/switch/discovery/purchase/handoff/null failures.
- [ ] Minor style remains YELLOW.
- [ ] GREEN tests and commit.

### Task 8: Full verification
- [ ] Run `npm test`; require zero failures.
- [ ] Run `npm run build`; require BUILD CHECK PASS.
- [ ] Run secret scan and distinguish real secrets from documented false positives without weakening detection.
- [ ] Run live QA against actual backend only after local user pulls/restarts.
- [ ] Compare AFTER to `qa-20260821-025241-955c` using Supabase conversation/state evidence.

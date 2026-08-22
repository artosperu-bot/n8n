# STECH Conversation Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use a plan executor task-by-task. This plan implements the approved commercial contract and the current authority map; it does not create a competing architecture.

**Goal:** Make the real `HybridConversationEngine` obey one commercial contract: answer the current question correctly (`N`), then deliver exactly one related, useful and executable continuation (`+1`) when safe; keep factual authorities and purchase/reservation safety intact.

**Architecture:** Preserve SQL/RAG/persistence authorities. Remove or quarantine legacy/duplicate conversational authorities, separate raw evidence from customer-display facts, establish one final executable NBA, compose `N + 1` before the writer guard, and make QA measure the visible contract instead of enum presence.

**Tech Stack:** Node.js 22+, TypeScript executed with `--experimental-strip-types`, SQL Bridge/SQL Server, Supabase RAG/persistence, OpenAI Responses API.

**Specs:**
- `backend/docs/STECH_CONVERSATION_COMMERCIAL_CONTRACT.md` — primary functional commercial authority.
- `backend/docs/STECH_BACKEND_AUTHORITY.md` — factual/integration authority.
- `backend/docs/CONVERSATION-CODE-AUTHORITY-MAP.md` — implementation map and conflict inventory.

## Global constraints

- Production is not modified by this plan.
- SQL remains authority for price, stock, catalog identity and images.
- Product RAG remains authority for technical product facts.
- Institutional RAG remains authority for warranty, delivery, payment, location and policy facts.
- `ia_contexto` is current operational state; `ia_conversaciones` is historical evidence.
- Planner/writer may interpret/redact, but may not invent facts or replace factual authorities.
- No GitHub Actions conversational QA.
- No live conversational QA is executed by the implementation agent; CORE is run externally by the user after bounded technical verification.
- `ANSWER_ONLY` is exceptional for normal commercial/product turns when a safe useful `+1` exists.

---

## Task 1 — Freeze documentation authority and runtime naming

**Files:**
- Modify: `backend/docs/ARQUITECTURA.md`
- Modify: `backend/docs/STECH_BACKEND_AUTHORITY.md`
- Modify: `backend/docs/SPIN-FAB-N1-POLITICA-COMERCIAL.md`
- Modify: `backend/scripts/build-check.ts`

**Produces:** one documented runtime authority: `HybridConversationEngine`; one commercial contract hierarchy; old `ANSWER_ONLY` defaults explicitly marked superseded.

## Task 2 — Separate raw RAG evidence from customer-display facts

**Files:**
- Modify: `backend/src/conversation/evidence/EvidenceNormalizer.ts`
- Modify: `backend/src/conversation/commercial/GroundedDirectAnswer.ts`
- Test: `backend/tests/unit/evidence-normalizer.test.ts`
- Create test: `backend/tests/unit/grounded-direct-answer.test.ts`

**Behavior:** raw RAG envelopes/metadata may remain provenance internally but cannot be promoted verbatim into `directAnswer`. Exact extractors (weight, RAM, etc.) remain authoritative and must not regress.

## Task 3 — Align semantic planner with the approved N+1 contract

**Files:**
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`

**Behavior:** planner proposes exactly one useful next move; low factual interest does not default to `ANSWER_ONLY`; `ASK_MISSING_FACT` remains valid only when unknown + decision-impacting + consumable. Planner remains proposal-only.

## Task 4 — Establish one final executable NBA authority

**Files:**
- Modify: `backend/src/conversation/nba/PostAnswerCommercialProgression.ts`
- Modify: `backend/src/conversation/commercial/CommercialWriteContract.ts`
- Modify: `backend/src/conversation/decision/DecisionValidator.ts`
- Modify: `backend/src/conversation/nba/NbaCompatibility.ts`
- Modify: `backend/src/domain/types.ts` / `backend/src/ports/LlmProvider.ts` only if the final-action contract needs an explicit field.

**Behavior:** candidate -> post-answer progression -> capability/safety validation -> `FINAL_EXECUTABLE_NBA`. No lower-precedence layer may silently replace a valid final action. Safety/unsupported capability may invalidate it only with an explicit reason.

## Task 5 — Separate response composition from WriterGuard

**Files:**
- Modify: `backend/src/conversation/writer/WriterGuard.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Optionally create one focused compositor only if needed; do not create another decision engine.

**Behavior:** `N` is immutable. `+1` is one independently validated continuation. Failure to verbalize `+1` must never erase `N`. WriterGuard sanitizes/blocks unsafe content; it does not choose a different commercial strategy.

## Task 6 — Separate catalog existence from recommendation eligibility

**Files:**
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Modify types for recommendation trace if required.

**Behavior:** `catalogCandidates` = products that exist; `availableCandidates` = stock > 0; `eligibleCandidates` = availability + budget/other gates; `rankedCandidates` = evidence-ranked. Zero-stock products do not win immediate purchase recommendations but do not disappear as if nonexistent.

## Task 7 — Quarantine/remove legacy conversational engine contracts

**Files:**
- Review/remove or mark legacy: `backend/src/conversation/ConversationEngine.ts`, `backend/src/conversation/router/RoutePlanner.ts`, `backend/src/conversation/intent/IntentResolver.ts`
- Review/migrate tests that instantiate legacy `ConversationEngine`.

**Behavior:** production/runtime and technical build reference the same engine. Preserve any still-useful deterministic unit coverage by moving it to the hybrid/current modules before deleting legacy code.

## Task 8 — Align QA with visible behavior

**Files:**
- Modify: `backend/qa/evaluators/commercial.ts`
- Modify: `backend/qa/evaluators/hard.ts`
- Modify scenarios so unsupported operations live in safety coverage rather than main commercial CORE.

**Behavior:** `questionResolved` means the asked question was actually answered, not merely that a non-empty response exists. `RELATED_VALUE` counts as normal low N+1. Internal/RAG metadata leakage is a hard failure. Enum presence alone never proves visible N+1 delivery.

## Verification order

For each implementation task:
1. Add/update the smallest deterministic test that demonstrates the contract.
2. Run only the directly affected unit/integration tests plus `npm run build` when local execution is available.
3. Do not run `qa:live`, CORE, Golden100, Supabase live conversational validation or n8n conversational validation from the implementation agent.
4. After all root tasks are technically stable, user runs `npm run qa:live:core` externally once and returns `summary.json`, `failures.json`, and `conversation-report.txt`.

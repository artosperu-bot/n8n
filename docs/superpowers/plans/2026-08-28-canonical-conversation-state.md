# Canonical Conversation State Refactor — Implementation Plan

> Approved design: `docs/superpowers/specs/2026-08-28-canonical-conversation-state-design.md`

**Goal:** Remove competing persisted memory representations so `ConversationState` is the single accumulated-state authority, while retaining backward-compatible reads and existing database/CRM projections.

**Architecture:** `StateReducer` owns state evolution. A new Supabase codec owns canonical state serialization/hydration. `SupabaseConversationRepository` projects canonical state separately into `ia_conversaciones` (turn truth) and `ia_contexto` (accumulated memory + physical derived columns). Legacy nested aliases are read-only compatibility inputs, never new-write outputs.

**Constraints:** No production Supabase schema/data mutation. Do not alter P0 acquire/persist/release semantics. Do not broaden PRODUCT_INFO/ATTRIBUTE commercial behavior. Canonical values always beat legacy fallbacks.

---

## Task 1 — Freeze canonical serialization/hydration with RED tests

**Files**
- Create: `backend/tests/unit/canonical-conversation-state.test.ts`
- Reference: `backend/src/domain/types.ts`
- Reference: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`

**Tests**
1. Canonical serializer does not emit legacy aliases or derived view keys.
2. Legacy nested JSON hydrates into canonical product/customer/commercial fields.
3. Canonical fields win over conflicting legacy values.
4. Unknown arbitrary keys are not persisted.
5. Normalization still rejects query-purpose pseudo-use-cases and malformed spin facts.

Commit tests before implementation and use PR CI as RED evidence.

## Task 2 — Add canonical state codec

**Files**
- Create: `backend/src/adapters/supabase/ConversationStateCodec.ts`
- Modify tests from Task 1 only if a test itself is proven wrong.

**Implementation**
- Define a typed canonical-key allow list for `ConversationState`.
- Implement `serializeConversationState(state)`.
- Implement `hydrateConversationState(value)` with legacy fallback mapping.
- Normalize `useCase` and `spinFacts` at the boundary.
- Keep compatibility mapping isolated in this module.

Run the new focused test until GREEN.

## Task 3 — Unify Supabase state reads/writes

**Files**
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Modify: `backend/tests/unit/supabase-commercial-context.test.ts`
- Modify: `backend/tests/unit/supabase-persistence-contract.test.ts`

**Implementation**
- Replace `storedCanonicalState` with codec hydration.
- Replace duplicate-rich `canonicalContext` with codec serialization.
- `completeTurn()` persists canonical-only `p_contexto.contexto`.
- `saveState()` uses the exact same serializer.
- Keep physical `ia_contexto` columns as derived projections.
- Keep `ia_conversaciones` as turn-level truth.

**Tests**
- Atomic path and saveState path emit the same canonical JSON shape.
- Physical context columns continue to receive expected values.
- `context_version` remains a physical persistence version and `contextVersion` remains the canonical runtime field.

## Task 4 — Stop derived commercial views from becoming memory aliases

**Files**
- Modify: `backend/src/adapters/supabase/PersistenceProjection.ts`
- Modify: `backend/tests/unit/persistence-projection.test.ts`

**Implementation**
- Preserve turn deltas and typed pending observability.
- Do not merge `customer`, `commercial`, `pendingQuestion`, `pendingAction`, or Spanish physical-column aliases into canonical accumulated JSON.
- Treat pending typed objects as derived turn/projection data only.
- Preserve existing `lastNba`, `pendingCommercialAction`, `pendingMissingFact` runtime semantics.

## Task 5 — Preserve CRM compatibility at the read edge if required

**Files**
- Potentially modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Potentially modify: `backend/tests/unit/supabase-crm-repository.test.ts`

**Decision rule**
Only add this adapter if existing CRM tests or API contract demonstrate reliance on legacy nested aliases. If required, reconstruct aliases from canonical JSON + physical columns when returning CRM data. Never write those aliases back into `ia_contexto.contexto`.

## Task 6 — Document authority as repository memory

**Files**
- Modify: `docs/DATA_AUTHORITY.md`
- Modify: `docs/COMMERCIAL_CONTRACT.md`
- Modify: `docs/CURRENT_STATE.md` after QA evidence exists

**Documentation**
- `ConversationState` = single accumulated-memory contract.
- `StateReducer` = sole state consolidator.
- `ia_conversaciones` = turn truth.
- `ia_contexto.contexto` = canonical accumulated state only.
- physical `ia_contexto` columns = derived projections.
- legacy aliases = read-only migration compatibility.

## Task 7 — Verification

From `backend/` run or reproduce in GitHub Actions:

1. New canonical-state tests.
2. `persistence-projection.test.ts`.
3. `supabase-commercial-context.test.ts`.
4. `supabase-persistence-contract.test.ts`.
5. `state-reducer.test.ts`.
6. `commercial-salesperson-regressions.test.ts`.
7. `npm run build`.
8. `npm test` full suite.

If full suite is red, compare the same failing tests against base SHA `4c1add300ea0b747faae14d7369abb72488543c4`. Classify only genuinely new failures as regressions.

## Task 8 — Integration

- Review branch diff for accidental scope expansion.
- Keep changes in PR against `feat/crm-automation-engine`.
- Merge only after focused tests/build are green and full-suite status is understood against baseline.
- Do not deploy or mutate production Supabase as part of this PR.

# STECH Certification Roots — Design

**Goal:** Close the newly demonstrated backend correctness and observability gaps without reopening frozen SQL, RAG, reference, switch, concurrency, or factual-authority contracts.

**Scope:** Development/QA branch only. No production publication, workflow activation, secret changes, destructive SQL, or live reservation execution.

## Confirmed baseline

- Branch: `feat/stech-backend`; baseline HEAD: `0018bc6`.
- Technical suite: 236/236 PASS.
- Build check: PASS.
- SQL/ERP remains authority for identity, price, and stock.
- Product and institutional RAG remain isolated and authoritative for their documented domains.
- Supabase inspection was read-only; no schema or data change is required by these fixes.
- Existing `backend/package-lock.json` is untracked user work and must remain untouched.

## P0 — Reservation turn ownership

### Evidence and first broken boundary

`HybridConversationEngine.processTurn()` invokes `reservationAdvance()` before intent classification. With `reservationStage=NEED_DOCUMENT`, an explicit warranty question is treated as invalid identity data and persisted as `PURCHASE / RESERVATION_DATA` with `purchaseSignal=true`.

### Contract

An active reservation owns only valid progress for its expected field and explicit reservation operations. Explicit warranty, policy, human-help, product-switch, and cancellation intents must be classified before reservation data capture. An interruption must not discard already collected reservation state unless the customer explicitly abandons/cancels the reservation.

### Design

Introduce a deterministic reservation-turn ownership decision before `reservationAdvance()`:

- consume input as reservation data only when it is compatible with the expected stage;
- route explicit WARRANTY/POLICY/HUMAN and product decisions through the normal authority pipeline while preserving the pending reservation;
- treat explicit cancellation/abandonment as a safe state transition, without claiming an external cancellation occurred;
- keep `READY` non-confirming until an authorized reservation operation succeeds.

Tests must cover warranty interruption, safe cancellation/exit, and valid field progression. They must assert final intent, route, reservation state, and absence of false purchase/action claims.

## P0 — Trace privacy and uniqueness

### Evidence and first broken boundary

`installTraceConsoleSink()` sanitizes only the JSONL copy, then forwards the original arguments to `console.log/error`. Raw console output can therefore retain DNI, messages, or credentials. `writeTrace()` can also append twice when the sink is installed.

### Contract

All four STECH events must be sanitized before every output sink. JSONL remains UTF-8, append-only, fail-soft, and non-intrusive. No full messages, PII, Authorization data, cookies, passwords, API keys, tokens, or secrets may reach JSONL or console output. One emitted event produces at most one JSONL row.

### Design

- Centralize event sanitization and sensitive-key detection.
- Forward sanitized event payloads to console.
- Make `writeTrace()` and the installed sink share one append path without duplication.
- Preserve unrelated console calls unchanged.
- Add observable error tracing at the HTTP boundary without echoing unsafe exception contents.

Tests capture console output and JSONL, use representative PII/credential payloads, assert one row per event, and retain fail-soft behavior.

## P1 — Deterministic budget authority

### Evidence and first broken boundary

A Live turn produced `deterministicIntent=RECOMMEND_WITHIN_BUDGET` but `finalIntent=CAPABILITY`. The current guard only restores deterministic budget authority for planner `OTHER`; the existing regression covers only that branch.

### Contract and design

An explicitly parsed budget constraint is deterministic state evidence. `BUDGET_CONSTRAINT` or `RECOMMEND_WITHIN_BUDGET` must outrank incompatible planner intents while preserving compatible secondary product attributes. The fix belongs at the semantic authority gate, not in SQL, RAG, or the writer.

The regression must reproduce planner `CAPABILITY`, assert the budget remains persisted, and prove routing reaches budget-aware recommendation when decision context exists.

## P1 — Recommendation evidence sufficiency

### Evidence and first broken boundary

Ranking can return every candidate with `score=0` and `confidence=0`; the engine nevertheless selects the catalog's first row as winner. This makes incidental ordering an apparent commercial recommendation.

### Contract and design

A recommendation needs differentiating, authoritative evidence. When the top candidates have no comparable evidence or remain materially tied:

- do not label the first row as the winner;
- preserve any existing active product without silently changing focus;
- return a bounded clarification when one criterion can resolve the tie, otherwise present verified alternatives neutrally;
- expose the no-winner/tie reason in decision trace.

The ranking policy owns evidence sufficiency; the engine owns the safe no-winner response. Price cannot break a tie unless the customer supplied price/budget as a criterion.

## P1 — Conditional purchase interest

After the four roots above are green, add one contract regression for “si está disponible me interesa”. It must preserve STOCK authority, record commercial interest, and choose a useful bounded N+1 without asserting purchase or starting reservation prematurely. Implement only if the regression demonstrates the documented Live defect remains in the current code.

## Reservation execution gate

The repository documents `dbo.sp_IA_RegistrarReserva24h_Idempotente`, but its exact SQL Server signature and returned evidence are not authoritatively available. Do not invent parameters or connect execution. The backend may collect data and remain `READY`; certification must report real reservation execution as externally blocked until that contract is supplied and tested in QA.

## Operational authority document

Create `docs/STECH_BACKEND_AUTHORITY.md` as the single compact continuation document (target <=200 lines). It will reference historical evidence rather than duplicate it and contain only objective, architecture, authorities, invariants, frozen dimensions, open issues, latest evidence, QA rules, Definition of Done, and NEXT ACTION.

## Verification sequence

For each root: regression RED, minimal fix GREEN, adjacent regression, `git diff --stat`, focused diff review, and compact authority update. After all roots: full technical suite, build check, privacy inspection, and local conversational QA runner readiness. No GitHub Actions conversational QA.

## Definition of Done for this increment

- Reservation interruptions respect current intent and preserve safe state.
- No STECH trace sink emits raw PII or credentials; no duplicate JSONL events.
- Explicit budget evidence cannot be degraded by the planner.
- Zero-evidence/tied candidates cannot become arbitrary winners.
- All new regressions and existing 236-test baseline pass; build passes.
- Operational authority document is current and production remains untouched.
- Local conversational QA is prepared; Live certification and real reservation execution remain explicit gates when external evidence is required.

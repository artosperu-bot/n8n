# CHANGELOG ENGINEERING — STECH Ventas Consultivas

This log records confirmed engineering history. Do not fabricate dates or execution results.

## 2026-08-12 — P0 concurrency hardening baseline work

Historical repository evidence documents the P0 hardening program around safe renew, safe release, safe acquire, rollback scripts and concurrency QA. Files dated 2026-08-12 remain historical records of the state at that time; later CURRENT_STATE documentation may supersede their status conclusions without rewriting history.

Key P0 contract eventually closed/frozen:

- Acquire;
- Renew;
- Persist;
- Release;
- FIFO;
- idempotency;
- heartbeat;
- stale fencing;
- phantom acquire prevention;
- attempts control;
- recovery;
- TTL 120 s.

## P1 — Product/context foundation

### Capability truth

`17B` established tri-state capability semantics:

`SUPPORTED / NOT_SUPPORTED / UNKNOWN`

UNKNOWN must not collapse to false.

### Authority separation

- 16 — commercial final redactor
- 17 — state validation/reduction
- 17A — recommendation authority
- 17B — capability truth
- 21 — reservation authority
- 25 — transport/output

Recommendation reselection was removed from node 17.

### Context continuity

`06B Rehidratar Contexto Comparación` is frozen absent demonstrated regression.

## P2.1 — Fix history

### Fix 1 — node 04

Preserved comparison refs.

### Fix 1.2 — 17A Path B

Insufficient recommendation criteria no longer force a winner. The pair remains constrained, verified differences are preserved and one narrow criterion is requested.

### Fix 1.3 — 06C Consumir Criterio Pendiente

Criterion replies such as `Autonomía` are consumed as decision criteria instead of restarting discovery.

### Fix 1.4 — 04 + 15

Continuity work for confirmation/price progression.

### Fix 1.5 — 15C Acumular Evidencia Comercial

Introduced accumulated same-product commercial evidence.

### Fix 1.6 — node 04

Compound pending reduction: when `CONFIRMAR_PRECIO_STOCK` is pending and price was already shown while stock was not, an affirmative confirmation must progress to stock-only behavior.

## Prior fresh P2.1 trace

### T2 — execution 3768

- Result: PASS
- Activity: `Lo quiero para trabajo`

### T3 — execution 3770

- Result: PASS
- Message: `Compáralo con el Armor X13`
- Pair: Armor 22 + X13
- Third product: NO

### T4 — execution 3772

- Result: PASS
- Message: `¿Cuál me conviene más para trabajar?`
- Path: `B — INSUFFICIENT_CRITERIA`
- Pending criterion: `¿Para tu trabajo pesa más autonomía o memoria RAM?`

### T5 — execution 3774

- Result: PASS
- Message: `Autonomía.`
- Criterion normalized: `BATERIA`
- Recommended: Armor 22
- recommendation_pending: false

Execution IDs may belong to different QA sessions; preserve session identifiers where known.

## T6 — historical current-intent priority failure

Customer asks explicit price for Armor 22. Price is built correctly, but historical `COMPARAR` survives and node `17 Validar y Reducir Estado` can later replace the current price answer with `comparisonAnswer`.

Confirmed physical destructive writer: `17 Validar y Reducir Estado`.

Root class: `T6-B / T6-C`.

The upstream origin of stale `COMPARAR` has **not** been proven and must not be falsely assigned.

## Current T6 draft

- QA parent: `7fdfb2e4-f777-44ed-9cd6-74eca1f5119a`
- Draft: `6a20e2c8-7905-402d-8345-1f763bd4b688`
- Functional nodes changed: 1
- Changed node: `17 Validar y Reducir Estado`
- Production published: NO

Implemented rule: final `CURRENT_COMPARISON_HAS_PRIORITY` only fires when comparison is truly current-turn intent.

An earlier node17 comparison block remains an **UNVERIFIED** possible override. A second node17 edit is authorized only if fresh T6 proves it destructive.

## Fresh FAST TRACK

- Session: `P2_1_FASTTRACK_T6_20260816_2312`
- Execution: `3777`
- Initiated: YES
- Canonical output/state recovered sufficiently to certify: NO

Consequences:

- T6 NOT CERTIFIED
- R7 NOT EXECUTED
- R8 NOT EXECUTED
- R9 NOT EXECUTED
- negative confirmation NOT EXECUTED
- P2.1 NOT CLOSED
- P3 NOT FORMALLY STARTED


## 2026-08-17 — P2.1 functional closure

Fresh QA recovered execution `3777` and completed the required stateful sequence in session `P2_1_FASTTRACK_T6_20260816_2312`.

### Proven minimal fixes

- Node 17 only (`72122572-a5dd-484f-8da5-e44533277df5`): current-turn comparison signal now gates comparison ownership, preventing historical comparison state from overwriting explicit price.
- Node 06 only (`44af7809-24a3-490f-bcf0-73c1482af977`): grounded price and stock signals are preserved independently; stock-only confirmation does not re-add price.
- Node 21 only (`8b31e9a1-a9bb-4c44-b75e-d913cc3d6f34`): active reservation text owns the current turn only for reservation/purchase/cancellation/registration work, so explicit warranty answers are no longer overwritten.

Every functional change received independent static SPEC PASS / QUALITY PASS review. Production remained active on `ff0135de-a3ed-4757-83a1-80794b78bb2f`; no production publication occurred.

### Fresh execution results

- T1–T5: PASS (`3777`, `3779`–`3782`)
- T6 price: PASS after fix (`3784`)
- R7 stock-only confirmation: PASS after fix (`3786`)
- R8 purchase: PASS (`3787`)
- R9 warranty interruption: PASS after fix (`3789`)
- negative confirmation: PASS (`3790`–`3791`)
- adjacent price/stock/compare/purchase: PASS (`3792`, `3794`–`3796`)
- third-product contamination: NO in response or persisted comparison references

Execution `3793` was an invalid harness invocation with no chat message and is excluded from workflow-regression evidence.

P2.1 final dimensions passed: technical, context, commercial, coherence, SPIN, neuroventas, empathy, NBA/N+1 and real response.

**P2.1 FUNCTIONALLY CLOSED.**

Sanitized evidence: `qa/evidence/P2_1_FASTTRACK_T6_20260817.md`.

## 2026-08-17 — P3 measurable start

Fresh session `P3_QA_20260817_1503` executed greeting, work/budget recommendation, UNKNOWN capability truth and explicit product switch scenarios (`3797`–`3800`).

Confirmed results:

- greeting: PASS;
- work + budget recommendation: WEAK because explicit budget/activity were not persisted or reflected in the recommendation explanation;
- Armor 22 5G truth: PASS because UNKNOWN was stated without invention; commercial next step WEAK;
- product switch: technical PASS because active product became Armor X13; context WEAK because recommendation remained Armor X12 Pro and explicit-switch metadata remained false;
- observability: PARTIAL because execution ID is not persisted beside the conversation and internal ownership reconstruction requires execution-data access;
- security: CRITICAL OPEN because execution inspection can expose credential/auth material; no value is reproduced in repository evidence;
- production readiness: NOT READY.

P3 remains IN PROGRESS. Credential rotation/revocation, execution-output redaction and production infrastructure changes require explicit operational authorization.


## 2026-08-17 — P3 aggressive advance

### Product switch

- Node 06 now gives deterministic explicit-product evidence precedence over uncorroborated semantic recommendation/comparison classification.
- Node 17A demotes conflicting recommendations, persists explicit-switch state, clears product-bound commercial/purchase state and preserves unrelated context.
- Node 18 no longer rehydrates a previous product reservation after an explicit switch.
- Node 23 maps `cambio_producto_explicito` into the supported atomic conversation payload.

### Work and budget

- Node 06 gained grounded work-clause extraction and locale-aware budget ceilings.
- Node 17A recommendation rationale now connects verified work context and within-budget fit.

### Capability truth and commercial progression

- Node 17B adds a conditional useful next step only for a single canonical UNKNOWN capability.
- Institutional topics bypass generic capability detection.
- Supported sensitive capabilities are appended to, rather than replace, the canonical recommendation rationale.
- Node 17A blocks arbitrary recommendations without a grounded criterion.

### QA and readiness

- 30 commercial scenarios executed: 21 PASS, 9 WEAK, 0 overall FAIL after fixes.
- Compact final regression completed with comparison, price, stock, purchase, warranty, budget, switch, capability, objection, institutional, persistence, RAG isolation and third-product checks.
- P3 conversation candidate classified functionally ready with non-blocking commercial weaknesses.
- Production remains unpublished.

### Observability and security

- Execution-ID persistence attempt failed at runtime and was fully rolled back; atomic persistence reverified.
- Four SQL-bridge HTTP nodes confirmed with literal Authorization headers and no credential binding.
- Stable-endpoint, credential migration and rollback design added.


## 2026-08-18 — P3 commercial QA V3 and PRE-P4 preparation

Fresh access verification found workflow `RSVEmajGYTi8f8HJ` inactive, with zero triggers and `availableInMCP=false`. The `06 → 17A` switch boundary was therefore frozen; no workflow, Supabase data/schema, credential, tunnel or production mutation was made.

Read-only persisted evidence established a 50-message baseline with 44 question-ending responses, 9 template acknowledgement openings, 16 repeated confirmation questions and 6 repeated use questions. Historical session `P3V2_STRESS_15T_20260817_1925` demonstrates a referential target failure before SQL: Armor 22 remained recommended while the follow-up price request for “the recommended one” resolved to Armor X13. Exact node ownership remains unproven until trace access returns.

Added:

- a 58-case Commercial QA V3 containing all 20 mandatory naturalness prompts and 6 trace-gated switch/mention cases;
- a 20-turn ordered Long Conversation V2 covering recommendation, referents, interruption, switch, objection, buy signal and warranty;
- a standard-library deterministic evaluator plus 5 passing unit tests and a passing two-case fixture;
- a sanitized evidence/owner audit;
- a design-only PRE-P4 package with pilot phases, human handoff, rollback, metric and 12-case preflight smoke coverage.

These artifacts are verified for structure and evaluator behavior only. They do not represent fresh workflow execution results, a closed commercial defect, P4 start or production readiness.


## 2026-08-18 — QA V3 / Long V2 execution blocked by MCP gate

Attempted to execute the prepared 58-case commercial suite and 20-turn ordered conversation against `RSVEmajGYTi8f8HJ`.

Verified access result:

- workflow search returns `availableInMCP=false`, inactive and zero triggers;
- workflow detail, version history and execution search all return `Workflow is not available in MCP`;
- read-only Supabase verification found no new QA results after the prior audited turn.

To prevent incomplete runs from being reported as PASS or functional FAIL, the deterministic evaluator gained an explicit `NOT_EXECUTABLE_DUE_MCP → NOT_EVALUATED` branch and exit code `3`. The change followed red/green TDD; 6/6 tests pass, the ordinary passing fixture remains exit `0`, and the blocked suite returns exit `3`.

Added machine-readable results for all 58 + 20 planned cases and a human-review gate report. Totals: 0 executed, 0 PASS, 0 functional FAIL, 78 NOT_EVALUATED. Human handoff 0/6 and PRE-P4 smoke 0/12 were not executable. No production or data mutation occurred, no root fix was applied, and P4 did not start.


## 2026-08-18 — P3 budget-routing war-room root isolation and prepared patch

The war-room request narrowed P3 to one functional root:

`BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION`

One n8n tool-surface attempt was made as required; the n8n namespace remained unavailable. Work therefore continued on the independent paths using current GitHub memory, read-only Supabase evidence, and the closest available workflow source.

### Root evidence

Late persisted QA proves budget extraction/persistence already works:

- pure budget values are stored in `presupuesto_activo` but can still be classified `TRATAR_OBJECION` with deterministic strategy `VALIDAR_Y_AISLAR_PRESUPUESTO`;
- budget supplied after a real battery problem can be stored as SPIN `IMPLICATION` and route to `APORTAR_DATO_SPIN`;
- direct `¿Cuál sí entra en mi presupuesto?` can reopen generic criterion discovery.

The closest available workflow source proves `06 Resolver Turno y Estado` as the first physical broken boundary for the SPIN branch: grounded LLM SPIN candidates are accepted without excluding budget facts, and accepted SPIN can clear other intents and become `APORTAR_DATO_SPIN`.

The exact current-draft node that produces deterministic strategy `VALIDAR_Y_AISLAR_PRESUPUESTO` is not source-visible in this session and remains **UNVERIFIED**. No node name was fabricated.

### Prepared fix and TDD

A narrow, current-turn-budget-gated guard was prepared at:

`qa/patches/P3_BUDGET_ROUTING_GUARD_NODE06.js`

It separates:

- `BUDGET_CONSTRAINT`;
- `PRICE_OBJECTION`;
- `SPIN_CONTRIBUTION`.

It also preserves mixed genuine SPIN + budget turns, real price objections, direct budget-fit routing, and is a no-op for referent/buy/ACK neighbor turns.

TDD result:

- RED: test failed before implementation because the guard module did not exist;
- GREEN: guard/test syntax PASS;
- B1–B7 static contract PASS;
- mixed budget/use preservation PASS;
- B8–B10 budget-guard no-op PASS.

Artifacts added:

- `qa/patches/P3_BUDGET_ROUTING_GUARD_NODE06.js`;
- `qa/tools/test_budget_routing_guard.js`;
- `qa/results/P3_BUDGET_ROUTING_DELTA_20260818.json`;
- `qa/evidence/P3_BUDGET_ROUTING_FIX_20260818.md`;
- `qa/evidence/P3_FINAL_FUNCTIONAL_SCORECARD_20260818.md`;
- `qa/evidence/P3_PROMOTION_REVIEW_PACKAGE_20260818.md`.

### Critical boundary

No live QA draft edit occurred. No post-fix live B1–B10 run occurred. No real post-fix human review, impacted regression, Long V2 T03–T08 mini-chain or 12-case smoke occurred.

Therefore:

- live B1–B10 = 0/10 post-fix;
- known CRITICAL defects newly demonstrated = 0;
- known MAJOR defects = 1 (budget routing root);
- RC = NOT CREATED;
- promotion package = prepared/staged, current GO/NO-GO = NO-GO;
- production = UNCHANGED;
- P4 = NOT STARTED.

Exact continuation is current-draft integration of the prepared guard, then B1–B10, critical neighbors, Long V2 budget chain, smoke, and clean QA RC only if no CRITICAL/MAJOR functional defect remains.

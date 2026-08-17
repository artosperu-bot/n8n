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

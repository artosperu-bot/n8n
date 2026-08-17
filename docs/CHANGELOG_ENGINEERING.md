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

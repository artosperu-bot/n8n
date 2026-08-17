# CURRENT STATE — 2026-08-17

## Status vocabulary

Use only these labels when freezing knowledge:

- **CONFIRMED** — demonstrated by reliable evidence.
- **OBSERVED** — seen in execution/output but not yet generalized.
- **HISTORICAL** — valid evidence from an earlier state/version/session.
- **UNVERIFIED** — plausible risk/hypothesis not yet demonstrated by fresh QA.
- **DEFERRED** — intentionally postponed.

Never promote a hypothesis to project truth.

---

## Production identity

- Project: STECH / S&T Store — AI Sales Agent
- Main workflow: `STECH Ventas Consultivas`
- Workflow ID: `c661Gw0xoqZBsNtf`
- Stack: n8n + Supabase/PostgreSQL + SQL Server/ERP + RAG + LLM
- Historical baseline: `V45.68`
- Hardened P0 production line: `V45.70`

---

## P0 — Concurrency

**Status: CLOSED / FROZEN**

Production concurrency contract:

`Acquire → Renew → Persist → Release`

with:

- FIFO;
- strict idempotency;
- lease heartbeat;
- stale fencing;
- phantom acquire prevention;
- attempt control;
- recovery;
- TTL = 120 seconds.

Known validated behavior:

- same session + same `message_id` → `ACQUIRED / ALREADY_PROCESSING`;
- different sessions + same `message_id` → `MESSAGE_SESSION_MISMATCH`;
- phantom locks → PASS;
- Renew → PASS;
- Release → PASS;
- stale/persist fencing → PASS;
- residue cleanup → PASS.

**Protection rule:** P0 must not be changed for commercial/conversation bugs unless an actual P0 regression is demonstrated.

Historical files dated 2026-08-12 remain valid as history even where they describe work that was pending at that earlier moment.

---

## P1 — Product/context foundation

**Status: FOUNDATION CLOSED; selected tooling work may remain deferred**

### P1.1 Capability truth

`17B` uses tri-state semantics:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `UNKNOWN`

Never collapse `UNKNOWN` into false.

Authorized capability truth currently recorded for QA:

| Product | NFC | Night vision | 5G | Thermal |
|---|---|---|---|---|
| Armor 22 | SUPPORTED | SUPPORTED | UNKNOWN | UNKNOWN |
| Armor X13 | SUPPORTED | SUPPORTED | UNKNOWN | UNKNOWN |
| Armor 25T Pro | SUPPORTED | SUPPORTED | SUPPORTED | SUPPORTED |
| Armor X12 Pro | SUPPORTED | UNKNOWN | UNKNOWN | UNKNOWN |

Armor 22 canonical identity:

- canonical: `P-ARMOR-22-256G`
- producto_codigo: `P000049`
- SKU: `ARMOR-22-256G`

### P1.2 Authority separation

- `16` — commercial final redactor
- `17` — state validation/reduction
- `17A` — canonical recommendation authority
- `17B` — capability truth
- `21` — reservation authority
- `25` — transport/output

Recommendation reselection was removed from `17`.

### P1.3 Context continuity

`06B Rehidratar Contexto Comparación` is considered closed/frozen absent demonstrated regression.

### P1.4 Source isolation

Deferred/tooling-dependent where still applicable.

---

## P2 — Conversational/commercial correctness

### P2.1

**Status: ACTIVE / NOT CLOSED**

Historical issue classes already identified:

- comparison refs lost;
- memory preference incorrectly treated as evidence;
- stale recommendation affecting reservation;
- price confirmation loops;
- generic discovery after valid commercial turns;
- compound price/stock confirmation;
- historical comparison hijacking explicit current intent.

### Fix history

#### Fix 1 — node 04
Preserved comparison refs.

#### Fix 1.2 — 17A Path B
When recommendation criteria are insufficient:

- do not force a winner;
- keep the pair constrained;
- explain verified differences;
- ask ONE narrow criterion.

#### Fix 1.3 — 06C Consumir Criterio Pendiente
A response such as `Autonomía` is consumed as a decision criterion instead of restarting discovery.

#### Fix 1.4 — 04 + 15
Continuity work for confirmation/price progression.

#### Fix 1.5 — 15C Acumular Evidencia Comercial
Introduced accumulated same-product commercial evidence.

#### Fix 1.6 — node 04
Compound pending reduction. If pending is `CONFIRMAR_PRECIO_STOCK`, previous state already has price shown and stock not shown, a confirmation such as `Sí, está bien` must progress to **stock only**.

---

## Current T6 root

**CONFIRMED historical destructive writer:** `17 Validar y Reducir Estado`.

Historical failing behavior:

1. customer asks `¿Cuál es el precio?` for Armor 22;
2. current turn resolves price correctly;
3. historical `COMPARAR` survives;
4. node 17 builds the price answer;
5. comparison logic later assigns `answer = comparisonAnswer`;
6. NBA/pending may be cleared/rejected;
7. customer receives a comparison instead of the requested price.

Classification: `T6-B / T6-C`.

**Important:** the upstream origin of historical `COMPARAR` has **not** been proven. Do not falsely attribute it.

---

## Current T6 fix draft

- QA parent: `7fdfb2e4-f777-44ed-9cd6-74eca1f5119a`
- First T6 fix draft: `6a20e2c8-7905-402d-8345-1f763bd4b688`
- Functional nodes changed: `1`
- Changed node: `17 Validar y Reducir Estado`
- Production published: **NO**

Implemented rule: final `CURRENT_COMPARISON_HAS_PRIORITY` must fire only when comparison is truly current-turn comparison intent.

Do **not** mark PASS yet.

### Remaining node17 risk

An earlier node17 block can build `comparisonAnswer`, assign `answer = comparisonAnswer`, and reject NBA based on historical `has('COMPARAR')`.

Status: **UNVERIFIED**.

Second node17 edit is authorized only if fresh T6 proves this earlier block is still destructive.

---

## Fresh QA

- Session: `P2_1_FASTTRACK_T6_20260816_2312`
- Fresh execution: `3777`
- Execution initiated: YES
- Canonical output/state recovered sufficiently for certification: NO

Therefore:

- T6: **NOT CERTIFIED**
- R7: **NOT EXECUTED**
- R8: **NOT EXECUTED**
- R9: **NOT EXECUTED**
- negative confirmation: **NOT EXECUTED**
- P2.1: **NOT CLOSED**
- P3: **NOT FORMALLY STARTED**

---

## Prior useful P2.1 trace

- T2 — execution `3768`: PASS; activity `Lo quiero para trabajo`.
- T3 — execution `3770`: PASS; `Compáralo con el Armor X13`; pair Armor 22 + X13; no third product.
- T4 — execution `3772`: PASS; `¿Cuál me conviene más para trabajar?`; Path B `INSUFFICIENT_CRITERIA`; pending criterion `¿Para tu trabajo pesa más autonomía o memoria RAM?`.
- T5 — execution `3774`: PASS; `Autonomía.` normalized to `BATERIA`; recommended Armor 22; `recommendation_pending=false`.
- Historical T6 then failed because stale comparison priority overrode explicit price intent.

Execution numbers can belong to different QA sessions. Preserve session identifiers whenever known.

---

## P2.1 closure contract

P2.1 closes only after fresh verification of:

1. comparison;
2. criterion creation;
3. criterion consumption;
4. recommendation;
5. explicit price;
6. stock/availability confirmation;
7. purchase intent;
8. warranty;
9. negative confirmation;
10. no third-product contamination.

Every checkpoint must be evaluated across:

- TECHNICAL
- CONTEXT
- COMMERCIAL
- COHERENCE
- N+1
- REAL RESPONSE

---

## Exact continuation point

`recover/certify execution 3777 → complete fresh T6 → optional second node17-only fix IF fresh evidence proves it → R7 stock → R8 purchase → R9 warranty → negative confirmation → close P2.1 → formally start P3`

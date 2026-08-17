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

**Status: FUNCTIONALLY CLOSED**

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

## Final P2.1 QA drafts

- QA parent: `7fdfb2e4-f777-44ed-9cd6-74eca1f5119a`
- Node 17 current-intent fix: `72122572-a5dd-484f-8da5-e44533277df5`
- Node 06 grounded stock-confirmation fix: `44af7809-24a3-490f-bcf0-73c1482af977`
- Final node 21 reservation-interruption fix: `8b31e9a1-a9bb-4c44-b75e-d913cc3d6f34`
- Functional nodes changed across the root-cause sequence: `3`, one at a time
- Independent static review for every change: SPEC PASS / QUALITY PASS
- Production published: **NO**
- Production active version remains: `ff0135de-a3ed-4757-83a1-80794b78bb2f`

---

## Fresh QA closure

- Main session: `P2_1_FASTTRACK_T6_20260816_2312`
- Negative-confirmation session: `P2_1_NEG_CONFIRM_20260817_1455`
- T1/T2/T3/T4/T5: PASS (`3777`, `3779`–`3782`)
- T6: PASS after proven node-17-only correction (`3784`)
- R7: PASS after proven node-06-only correction (`3786`)
- R8 purchase: PASS (`3787`)
- R9 warranty: PASS after proven node-21-only correction (`3789`)
- Negative confirmation: PASS (`3790`–`3791`)
- Adjacent price/stock/compare/purchase: PASS (`3792`, `3794`–`3796`)
- Third-product contamination: NO in customer answer or persisted comparison references
- Final persisted context: version 16; active/recommended Armor 22; refs `P000049` + `Armor X13`; reservation `RECOLECTANDO_DATOS`
- Sanitized evidence: `qa/evidence/P2_1_FASTTRACK_T6_20260817.md`

P2.1 dimensions: TECHNICAL, CONTEXT, COMMERCIAL, COHERENCE, SPIN, NEUROVENTAS, EMPATHY, NBA/N+1 and REAL RESPONSE = **PASS**.

**P2.1: FUNCTIONALLY CLOSED.**

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

## P3 — measurable start

**Status: IN PROGRESS**

Fresh session `P3_QA_20260817_1503` produced:

- greeting PASS (`3797`);
- work + budget recommendation WEAK (`3798`): an in-budget rugged model was recommended, but explicit budget/activity were not persisted or reflected in the explanation;
- unknown 5G capability truth PASS / commercial WEAK (`3799`): UNKNOWN was not invented as supported or unsupported, but no useful next step was offered;
- product switch TECHNICAL PASS / CONTEXT WEAK (`3800`): active product changed to Armor X13 while recommendation remained Armor X12 Pro and explicit-switch metadata remained false.

Observability: **PARTIAL**. Core conversation and state are reconstructable, but execution ID is not persisted beside the conversation and internal owner/action reconstruction requires execution-data access.

Security: **CRITICAL OPEN**. Execution inspection can expose credential/auth material. Do not reproduce it. Rotation/revocation, output redaction, retention/PII review and controlled SQL-bridge configuration require explicit operational authorization.

Production readiness: **NOT READY**. Production remains unchanged and no QA draft was published.

## Exact continuation point

`P3 root-cause isolation for budget/activity persistence and product-switch recommendation coherence → observability correlation/redaction design → credential rotation authorization → compact final QA matrix → production-readiness reassessment`

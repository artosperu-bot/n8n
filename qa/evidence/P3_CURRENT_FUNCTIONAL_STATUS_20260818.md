# P3 CURRENT FUNCTIONAL STATUS — 2026-08-18

## Scope

Workflow: `RSVEmajGYTi8f8HJ`

Known current QA draft: `5f85527f-06ca-4ece-ac05-609de68b4754`

Branch: `p0-concurrency-hardening`

Production mutation: **NO**

This document separates functional defects from certification/observability gaps. It must not be read as a production-promotion authorization.

## Current decision

**P3 BLOCKED — FUNCTIONAL ROOT**

Specific unresolved functional root:

`BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION`

An explicit budget is correctly extracted/persisted in `presupuesto_activo`, but the conversational decision layer can still consume the same turn as SPIN `IMPLICATION` or as a price objection. This produces forced discovery or objection handling instead of treating budget as a commercial constraint.

## Evidence chronology

### Referential C — historical fail, later recovered

A prior persisted session `P3_T11_TARGET_1787096872833` showed a wrong immediate referent after recommendation: the assistant recommended Armor 22 and later answered `¿Y tiene stock ese?` for stale active Armor X12 Pro.

A later full Long V2 RC session `P3_LONG_V2_RC_1787097074583` exercises the same authority conflict with active Armor X13 and recommended Armor 22 and resolves correctly:

- `¿Cuál me recomiendas entre los dos?` → recommended Armor 22;
- `¿Cuánto cuesta el recomendado?` → Armor 22, S/ 1,399;
- institutional interruption preserves recommendation/context;
- `¿Y tiene stock ese?` → Armor 22, available;
- pending action product → Armor 22.

The same later conversation explicitly switches with `Mejor hablemos del Armor 25T Pro.`; the subsequent `Creo que me quedo con ese.` correctly resolves Armor 25T Pro. Therefore the later `me quedo con ese` behavior is not a stale-active regression.

Result: **C = latest persisted functional path GREEN; current-head live trace still pending.**

### A — other store

Historical post-fix evidence in `P3_QAV3_FINAL2` treats `Voy a comparar con otra tienda.` as competitor/objection context without hijacking the alternate-product referent and without explicit product switch.

Result: **A = PROVISIONAL GREEN; no newer contrary functional evidence found.**

### B — ACK/CLOSE

Historical post-fix rows such as `Ya entendí.` and `Gracias, eso era todo.` preserve product state, do not add a SPIN contribution, do not force a question and close with NBA `NONE`/graceful close behavior.

Result: **B = PROVISIONAL GREEN; no newer contrary functional evidence found.**

## Unresolved functional root — budget routing

The defect is repeated across multiple late batches, including the latest full Long V2 RC:

- `Tengo un presupuesto máximo de S/ 1,500.` / `Podría gastar hasta S/ 1,500.` persists `presupuesto_activo=1500` but can be classified `APORTAR_DATO_SPIN` with `spin_aporte=IMPLICATION`.
- The response ignores the newly supplied budget and asks an implication/need question about battery consequences.
- Standalone budget messages such as `Tengo máximo S/ 900.` can be classified as `TRATAR_OBJECION`, even though the customer has stated a constraint rather than an objection.
- `¿Cuál sí entra en mi presupuesto?` can defer the direct commercial answer and reopen criterion discovery.

This is not a storage failure: budget extraction/persistence works. The failure is semantic routing/precedence after extraction and before final NBA/redaction.

Likely owner boundary, based on the persisted fields and historical writer map: interpretation → typed SPIN canonization → turn/state reduction. Exact current-draft physical node is **UNVERIFIED** while the n8n execution/detail surface is unavailable.

## General fix contract required

Do not hardcode amounts, products or phrases.

1. An explicit budget statement is a **commercial constraint**, not automatically SPIN and not automatically a price objection.
2. If budget is extracted from the current turn, suppress SPIN contribution from that same text unless independent, explicit SPIN content is also present.
3. Only route to price objection handling when the customer actually objects to price/value (`caro`, `muy alto`, equivalent semantics), not merely because a monetary ceiling exists.
4. If the customer asks which option fits the budget, answer/filter using the known budget first; ask at most one criterion only when it is genuinely necessary to choose among feasible options.
5. NBA must use the budget as a decision constraint and must not manufacture an implication from prior problem context.

## Functional scorecard

| Issue | Severity | Evidence | Owner | Status | Fix needed | Blocks P3? |
|---|---|---|---|---|---|---|
| Budget constraint routed as SPIN implication / price objection | MAJOR | FINAL2, T11, latest full Long V2 RC | interpretation → SPIN canonization → turn reducer; exact current node pending | OPEN | YES | YES |
| Recommended/salient `ese` falls back to stale active | CRITICAL historical | T11 fail; later exact conflict passes in Long V2 RC | referential target resolution | RECOVERED in later evidence | NO unless fresh regression | NO |
| `otra tienda` hijacks `el otro` | CRITICAL historical | post-fix FINAL2 | referential resolver | PROVISIONAL GREEN | NO unless fresh regression | NO |
| ACK/CLOSE restarts SPIN | MAJOR historical | post-fix FINAL2 | intent/SPIN/NBA | PROVISIONAL GREEN | NO unless fresh regression | NO |
| Institutional location fetch empty | MAJOR historical | one FINAL2 error | institutional evidence path | RECOVERED later: Long V2 RC answered location correctly | NO unless fresh regression | NO |
| Current-head internal trace unavailable | EVIDENCE-ONLY | n8n tool surface unavailable in current session | tooling/observability | OPEN | YES for certification only | NO functional block by itself |

## Preserved gates

- Long V2 execution contract: `20/20 GREEN` remains recorded; however the latest persisted conversation exposes the budget-routing commercial weakness described above, which was not adequately represented by the binary green label.
- Semantic switch suite: `11/11 GREEN`, no fresh contrary evidence.
- P0: closed/frozen.
- P1: closed.
- P2.1: closed.

## Release candidate

**NOT CREATED.**

A QA RC is not authorized while the MAJOR budget-routing defect remains open.

## Exact next action

Recover safe edit/execution access to the **current QA draft**, apply the general budget-routing precedence rule at the first proven current-draft owner, then run a delta regression covering: pure budget statement, budget + prior battery problem, `¿Cuál sí entra en mi presupuesto?`, genuine `Está caro`, and one referential/purchase neighbor to prove no regression.

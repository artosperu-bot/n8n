# P3 BUDGET ROUTING FIX — WAR ROOM 2026-08-18

## Status

**PREPARED / STATICALLY TESTED / NOT APPLIED TO LIVE QA DRAFT**

Workflow: `RSVEmajGYTi8f8HJ`
Known QA draft: `5f85527f-06ca-4ece-ac05-609de68b4754`
GitHub start HEAD: `20dcab23a36f87d41bb11dd19eaaeafa920749c1`
Production mutation: **NO**

## Root

`BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION`

Read-only Supabase evidence separates persistence from routing:

- `P3_QAV3_FINAL2_13_1787095937571` — `Tengo máximo S/ 900.` persisted `presupuesto_activo=900`, but turn became `TRATAR_OBJECION` and NBA `HANDLE_OBJECTION`.
- `P3_QAV3_FINAL2_55_1787096594206` — budget `1500` persisted, but the budget sentence was stored in `spin_estado.implicaciones`.
- `P3_T11_TARGET_1787096872833` and `P3_LONG_V2_RC_1787097074583` repeat the same pure-budget-as-Implication pattern.
- `P3_QAV3_FINAL2_58_1787096633528` persisted budget `900`, but `¿Cuál sí entra en mi presupuesto?` reopened criterion discovery instead of answering/filtering first.

Therefore the root is not budget storage. It is current-turn semantic precedence after extraction and before NBA/redaction.

## First proven physical owner

**`06 Resolver Turno y Estado` — proven for the SPIN contamination branch.**

The closest available workflow source shows this node:

1. trusts LLM `spin_candidatos` when type/nature/evidence are grounded;
2. does not exclude a current-turn commercial budget fact from SPIN candidates;
3. if accepted SPIN exists and no protected explicit intent exists, clears intents and sets `APORTAR_DATO_SPIN`;
4. downstream SPIN progression then consumes that already-contaminated decision.

That is sufficient to prove the first broken boundary for the `budget → IMPLICATION → APORTAR_DATO_SPIN` path.

### Pure-budget → price-objection writer

The persisted turn exposes a deterministic rule (`source=REGLA`, strategy `VALIDAR_Y_AISLAR_PRESUPUESTO`), but the current live draft source containing that exact rule is not available in this session. Its exact physical node remains **UNVERIFIED**. Do not fabricate a node name.

The prepared guard is intentionally placed at the earliest proven semantic boundary so downstream objection/SPIN decisions can consume a canonical budget authority instead of reinterpreting the text.

## General semantic fix

Define three independent signals:

- `BUDGET_CONSTRAINT`
- `PRICE_OBJECTION`
- `SPIN_CONTRIBUTION`

Rules:

1. A budget ceiling/range is a commercial constraint.
2. Budget alone cannot create SPIN Situation/Problem/Implication/Need.
3. Budget alone cannot create price objection.
4. Genuine objection language may coexist with a budget.
5. Mixed turns retain both the real SPIN fact and the budget; the budget clause is removed from the SPIN candidate rather than deleting the whole turn.
6. A direct budget-fit question (`¿Cuál sí entra en mi presupuesto?`) is an explicit commercial request and must route to filtering/recommendation using persisted budget and authoritative prices before generic discovery.
7. No amounts, product names, or exact customer sentences are hardcoded.

## Prepared implementation

Artifact: `qa/patches/P3_BUDGET_ROUTING_GUARD_NODE06.js`

Integration target: **current live implementation of `06 Resolver Turno y Estado`**, after message normalization/current-turn extraction and before SPIN candidate acceptance/intent finalization.

The guard:

- parses cap/range budget forms with locale-tolerant numeric normalization;
- distinguishes real price-objection semantics;
- marks direct budget-fit questions;
- rejects budget-only SPIN candidates;
- strips a budget clause from mixed SPIN candidates while preserving the meaningful residual fact;
- is a no-op for unrelated referent/buy/ACK turns.

The current-draft source must be re-read before inserting this code so field names are mapped to the live structures rather than copied blindly from the available historical export.

## TDD evidence

RED first:

`node test_budget_routing_guard.js` failed with `MODULE_NOT_FOUND` because the guard did not exist.

GREEN after implementation:

- syntax check guard: PASS
- syntax check tests: PASS
- B1–B7 contract tests: PASS
- mixed budget + use preservation: PASS
- B8–B10 budget-guard no-op tests: PASS

This is **static contract evidence only**. It is not a substitute for fresh execution against draft `5f85527f-06ca-4ece-ac05-609de68b4754`.

## Live delta required

B1–B10 remain mandatory against the impacted QA draft after applying the patch. In particular:

- B1/B2/B3 must persist budget without fake objection/SPIN.
- B4 must preserve the prior battery problem but not create a new implication from budget.
- B5 must answer/filter by budget first.
- B6 must keep genuine price objection working.
- B7 must retain both objection and budget.
- B8/B9/B10 must prove no regression to referent, buy progression, or ACK/CLOSE.

## Change impact

Prepared code is narrow and gated by current-turn budget semantics. It does not rewrite SPIN, NBA, redactor, recommendation, referential, purchase, or switch engines.

If the current draft can accept the same narrow guard and B1–B10 + critical neighbors are GREEN, a ritual full 58 rerun is not automatically required. Run the affected V3 subset, critical regression, 12-case smoke, and the Long V2 budget mini-chain. If integration requires broad shared-routing changes, run the full 58.

## Current decision

**FIX NOT LIVE-CLOSED.**

Reason: n8n edit/execution surface and current-draft source were unavailable. The exact prepared guard exists and its static contract passes, but the functional root remains open until the current QA draft is changed and exercised.

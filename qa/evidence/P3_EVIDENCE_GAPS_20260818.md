# P3 EVIDENCE GAPS — 2026-08-18

## Purpose

Track certification/observability gaps separately from functional defects. An evidence gap does not automatically mean a functional failure, and a functional defect must not be hidden by an execution-success label.

## Current live tooling gap

Workflow: `RSVEmajGYTi8f8HJ`

Known QA draft: `5f85527f-06ca-4ece-ac05-609de68b4754`

In the current work session, bounded n8n discovery did not expose an invokable n8n namespace. Therefore the following current-draft checks cannot be performed through the connector:

- workflow details;
- current draft node code;
- safe manual execution of the draft;
- execution history/data read;
- compact internal node trace.

This is an **EVIDENCE-ONLY blocker** for fresh current-head certification. It is not the reason P3 is functionally blocked.

## Functional blocker is separate

P3 is functionally blocked by a demonstrated MAJOR budget-routing defect in late persisted QA conversations:

`BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION`

Even if the n8n trace channel were perfect, that observed behavior would still require correction and delta regression.

## A/B/C evidence state

### A — other store

Status: **PROVISIONAL GREEN**.

Post-fix persisted evidence separates competitor/store language from alternate-product referents. Fresh current-head internal trace is unavailable.

### B — ACK/CLOSE

Status: **PROVISIONAL GREEN**.

Post-fix persisted evidence shows no new SPIN contribution, no forced question and graceful-close/NBA NONE behavior. Fresh current-head internal trace is unavailable.

### C — salient/recommended referent

Status: **LATEST PERSISTED FUNCTIONAL PATH GREEN / CURRENT-HEAD TRACE PENDING**.

An earlier T11 session contained a wrong referent after recommendation, but the later full Long V2 RC replays the stronger conflict state (active Armor X13, recommended Armor 22) and resolves both `el recomendado` and `ese` to Armor 22. A later explicit switch to Armor 25T Pro is also preserved through `me quedo con ese` and purchase intent.

## QA V3 evidence

`P3_QAV3_FINAL2` is a real persisted 58-session batch (141 conversation rows), but it is not being relabeled as a fresh current-head certification because the exact linkage to final draft `5f85527f-06ca-4ece-ac05-609de68b4754` cannot currently be proven through n8n execution metadata.

Use it as historical/post-fix functional evidence, not as `58/58 current-head certified`.

## Long V2 evidence

The latest complete persisted Long V2 RC contains 20 turns and no `error_detectado` rows. Its existing binary execution gate remains recorded as `20/20 GREEN`.

Manual commercial review adds an important qualification not captured by that binary label: a pure budget statement is classified as SPIN `IMPLICATION`, making commercial quality MAJOR-fail on that behavior surface.

## Semantic switch

Existing `11/11 GREEN` remains preserved. No newer persisted evidence reviewed here demonstrates a switch regression.

## Institutional recovery

One earlier QA V3 row for `¿Dónde están?` had an institutional evidence-fetch error and returned no location. A later Long V2 RC institutional interruption correctly returns Av. Honorio Delgado 224, San Martín de Porres, Lima while preserving product/recommendation context. Therefore the earlier failure is not treated as the current functional root.

## Certification gaps that remain after the functional fix

After repairing budget routing, fresh evidence should be limited to delta surfaces unless the changed node is broad enough to justify full QA V3:

- pure budget statement does not become SPIN;
- budget after an existing battery problem still remains budget, not implication;
- `¿Cuál sí entra en mi presupuesto?` answers the budget constraint before optional discovery;
- genuine price objection (`Está caro`) still routes to objection handling;
- latest referential `recommended → ese → stock` behavior does not regress;
- purchase progression does not regress;
- if the changed current node has broad cross-intent ownership, rerun full 58 plus human review.

## Release status

No QA RC should be created while the MAJOR functional root is open.

Production remains unchanged.

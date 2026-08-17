# P3 Execution 3798 Work and Budget Plan

**Goal:** Persist explicit work context and budget from a recommendation turn and explain how the selected product fits both.

**Architecture:** Node 06 owns deterministic extraction and canonical merge. Node 17A owns recommendation ranking and rationale. Existing atomic persistence stores the resulting canonical fields.

## Task 1: Recover facts at node 06

- [x] Reproduce 3798 and confirm the interpreter omitted both facts.
- [ ] Add general locale-aware monetary parsing for explicit budget/currency statements.
- [ ] Add general explicit `trabajo de/en/como` extraction that survives a simultaneous recommendation request.
- [ ] Validate node isolation and rerun a fresh equivalent turn.
- [ ] Require provisional activity and budget before inspecting downstream behavior.

## Task 2: Explain the constrained recommendation at node 17A

- [ ] Verify whether the GREEN node-06 execution names both work fit and budget.
- [ ] If not, add only the missing truthful rationale from canonical activity, budget, selected price, and verified criterion.
- [ ] Validate node isolation and rerun fresh.

## Task 3: Persisted readback and adjacent regression

- [ ] Read `ia_conversaciones.contexto_comercial_snapshot` and `ia_contexto`.
- [ ] Require activity and budget parity with runtime state.
- [ ] Run a follow-up product question and confirm both values survive.
- [ ] Record sanitized evidence; do not publish production.

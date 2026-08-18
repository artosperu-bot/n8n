# P3 Commercial Hardening + PRE-P4 Design

Date: 2026-08-18  
Workflow under QA: `RSVEmajGYTi8f8HJ`  
Supabase project: `iipamvqbipbolchlozoj`

## Scope

This design advances commercial QA and PRE-P4 readiness without modifying the
unobservable `06 -> 17A` switch boundary. P0, P1 and P2.1 remain frozen. No
workflow publication, activation, deactivation or production mutation is in
scope.

## Evidence-backed roots

1. **Referential target loss.** Session `P3V2_STRESS_15T_20260817_1925`
   persisted `producto_recomendado=Armor 22` while `producto_activo=Armor X13`.
   The follow-up `¿Cuánto cuesta el recomendado?` reached SQL with Armor X13 as
   the resolved product. The first visible broken boundary is referential target
   resolution before SQL; its exact n8n node owner remains unproven while MCP is
   disabled.
2. **Product mention/opinion misread as SPIN Situation.** `También vi el Armor
   22.` and `El Armor 22 me parece resistente.` were persisted as
   `APORTAR_DATO_SPIN / SITUATION`, producing NBA `EXPLORE_PROBLEM`.
3. **Redactor echo.** Both cases were physically written by `REDACTOR` and begin
   by repeating the customer's message before a generic benefit.
4. **Question overuse has more than one writer.** NBA types such as
   `OFFER_PRICE_STOCK` and `FAST_PRICE_NEXT_STOCK` force questions in redactor
   and deterministic paths. Separately, some rows with `NBA=NONE` still end in
   a redactor-added question.

These findings authorize regression artifacts, not a workflow fix. The exact
node owner must be observable before workflow code is changed.

## Deliverables

- A 58-case Commercial QA V3 definition covering direct intent, product truth,
  use/problem/budget, reference follow-ups, comparison, recommendation,
  objections, buying signals, institutional answers and switch/mention guards.
- A 20-turn long-conversation V2 definition with canonical referential state.
- A standard-library evaluator that checks deterministic state and response
  contracts and explicitly leaves human quality dimensions for review.
- Sanitized P3 baseline evidence and owner classification.
- A PRE-P4 package containing promotion, rollback, smoke, pilot, handoff and
  commercial metric gates.

## QA boundary

Automated assertions may certify only deterministic facts:

- resolved product/reference target;
- active/recommended product;
- explicit-switch flag;
- intent, route and NBA class;
- required or forbidden response facts;
- maximum question count;
- user echo and template acknowledgement guards.

Naturalness, empathy, persuasion, coherence and benefit quality remain human
review dimensions. The evaluator must never convert heuristic style checks into
automatic commercial certification.

## Exit criteria

- Artifacts parse and their evaluator tests pass.
- Every QA case has a stable unique ID, deterministic assertions and human
  review dimensions.
- Referential tests prefer explicit referential role over active product.
- Switch/mention tests are marked as trace-gated while MCP remains unavailable.
- PRE-P4 material is design-only and cannot activate a real-user pilot.
- Production remains unchanged.

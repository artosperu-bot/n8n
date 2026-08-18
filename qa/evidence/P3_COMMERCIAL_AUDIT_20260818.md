# P3 commercial audit — 2026-08-18

Status: evidence package only. No workflow, database, credential, tunnel, or production mutation was performed.

## Access boundary

- Workflow: `RSVEmajGYTi8f8HJ` (`My workflow`)
- n8n state observed on 2026-08-18: inactive, zero triggers, `availableInMCP=false`
- `get_workflow_details` returned: `Workflow is not available in MCP. Enable MCP access...`
- Consequence: the `06 → 17A` boundary remains frozen. No node ownership is guessed and no workflow fix is claimed.

## Read-only Supabase baseline

The refreshed baseline uses the latest 50 distinct persisted P3 messages available at audit time. The newest observed message was at `2026-08-18 19:22:01 UTC`; no later rows were present.

| Metric | Count | Rate |
|---|---:|---:|
| Sampled responses | 50 | 100% |
| Responses ending in a question | 44 | 88% |
| Template acknowledgement openings | 9 | 18% |
| Unnecessary acknowledgement on a switch/mention | 9 | 18% |
| Repeated confirmation questions | 16 | 32% |
| Repeated use questions | 6 | 12% |
| Deterministic responses | 15 | 30% |
| Redactor responses | 21 | 42% |

Observed routes: `PRODUCTO 26`, `SQL 9`, `INSTITUCIONAL 8`, `DIRECTA 4`, `OBJECION 2`, `SQL_FRONTDOOR 1`.

These are historical/current P3 observations. They are not a score for QA V3 and do not certify a candidate workflow.

## Root evidence

### Referential target is resolved incorrectly before SQL

Session `P3V2_STRESS_15T_20260817_1925` provides the strongest reproduced chain:

1. User: `¿Cuál me recomiendas entre los dos?`
2. Bot recommends `Armor 22`.
3. Persisted state keeps `active_product=Armor X13` and `recommended_product=Armor 22`.
4. User: `¿Cuánto cuesta el recomendado?`
5. Bot answers the price of `Armor X13`.
6. The SQL-bound row records `producto_detectado=Armor X13` and `producto_id_resuelto=P-ARMOR-X13`, while the recommendation remains `Armor 22`.

Conclusion: the first visible broken boundary is referential target resolution before SQL. The exact n8n node owner cannot be proven while workflow details are unavailable.

### Mere mentions are promoted into generic SPIN advancement

Two persisted cases show the same pattern:

- `qa_p3_switch_core5_20260817`: `El Armor 22 me parece resistente.`
- `qa_p3_guard01_20260817`: `También vi el Armor 22.`

Both were classified as `APORTAR_DATO_SPIN`, `SITUATION`, with `NBA=EXPLORE_PROBLEM` and reason `SITUATION_TO_PROBLEM`; the active product remained `Armor X13`. Their outputs opened with a near-exact mirror, added a generic benefit, and forced a problem question. Token detail shows only a redactor call in those rows.

Conclusion: the defect spans upstream intent/NBA selection and redactor realization. It is not safely reducible to a single phrase patch.

### Question pressure has more than one owner

- `OFFER_PRICE_STOCK / EXPLICIT_SWITCH / REDACTOR`: 9 of 9 responses contain a question.
- `CONTINUE_PRODUCT / FAST_PRICE_NEXT_STOCK / DETERMINISTIC`: 4 of 4 contain a question.
- `DISCOVER_USE` families also consistently contain a question.
- Some records have `NBA=NONE` with a reason equivalent to “no clarification required,” yet the redactor still adds a question.

Conclusion: question overuse is structural across NBA mapping, deterministic templates, and redactor behavior. A redactor-only fix would be incomplete.

## Defect ownership matrix

| Risk | First proven broken boundary | Likely participating components | Exact node owner proven? |
|---|---|---|---|
| R13 wrong referent | Before SQL target resolution | Referential resolver, state/recommendation context, SQL front door | No—MCP blocked |
| R1/R8 echo and generic benefit | Intent/NBA decision and output realization | Classifier, NBA policy, redactor | Partially |
| R11 forced questions | Policy and realization | NBA mapping, deterministic templates, redactor | Structural, not single-owner |
| R12 context re-explanation | Response planning | NBA and redactor | Not yet trace-proven |
| R14 loss of buying momentum | Next-action selection | NBA, reservation/handoff routing | Partially |

## Existing behavior worth preserving

- Strong signal `Quiero comprar...` has progressed to required reservation data in observed sessions.
- Medium signal `Creo que me quedo...` has progressed through price/stock and purchase confirmation.
- Weak signal `Me interesa` has appropriately prompted a low-friction use question in at least one sample.

The “compare with another store” scenario is inconsistent: some responses preserve decision criteria, while others restart generic recommendation discovery. It remains a regression case rather than a closed defect.

## QA artifacts produced from this evidence

- `P3_COMMERCIAL_QA_V3_20260818.json`: 58 fresh commercial cases.
- `P3_LONG_CONVERSATION_V2_20260818.json`: 20 ordered turns.
- `evaluate_commercial_quality.py`: deterministic state/response-contract evaluator.
- Human scoring remains mandatory on all 12 dimensions; deterministic PASS is necessary but insufficient.

## Exit evidence still missing

1. MCP access to capture the `06`, `17A`, `17`, SQL front-door, NBA and redactor traces.
2. Fresh execution results for all 58 QA V3 cases.
3. Fresh execution results for all 20 ordered turns.
4. Zero referential and wrong-product failures.
5. Human review of naturalness, commercial quality, truth, empathy, SPIN, neuroventas and NBA/N+1.


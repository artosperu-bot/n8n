# P3 execution 3800 product-switch design

## Approved objective

When a customer explicitly changes the current product, the resolved product becomes the active conversational subject. A historical recommendation may remain in conversation history, but it must not remain authoritative when it points to a different product. The persisted turn must also record that the product change was explicit.

## Evidence

Execution 3800 begins with active Armor 22 and recommended Armor X12 Pro. The current message explicitly names Armor X13; preflight and the interpreter both expose that reference, SQL resolves Armor X13, and node 17 updates the active product. Node 17A receives all of that evidence but retains Armor X12 Pro as the canonical recommendation. Separately, the persistence RPC supports `cambio_producto_explicito`, but node 23 omits it, so the database default remains false.

## Approaches considered

### A. Reconcile in 17A and map the flag in 23 — selected

`17A Árbitro Final Canónico` is the recommendation authority. It will identify a resolved explicit product that differs from the previous active product, demote a conflicting recommendation, clear only the old recommendation target from the current decision state, and emit an explicit-switch flag. Node 23 will persist that already-proven flag.

This preserves authority boundaries and separates behavioral state from persistence mapping.

### B. Clear recommendation in node 17 — rejected

Node 17 already updates active product, but recommendation ownership was deliberately removed from it. Reintroducing recommendation mutation there would violate the frozen authority model.

### C. Rewrite intent/switch detection in node 06 — rejected

The explicit product reference already survives to SQL and resolves correctly. Changing global intent interpretation would expand scope and risk purchase, comparison, and normal product-interest paths without addressing the missing persistence field.

## Data flow

1. `estado_anterior.producto_activo` supplies the previous subject.
2. `resolucion_contextual.producto_objetivo.origen = EXPLICITO` and `referencia_producto` prove an explicit current product reference.
3. `producto_resuelto` supplies the new canonical product.
4. 17A compares previous active, resolved product, and current recommendation.
5. If the explicit resolved product differs from the previous active product, 17A sets switch metadata. If the recommendation also differs, 17A demotes it without clearing comparison history, priorities, budget, activity, or SPIN state.
6. Node 23 copies the emitted switch flag into the atomic conversation payload.

## Safety boundaries

- No phrase-specific check.
- No product ID or model hardcoding.
- No modification to P0/P1/P2.1 nodes outside the two proven owners.
- No global recommendation behavior change.
- No comparison-history deletion.
- No production publication.

## Verification

RED is execution 3800. GREEN requires a fresh two-turn session that first establishes a different recommendation and then explicitly switches product. It must show Armor X13 active, no conflicting authoritative recommendation, explicit-switch metadata true, answer about Armor X13, and no third product. Adjacent regression then checks price, comparison, warranty, and purchase continuity after the switch.

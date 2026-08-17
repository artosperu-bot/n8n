# P3 execution 3800 product-switch design

## Approved objective

When a customer explicitly changes the current product, the resolved product becomes the active conversational subject. A historical recommendation may remain in conversation history, but it must not remain authoritative when it points to a different product. The persisted turn must also record that the product change was explicit.

## Evidence

Execution 3800 begins with active Armor 22 and recommended Armor X12 Pro. The current message explicitly names Armor X13; preflight and the interpreter both expose that reference, SQL resolves Armor X13, and node 17 updates the active product. Node 17A receives all of that evidence but retains Armor X12 Pro as the canonical recommendation. A first 17A-only draft exposed an earlier nondeterministic boundary in fresh execution 3805: the interpreter classified the same explicit switch as `RECOMMEND`; node 06 accepted that weak semantic signal over the deterministic product reference, broadened SQL to recommendation mode, and therefore never resolved X13. Separately, the persistence RPC supports `cambio_producto_explicito`, but node 23 omits it, so the database default remains false.

## Approaches considered

### A. Deterministic switch ownership in 06, reconcile in 17A, then map in 23 — selected

Node 06 will recognize a current explicit product reference that differs from the active product. When no deterministic comparison or recommendation language is present, that switch owns the turn over an uncorroborated LLM `RECOMMEND`/`COMPARE` signal and keeps exact product resolution. `17A Árbitro Final Canónico` remains the recommendation authority: after exact resolution it demotes a conflicting recommendation and emits an explicit-switch flag. Node 23 persists that already-proven flag.

This restores determinism at the earliest failing boundary while preserving recommendation and persistence authority.

### B. Clear recommendation in node 17 — rejected

Node 17 already updates active product, but recommendation ownership was deliberately removed from it. Reintroducing recommendation mutation there would violate the frozen authority model.

### C. Phrase-specific intent rewrite in node 06 — rejected

A phrase or model-specific rule would overfit execution 3805. The authorized node 06 change is instead a general evidence precedence rule: deterministic explicit product switch beats only uncorroborated semantic recommendation/comparison output. Deterministic recommendation, comparison, purchase, price, stock, and institutional signals keep their existing paths.

## Data flow

1. `estado_anterior.producto_activo` supplies the previous subject.
2. Node 06 compares a deterministic current product reference with stable aliases of the active product.
3. If they differ and no deterministic recommendation/comparison cue exists, node 06 removes only uncorroborated `RECOMENDAR`/`COMPARAR`, selects exact product lookup, and emits provisional switch metadata.
4. `producto_resuelto` supplies the new canonical product.
5. 17A compares previous active, resolved product, and current recommendation.
6. If the explicit resolved product differs from the previous active product, 17A sets switch metadata. If the recommendation also differs, 17A demotes it without clearing comparison history, priorities, budget, activity, or SPIN state.
7. Node 23 copies the emitted switch flag into the atomic conversation payload.

## Safety boundaries

- No phrase-specific check.
- No product ID or model hardcoding.
- No modification to P0/P1/P2.1 nodes outside the three proven owners.
- Node 06 changes only evidence precedence for a deterministic explicit switch; ordinary recommendation behavior is unchanged.
- No comparison-history deletion.
- No production publication.

## Verification

RED is execution 3800 plus the fresh earlier-boundary reproduction 3805. GREEN requires a fresh sequence that establishes a recommendation and a different active product, then explicitly switches product. It must show Armor X13 active, no conflicting authoritative recommendation, explicit-switch metadata true, answer about Armor X13, and no third product. Adjacent regression then checks price, comparison, warranty, and purchase continuity after the switch.

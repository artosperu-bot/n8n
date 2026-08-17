# P3 Product Switch Evidence — 2026-08-17

## Result

PASS on QA draft. Production was not published.

## RED

- Execution 3800: explicit Armor X13 resolved, but Armor X12 Pro remained authoritative recommendation and the persisted switch flag was false.
- Execution 3805: the same switch was nondeterministically interpreted as `RECOMMEND`; node 06 broadened SQL and did not resolve X13.
- Execution 3852: switching during purchase momentum left X12 Pro commercial evidence and reservation state attached to X13.

## Physical owners and fixes

- `06 Resolver Turno y Estado`: deterministic explicit product switch overrides only uncorroborated semantic recommendation/comparison signals and keeps exact lookup.
- `17A Árbitro Final Canónico`: demotes a conflicting recommendation, sets `cambio_producto_explicito`, clears product-bound price/stock and purchase state, and acknowledges the new active product.
- `18 Preparar Reserva`: does not rehydrate the previous product reservation after a canonical explicit switch.
- `23 Guardar Conversación`: maps the supported switch flag into the atomic conversation payload.

No product name, phrase, price, or ID was hardcoded in the fixes.

## GREEN

- Execution 3814: exact Armor X13 lookup; active `P-ARMOR-X13`; recommendation null; response about X13.
- Supabase readback for `P3_FIX3800D_EXACT_20260817_1600`: `cambio_producto_explicito=true`, active X13, recommendation null.
- Execution 3860: explicit switch from purchase momentum; active X13, recommendation null, stale evidence null, pending purchase null, reservation processing false, reservation registration false.
- Real response: `Perfecto, tomamos el Armor X13 como el producto a evaluar.`

## Adjacent regression

- 3867 price after switch: X13, S/ 899.
- 3868 comparison after switch: only Armor X13 and Armor 22; no third product; recommendation null.
- 3869 warranty after switch: X13, 12 months.
- Production active version remained `ff0135de-a3ed-4757-83a1-80794b78bb2f`.

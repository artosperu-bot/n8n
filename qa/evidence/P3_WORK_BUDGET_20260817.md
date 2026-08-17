# P3 Work and Budget Evidence — 2026-08-17

## Result

PASS on QA draft. Production was not published.

## RED

Execution 3798 received `Busco un celular resistente para trabajo en exteriores y tengo S/ 1,000.` The semantic interpreter omitted both budget and SPIN activity. Node 06 also failed to recover them because its grammar did not support `tengo S/`, locale thousands separators, or a work clause inside a recommendation request.

## Fix

- Node 06 now extracts explicit `trabajo de/en/como ...` context and locale-formatted budget ceilings, including `tengo S/`, `menos de`, `no más de`, and equivalent grounded commercial language.
- The activity clause stops before a coordinated need/request, preventing polluted values such as `construcción y necesito...`.
- Node 17A explains verified work fit and within-budget fit without disclosing an unrequested exact price.

## GREEN

- 3832 work-only: activity `construcción`; recommendation Armor X12 Pro; explanation tied to construction and verified resistance.
- 3831 work+budget: activity `exteriores`; budget 1000; recommendation Armor X12 Pro at 799; response explains resistance, work fit, and budget fit.
- 3845 sufficient criteria with comparative ceiling: budget 1000 persisted; Armor X12 Pro recommended; canonical NFC SUPPORTED appended to the rationale.
- Supabase readback for `P3_FIX3798B_20260817_1620`: activity `exteriores` and budget `1000` agree in conversation snapshot, context JSON, and typed context columns.
- Follow-up execution 3818 preserved the same activity and budget.

## Real response

`Por lo que priorizaste, te recomiendo el Armor X12 Pro... Para tu uso en exteriores... Además, queda dentro de tu presupuesto máximo de S/ 1,000.`

## N+1

The response offers to confirm current price and availability after explaining the recommendation.

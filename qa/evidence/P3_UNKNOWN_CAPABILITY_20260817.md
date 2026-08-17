# P3 UNKNOWN Capability N+1 Evidence — 2026-08-17

## Result

PASS on QA draft. Production was not published.

## RED

Execution 3799 correctly classified Armor 22 5G as canonical `UNKNOWN` but stopped after uncertainty, leaving no useful next step.

## Physical owner and fix

`17B Comparador Comercial Seguro` remains the sole tri-state capability and final response authority. For one non-comparison UNKNOWN capability it now asks whether the capability is indispensable and conditionally offers comparison with a model whose support must also be canonically confirmed.

Classification rules were not changed.

## UNKNOWN GREEN

Execution 3819:

- product: Armor 22
- capability: 5G
- canonical: UNKNOWN
- evidence type: none
- final response: `No puedo confirmar 5G... ¿Necesitas que 5G sea un requisito indispensable? Si es así, puedo compararlo con un modelo que tenga esa capacidad confirmada.`
- persisted response matched runtime output.

## Known-truth regression

- SUPPORTED, execution 3820: Armor X12 Pro NFC; canonical SUPPORTED from `NFC: Sí`; affirmative answer; no UNKNOWN question.
- NOT_SUPPORTED, deterministic node fixture: explicit `NFC: No`; canonical NOT_SUPPORTED; negative answer; no UNKNOWN question.
- Warranty regression, execution 3839: institutional GARANTIA bypasses generic capability classification and returns 12 months.
- Recommendation with verified sensitive capability, execution 3845: preserves the full recommendation/work/budget rationale and appends canonical NFC support.

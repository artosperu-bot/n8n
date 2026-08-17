# QA — STECH Ventas Consultivas

This directory stores reusable regression contracts and concise, sanitized evidence for important executions.

## Rules

- Use fresh sessions for stateful certification.
- Preserve session/execution identifiers where known.
- Inspect actual persisted/customer-facing responses, not only internal flags.
- Do not dump raw execution payloads or credentials.
- Label evidence as CONFIRMED, OBSERVED, HISTORICAL, UNVERIFIED or DEFERRED.
- Score important turns across TECHNICAL, CONTEXT, COMMERCIAL, COHERENCE, N+1 and REAL RESPONSE.

## Current P2.1 evidence

- `evidence/P2.1-T2-3768.md`
- `evidence/P2.1-T3-3770.md`
- `evidence/P2.1-T4-3772.md`
- `evidence/P2.1-T5-3774.md`
- `evidence/P2.1-T6-root.md`
- `evidence/P2.1-fasttrack-3777.md`

## Regression contract

See `regression/P2.1-matrix.md`.

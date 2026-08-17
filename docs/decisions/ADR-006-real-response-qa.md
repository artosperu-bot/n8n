# ADR-006 — Real response QA

## Status

ACCEPTED

## Decision

QA PASS requires inspection of the actual persisted/customer-facing assistant response in addition to internal state.

## Rationale

Internal flags can claim that a value was shown even when later logic replaced or removed the answer.

## Consequence

`precio_mostrado=true`, recommendation flags, NBA state or execution SUCCESS are necessary evidence but not sufficient certification. Every critical regression must validate REAL RESPONSE alongside TECHNICAL, CONTEXT, COMMERCIAL, COHERENCE and N+1.

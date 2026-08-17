# ADR-003 — Context continuity

## Status

ACCEPTED

## Decision

Useful conversational context must be preserved across turns, but preserved historical context must never dominate explicit current-turn intent.

`06B Rehidratar Contexto Comparación` is frozen absent demonstrated regression.

## Rationale

The agent needs continuity for product, comparison, activity and pending criteria, but stale state can corrupt an otherwise correct current answer if treated as higher priority.

## Consequence

Context rehydration supports the current turn. Explicit user requests outrank stale pending questions, stale recommendation state, stale comparison actions and stale N+1.

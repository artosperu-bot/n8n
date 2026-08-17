# ADR-005 — Current explicit intent priority

## Status

ACCEPTED

## Decision

The customer's explicit current-turn intent outranks historical comparison state, stale pending actions and stale N+1.

## Rationale

Historical T6 showed a correct current price answer could be overwritten by surviving historical `COMPARAR` state.

## Consequence

Comparison priority must only apply when comparison is genuinely current-turn intent. Historical context may inform the response but cannot replace the requested current answer.

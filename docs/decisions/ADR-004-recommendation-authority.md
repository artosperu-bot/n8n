# ADR-004 — Recommendation authority

## Status

ACCEPTED

## Decision

`17A` is the canonical recommendation authority.

## Rationale

Multiple recommendation writers create contradictory state and allow downstream nodes to reselect a product after the decision has already been made from verified evidence.

## Consequence

Node 17 performs validation/state reduction but must not independently reselect the recommendation. Any future authority change requires demonstrated root cause and an explicit architecture decision.

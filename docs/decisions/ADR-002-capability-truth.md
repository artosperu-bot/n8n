# ADR-002 — Capability truth

## Status

ACCEPTED

## Decision

Product capability truth is tri-state:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `UNKNOWN`

`17B` is the capability-truth authority.

## Rationale

Absence of evidence is not evidence of absence. Collapsing `UNKNOWN` to false produces incorrect negative claims to customers.

## Consequence

Downstream nodes and the final response must preserve UNKNOWN unless an authorized source resolves it. General product specs must not override the capability authority when authority differs.

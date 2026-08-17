# ADR-001 — Concurrency authority

## Status

ACCEPTED / FROZEN

## Decision

Session concurrency is governed by the P0 contract:

`Acquire → Renew → Persist → Release`

with FIFO, strict idempotency, lease heartbeat, stale fencing, phantom acquire prevention, attempt control and recovery. Production TTL is 120 seconds.

## Rationale

P0 was hardened independently from commercial/conversation behavior. Reopening concurrency for P2 bugs would create unacceptable regression risk across session ownership and persistence.

## Consequence

P0 must not be modified for a commercial bug unless an actual concurrency regression is first demonstrated with fresh evidence.

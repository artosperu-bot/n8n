# P0 Safe Release — Verification 2026-08-12

## Safe Renew prerequisite

- Behavioral cases: 8/8 PASS.
- Positive renew extended a short lease.
- Long existing lease was not shortened.
- QA residue after cleanup: 0 queue / 0 locks.

## Safe Release candidate QA

Candidate isolated as `public.ia_liberar_turno_qa(text,text,text)` before production replacement.

Cases verified:

1. LOCK_NOT_FOUND → released=false
2. OWNER_MISMATCH → released=false
3. wrong message_id / QUEUE_NOT_FOUND → released=false
4. QUEUE_OWNER_MISMATCH → released=false
5. PENDING / QUEUE_NOT_PROCESSING → released=false
6. FAILED / QUEUE_NOT_PROCESSING → released=false
7. LEASE_EXPIRED → released=false
8. valid PROCESSING owner/message/lease → released=true, queue DONE, lock deleted

All negative cases preserved queue status and lock.

## Script C production verification

Applied migration: `p0_safe_release_script_c`.

Fresh verification against real `public.ia_liberar_turno`:

- 8 three-argument cases above: PASS.
- Legacy two-argument overload: `MESSAGE_ID_REQUIRED`, `released=false`.
- Owner: postgres.
- EXECUTE grants: postgres + service_role only.
- Positive path: queue `PROCESSING → DONE`, `finished_at` set, matching lock removed.
- Negative paths: no queue finalization and lock retained.
- QA residue after cleanup: 0 queue / 0 locks.
- Temporary QA RPC removed.

## Important implementation correction

The release timestamp is captured only after both potentially blocking `FOR UPDATE` reads, immediately before validating lease freshness and finalizing queue state. This avoids authorizing release with a stale timestamp after lock contention.

## Protected scope

- `STECH Ventas Consultivas` V45.68 was not modified in this phase.
- `ia_persistir_turno_atomico` was not modified.

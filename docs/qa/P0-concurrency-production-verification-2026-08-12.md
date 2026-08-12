# P0 concurrency — production verification — 2026-08-12

## Cause

`ia_adquirir_turno(text,text,integer,integer,text)` allowed duplicate acquisition of the same `message_id` and could create a phantom lock when the same `message_id` was presented under a different `session_id`.

## Change

Promoted the approved Safe Acquire contract to production Supabase:

- immutable logical identity for `message_id`;
- `ALREADY_PROCESSING` for same session + PROCESSING;
- `ALREADY_DONE` for DONE;
- `FAILED_REQUIRES_NEW_MESSAGE_ID` for FAILED;
- `MESSAGE_SESSION_MISMATCH` before lock mutation for cross-session duplicates;
- exactly one `PENDING -> PROCESSING` row required after lock acquisition (`affected_rows = 1`), otherwise transaction rollback;
- legacy 4-argument Acquire overload is fail-closed with `MESSAGE_ID_REQUIRED`.

No changes were made to `ia_persistir_turno_atomico` or workflow `c661Gw0xoqZBsNtf` / V45.68.

## Baseline before promotion

- 5-arg Acquire MD5: `0ee9ff897d08236b61c563fdf441c1fa`
- 4-arg Acquire MD5: `c78614e3bfa80cafe7abace68139717d`
- owner: `postgres`
- grants: `postgres EXECUTE`, `service_role EXECUTE`
- exact rollback: `sql/supabase/rollback/003_p0_safe_acquire_rollback.sql`

## Concurrent QA candidate tests

### Test 7 — same session + same message_id, two real PostgreSQL workers

Workers called within <1 ms of each other.

- winner: `ACQUIRED`
- loser: `ALREADY_PROCESSING`
- queue rows: 1
- attempts: 1
- live locks: 1
- phantom locks: 0

Result: **PASS**.

### Test 8 — different sessions + same message_id, two real PostgreSQL workers

Workers called within <1 ms of each other.

- one session won `ACQUIRED`
- the other returned `MESSAGE_SESSION_MISMATCH`
- losing session: no queue row, no lock
- phantom locks: 0

Result: **PASS**.

## Production repetition

The same two concurrent tests were repeated after promotion against `public.ia_adquirir_turno`.

### Production Test 7

Both calls had `call_at = 2026-08-12 22:52:05.002464+00`.

- worker B: `ACQUIRED`, attempts 1
- worker A: `ALREADY_PROCESSING`, attempts 1
- final queue rows: 1
- live locks: 1

Result: **PASS**.

### Production Test 8

Both calls had `call_at = 2026-08-12 22:52:05.006902+00`.

- worker B / session B: `ACQUIRED`
- worker A / session A: `MESSAGE_SESSION_MISMATCH`
- phantom locks: 0

Result: **PASS**.

## Production regression

Passed:

1. NEW message -> ACQUIRED
2. same PROCESSING message x10 -> ALREADY_PROCESSING, attempts stays 1
3. DONE -> ALREADY_DONE
4. FAILED -> FAILED_REQUIRES_NEW_MESSAGE_ID
5. cross-session duplicate -> MESSAGE_SESSION_MISMATCH, zero losing-session lock
6. legacy 4-arg Acquire -> MESSAGE_ID_REQUIRED, zero lock
7. FIFO N -> N+1 -> N+2
8. expired lease takeover
9. stale Renew fenced
10. stale Release fenced
11. recovery with new message_id
12. Acquire + Renew + Release
13. live-lock / PROCESSING consistency -> 0 violations
14. Acquire + Renew + Persist + Release -> SAVED / OK

## Long-duration harness result

A temporary `pg_cron` harness was used because n8n is not connected in this chat session.

Planned:

- owner execution ~190 s;
- renew around 50/100/150 s;
- challengers around 130 s and 185 s;
- Persist + Release around 190 s.

Actual result: **BLOCKED / NOT PASS**.

All three cron worker sessions were cancelled at ~120 seconds by PostgreSQL `statement_timeout`:

`ERROR: canceling statement due to statement timeout`

The failure is in the temporary long-duration harness execution environment; it does not demonstrate a failure of Safe Acquire / Renew / Release. It also does not prove >120 s or >180 s behavior, therefore these gates remain open.

Per P0 rules no automatic patch was applied to bypass that timeout.

## Cleanup

Temporary QA jobs, helper functions, QA tables, QA rows, and `pg_cron` were removed.

Final verification:

- QA queue rows: 0
- QA lock rows: 0
- QA context rows: 0
- QA conversation rows: 0
- QA session rows: 0
- pg_cron installed: false
- QA helper functions: false

## Current production hashes

- `ia_adquirir_turno(text,text,integer,integer,text)` = `9544bd9d4ce7baeeb0e775ee9c0280b0`
- `ia_adquirir_turno(text,text,integer,integer)` = `1cd2c7ccc887f47d30764b9f280fefa3`
- `ia_renovar_turno(text,text,text,integer)` = `1ec6fcb8a070928b0112c4ea7eff2e1d`
- `ia_liberar_turno(text,text,text)` = `d25d3465a08dc5af6788244c6fb145d7`
- `ia_liberar_turno(text,text)` = `6aba18235d449347e408ac956b59027d`

All remain owned by `postgres` with EXECUTE only for `postgres` and `service_role`.

## P0 status

**NO-GO** until:

1. >120-second real workflow/harness execution passes;
2. >180-second real workflow/harness execution passes;
3. Safe Renew heartbeat is integrated into n8n and the long execution is repeated end-to-end;
4. only after those gates pass, modify/publish the workflow beyond V45.68.

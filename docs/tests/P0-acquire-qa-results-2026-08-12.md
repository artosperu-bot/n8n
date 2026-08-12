# P0 Safe Acquire QA — 2026-08-12

## Cause

Production `ia_adquirir_turno(text,text,integer,integer,text)` reproduced two P0 defects:

1. same `message_id` + same session could re-acquire and increment `attempts` (1 -> 2);
2. same `message_id` + different session could return success and create a live lock without a matching queue row (phantom acquire).

## Change

Created QA-only `public.ia_adquirir_turno_qa(text,text,integer,integer,text)`.

Policy for `FAILED`: **new message_id required**. A failed logical message is never silently revived.

The QA candidate enforces:

- global immutable `message_id -> session_id` identity;
- `ALREADY_PROCESSING`, `ALREADY_DONE`, `FAILED_REQUIRES_NEW_MESSAGE_ID`;
- `MESSAGE_SESSION_MISMATCH` before any requested-session lock mutation;
- PENDING -> PROCESSING only when exactly one queue row is affected;
- `affected_rows != 1` raises SQLSTATE `40001`, rolling back the lock;
- lock ordering compatible with Safe Renew/Release (session lock before queue row).

## Requested matrix

| # | Test | Result |
|---|---|---|
| 1 | new message_id | PASS |
| 2 | same message/session PROCESSING | PASS |
| 3 | same message/session DONE | PASS |
| 4 | same message/session FAILED | PASS |
| 5 | same message_id other session | PASS |
| 6 | duplicate 10x | PASS |
| 7 | two near-simultaneous acquisitions same message_id | BLOCKED — connector cannot hold two SQL sessions concurrently |
| 8 | two sessions concurrently competing for same message_id | BLOCKED — connector cannot hold two SQL sessions concurrently |
| 9 | N + N+1 FIFO | PASS |
| 10 | N + N+1 + N+2 FIFO | PASS |
| 11 | takeover after expired lease | PASS |
| 12 | stale worker after takeover (renew/release) | PASS |
| 13 | phantom acquire specifically | PASS |
| 14 | attempts unchanged on idempotent duplicate | PASS |
| 15 | live lock -> exactly one matching PROCESSING QA row | PASS |
| 16 | recovery after FAILED with new message_id | PASS |
| 17 | Acquire + Safe Renew | PASS |
| 18 | Acquire + Safe Release | PASS |

Executed Acquire matrix: **16 PASS / 0 FAIL / 2 BLOCKED**.

A temporary `dblink` extension was attempted solely to obtain true parallel SQL connections. Internal authentication required delegated credentials; it was removed immediately. No dblink extension remains installed.

## Joint E2E regression

| Scenario | Result |
|---|---|
| Acquire -> Renew -> Persist -> Release | PASS |
| N acquire -> N+1 waiting -> N release -> N+1 acquire | PASS |
| lease expires -> N+1 takeover -> stale N renew/persist/release | PASS |
| duplicate same session -> no reprocess | PASS |
| duplicate other session -> mismatch -> zero phantom | PASS |

The first happy-path Persist fixture initially omitted required application data (`metricas_tokens_detalle`) and an `ia_sesiones` parent row. After making the QA fixture match the real schema, Persist returned `SAVED` and the complete E2E passed. No production Persist code was changed.

## Stale fencing evidence

After takeover:

- stale Renew -> `OWNER_MISMATCH`;
- stale Persist -> `SESSION_LEASE_MISSING_OR_EXPIRED`;
- stale Release -> `OWNER_MISMATCH`;
- new owner's queue/lock remained unchanged.

## Cleanup / residues

Final verification:

- QA queue rows: 0
- QA lock rows: 0
- QA context rows: 0
- QA conversation rows: 0
- QA session rows: 0
- temporary dblink extension: absent

## Production protection

`public.ia_adquirir_turno` was **not replaced**.

Current verified MD5s:

- `ia_adquirir_turno(text,text,integer,integer,text)`: `0ee9ff897d08236b61c563fdf441c1fa`
- `ia_adquirir_turno(text,text,integer,integer)`: `c78614e3bfa80cafe7abace68139717d`
- QA candidate: `ea02f1da6decb9d9eea0cab4fd0ceddf`

## Result

Acquire QA is behaviorally green for all tests executable through the current connector, but **P0 overall remains NO-GO** because tests 7 and 8 have not been proven with truly concurrent database sessions and Acquire has not been promoted/retested as the production RPC.

V45.68 remains protected and must not be modified/published yet.

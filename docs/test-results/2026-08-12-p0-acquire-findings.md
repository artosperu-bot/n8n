# P0 Acquire — Findings 2026-08-12

## Cases that passed

- Expired owner recovery: expired lock removed, old PROCESSING row moved to FAILED with `LOCK_EXPIRED`, new owner acquired live lease.
- FIFO/source ordering: second message was rejected with `SESSION_BUSY head=<first>`, first acquired and released, then second acquired.

## Failing case 1 — duplicate same session/message

Calling `ia_adquirir_turno(session, owner, ..., message_id)` twice for the same `session_id + message_id + owner` returned acquisition behavior twice. The queue row remained PROCESSING and `attempts` increased from 1 to 2.

This means duplicate delivery is not currently idempotent at the acquire boundary.

## Failing case 2 — duplicate message_id across sessions

Because `ia_turn_queue` has global `UNIQUE(message_id)`, a second call using the same `message_id` but a different `session_id` hit `ON CONFLICT(message_id)` and did not create a queue row for the second session.

Despite that, `ia_adquirir_turno` acquired a live lock for the second session and returned `ok=true`. Resulting state:

- queue row existed only for session A;
- session A had a live lock;
- session B also had a live lock;
- session B had no matching queue row.

This is a phantom acquire and violates the owner/message/queue fencing model.

## Root cause

The five-argument `ia_adquirir_turno` treats `ON CONFLICT(message_id)` as an enqueue/update but does not distinguish:

- duplicate for same session;
- duplicate already PROCESSING/DONE/FAILED;
- message_id collision across a different session.

After lock acquisition it updates queue by `message_id + session_id` but does not require exactly one updated row before returning success.

## QA cleanup

All `QA_P0_%` queue and lock fixtures were removed after testing. Residue: 0 queue / 0 locks.

# P0 — n8n long-duration gate blocked — 2026-08-12

## Scope

Final P0 gate only. No SPIN, RAG, prompts, commercial logic, 17/17A/17B, FABV or capability changes.

## Required workflow

- Workflow: `STECH Ventas Consultivas`
- ID: `c661Gw0xoqZBsNtf`
- Recorded baseline: `V45.68`

## Access verification

In the current ChatGPT session there is no callable n8n connector/namespace. The available connector namespaces are GitHub, Gmail, Google Calendar, Google Contacts, Google Drive, Plugin Management, Supabase and files. Plugin discovery for `n8n` returned no installable plugin. No n8n endpoint or credential is present in the runtime environment.

Therefore this session cannot authoritatively query n8n to confirm that V45.68 is still the latest live workflow version, cannot create a temporary n8n QA workflow, and cannot execute the required >120 s / >180 s n8n harness.

## Safety decision

- Supabase P0 remains frozen.
- No additional PostgreSQL harness is introduced.
- Workflow `c661Gw0xoqZBsNtf` is not modified.
- No new n8n workflow version is created.
- No claim is made that V45.68 is still the latest live version; it remains the last recorded baseline only.

## Current P0 gate state

Already verified before this blocker:

- Safe Acquire: PASS
- concurrent Test 7: PASS
- concurrent Test 8: PASS
- Safe Renew: PASS
- Safe Release: PASS
- Persist fencing: PASS
- FIFO: PASS
- Idempotency: PASS
- Phantom acquire prevention: PASS
- Stale fencing: PASS
- Recovery: PASS
- Production regression: PASS
- Production Acquire/Renew/Persist/Release E2E: PASS
- QA residues: 0

Still required:

1. live n8n access;
2. confirm latest version of workflow `c661Gw0xoqZBsNtf` before any change;
3. isolated inactive/manual n8n QA harness;
4. >120 s execution with heartbeat and a real challenger;
5. >180 s execution with heartbeat and a real challenger;
6. controlled no-renew expiry/takeover/stale Renew+Persist+Release test;
7. cleanup with zero QA residues;
8. only if all above pass: P0 GO and prepare the minimal concurrency-only wiring change to V45.68/current baseline.

## Status

`P0 STATUS = NO-GO` because the final n8n-specific duration gates are not yet executed. This is an access/tooling blocker, not a demonstrated failure of the concurrency contract.

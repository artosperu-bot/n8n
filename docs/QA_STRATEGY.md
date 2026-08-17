# QA STRATEGY — STECH Ventas Consultivas

## Testing philosophy

Stateful conversation regressions must use **fresh sessions**. Do not reuse contaminated state unless the test explicitly targets continuity from that state.

A technical execution success is not equivalent to a functional/commercial PASS.

For important turns inspect:

1. execution status;
2. canonical state;
3. persisted conversation state;
4. actual customer-facing assistant response;
5. N+1 / pending progression.

## Required dimensions

Every major scenario must be scored across:

- TECHNICAL
- CONTEXT
- COMMERCIAL
- COHERENCE
- N+1
- REAL RESPONSE

Assessment:

- PASS
- WEAK
- FAIL

## Root-cause workflow

`FAIL → reproduce → first broken boundary → first responsible owner → exact root cause → smallest general fix → fresh regression → adjacent regression → close`

### Forbidden QA behavior

- speculative fixes before a root is demonstrated;
- phrase-specific patches;
- broad refactors for a local failure;
- editing frozen modules without evidence;
- PASS based only on an internal flag;
- reusing contaminated sessions for a certification trace;
- marking a hypothesis as confirmed.

## STOP conditions

Stop automated progression only for:

- a real new root cause;
- a fix that would require unsafe cross-node changes;
- an infrastructure blocker;
- an unobservable critical state.

Otherwise advance automatically through the planned regression path.

## P2.1 minimum regression matrix

1. product introduction;
2. use/work discovery;
3. explicit comparison;
4. recommendation with insufficient criterion;
5. criterion answer;
6. explicit price;
7. availability/stock confirmation;
8. purchase intent;
9. warranty;
10. institutional question;
11. unknown capability;
12. product switch;
13. negative confirmation;
14. interruption of pending question;
15. third-product contamination;
16. SQL bridge failure behavior;
17. RAG product isolation;
18. persistence continuity;
19. repeated message / idempotency;
20. human intervention state where applicable.

## P2.1 closure gate

P2.1 closes only after fresh verification of:

- comparison;
- criterion creation;
- criterion consumption;
- recommendation;
- explicit price;
- stock confirmation;
- purchase;
- warranty;
- negative confirmation;
- no third-product contamination.

## Current certification path

The current fresh path begins from session `P2_1_FASTTRACK_T6_20260816_2312` and execution `3777`. Execution initiation alone is not certification. Recover/inspect canonical output and persisted response before advancing.

If fresh T6 proves the earlier node17 comparison block is still destructive, authorize the smallest node17-only correction and rerun fresh T6 plus adjacent regression. Otherwise do not perform the second edit.

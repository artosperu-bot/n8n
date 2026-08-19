# P3 FINAL FUNCTIONAL SCORECARD — WAR ROOM 2026-08-18

## Executive decision

**P3 BLOCKED — BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION**

This is a functional blocker, not an evidence-only blocker, because the defect exists in persisted real QA conversations and the current QA draft could not be modified/executed in this session.

## Preserved green state

| Area | State | War-room action |
|---|---|---|
| Semantic switch | 11/11 GREEN | PRESERVED; not reopened |
| Long V2 regression gate | 20/20 GREEN | PRESERVED; budget-quality defect remains the known exception |
| A — other store | PROVISIONAL GREEN | PRESERVED |
| B — ACK/CLOSE | PROVISIONAL GREEN | PRESERVED |
| C — recommended/salient referent | latest available path GREEN | PRESERVED |
| P0 | CLOSED/FROZEN | untouched |
| P1 | CLOSED | untouched |
| P2.1 | CLOSED | untouched |

## Budget root score

| Surface | Result | Severity |
|---|---|---|
| Budget extraction/persistence | PASS in affected late sessions | — |
| Pure budget classified as objection | FAIL | MAJOR |
| Budget after real problem classified as SPIN Implication | FAIL | MAJOR |
| Direct `cuál entra en mi presupuesto` answer-first | FAIL | MAJOR |
| Genuine `Está caro` objection | historical behavior preserved; live post-patch not run | gate |
| Budget + explicit objection coexistence | static guard PASS; live not run | gate |

## B1–B10 war-room result

The offline guard contract is not reported as live workflow PASS.

| Case | Static guard | Live draft |
|---|---|---|
| B1 pure budget | PASS | NOT EXECUTED POST-FIX |
| B2 low cap | PASS | NOT EXECUTED POST-FIX |
| B3 range | PASS | NOT EXECUTED POST-FIX |
| B4 budget after problem | PASS for no fake budget-SPIN | NOT EXECUTED POST-FIX |
| B5 direct budget question | PASS routing contract | NOT EXECUTED POST-FIX |
| B6 real price objection | PASS preserved | NOT EXECUTED POST-FIX |
| B7 objection + budget | PASS both retained | NOT EXECUTED POST-FIX |
| B8 referential neighbor | budget guard NO-OP PASS | NOT EXECUTED POST-FIX |
| B9 buy neighbor | budget guard NO-OP PASS | NOT EXECUTED POST-FIX |
| B10 ACK neighbor | budget guard NO-OP PASS | NOT EXECUTED POST-FIX |

Live functional GREEN: **0/10 post-fix**, because the fix was not applied to the current QA draft.

## Human commercial review

Post-fix real responses are unavailable, so no fake human PASS is recorded.

- TECHNICAL: NOT POST-FIX EXECUTED
- CONTEXT: NOT POST-FIX EXECUTED
- TRUTH: NOT POST-FIX EXECUTED
- COMMERCIAL: FAIL on known pre-fix budget turns
- NATURALNESS: residual historical WEAK accepted only after functional fix
- SPIN: FAIL/MAJOR on known pre-fix budget turns
- NEUROVENTAS: BLOCKED by incorrect budget routing on affected turns
- EMPATHY: WEAK on affected budget turn because it responds to prior battery consequence rather than the new constraint
- NBA/N+1: FAIL/MAJOR on affected budget turns
- REAL RESPONSE: FAIL on the known budget examples

## Impact / full-58 decision

**FULL 58 NEEDED NOW: NO — not before the patch is live.**

After live insertion:

- if the change remains the prepared narrow budget guard and B1–B10 + critical neighbors pass, execute affected V3 subset + 12-case smoke + Long V2 T03–T08 mini-chain;
- if current-draft integration forces broad shared semantic-routing changes, then execute full 58.

## Handoff and smoke

No handoff code/path was changed in the prepared patch.

- handoff final impacted-draft verification: **EVIDENCE GAP / NOT POST-FIX EXECUTED**
- 12-case critical smoke: **0/12 POST-FIX**, pending live draft

These are not new functional failures.

## Defect inventory

Known CRITICAL functional defects: **0 newly demonstrated in the latest preserved paths.**

Known MAJOR functional defects: **1**

`BUDGET_CONSTRAINT_MISROUTED_AS_SPIN_OR_PRICE_OBJECTION`

Evidence-only gaps:

- current n8n edit/execution surface unavailable;
- exact current-draft writer of `VALIDAR_Y_AISLAR_PRESUPUESTO` not source-visible;
- post-fix B1–B10 real responses unavailable;
- impacted-draft smoke/handoff unavailable.

## Release candidate

**NOT CREATED.**

Creating an RC while a demonstrated MAJOR root remains unfixed in the live QA draft would violate the release gate.

## Production

**UNCHANGED.** No publish, activation, deactivation, or unpublish.

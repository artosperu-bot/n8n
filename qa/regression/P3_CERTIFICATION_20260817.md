# P3 Compact Certification — 2026-08-17

## Candidate

- Workflow: `c661Gw0xoqZBsNtf`
- QA draft: `feebd18e-7147-48c7-8d81-bf7af325aaf6`
- Active production: `ff0135de-a3ed-4757-83a1-80794b78bb2f` (unchanged)
- Nodes: 62
- Changed from P3 baseline: node 06, 17A, 17B, 18, 23
- Connections and node groups: identical
- Changed-node validation: PASS for all five nodes

## Certification set

| Contract | Evidence | Result |
|---|---:|---|
| Commercial happy path | 3845 → 3850 → 3851 | PASS |
| Comparison isolation | 3840, 3868 | PASS; only requested pair |
| Explicit price | 3836, 3867 | PASS |
| Explicit stock | 3837 | PASS |
| Price→stock confirmation | 3850 | PASS |
| Purchase progression | 3851 | PASS |
| Warranty | 3839, 3869 | PASS |
| Work + budget | 3831 | PASS |
| Explicit product switch | 3814 | PASS |
| Switch during purchase momentum | 3860 | PASS safety; acknowledgement commercially terse |
| UNKNOWN capability | 3819 | PASS |
| SUPPORTED capability | 3820 | PASS |
| NOT_SUPPORTED capability | deterministic 17B fixture | PASS logic; live data gap |
| Objection — price | 3864 | PASS, verbose |
| Objection — thinking time | 3866 | PASS |
| Institutional location | 3846 | PASS |
| Delivery | 3847 | WEAK; repetitive |
| Payment | 3848 | PASS |
| Media | 3849 | PASS |
| Persistence | 3814, 3816, 3818, 3819, 3825 | PASS |
| RAG/capability isolation | 3819, 3820, 3839, 3845 | PASS |
| Third-product contamination | 3814, 3868 | PASS |
| P0/P1/P2.1 regression | frozen owners unchanged except authorized node 06/17A/17B/18/23 changes; production unpublished | PASS |

## Observability

Status: PARTIAL.

The existing persisted keys `session_id`, `message_id`, and `request_id` remain reliable. Execution IDs are available in n8n but are not persisted. A compact snapshot attempt was tested in QA, returned a runtime `invalid syntax` persistence error, and was fully rolled back. Atomic persistence was reverified in execution 3825. No failing observability code remains in the candidate.

## Security

Status: BLOCKING FOR PRODUCTION PROMOTION.

Four SQL-bridge HTTP nodes still contain literal Authorization headers and a literal tunnel endpoint. No HTTP header/bearer credential exists to migrate them safely. The exact operator-run migration and rollback plan is in `docs/P3_SECURITY_MIGRATION_DESIGN.md`.

## Verdict

- Functional conversation candidate: READY WITH NON-BLOCKING WEAKNESSES
- Production promotion: NOT READY
- Real blockers:
  1. migrate four SQL-bridge Authorization headers into separate QA/PROD credential objects;
  2. replace the literal tunnel endpoint with a named stable endpoint/config abstraction;
  3. confirm execution-data redaction/retention controls so transport secrets are not exposed during routine inspection.

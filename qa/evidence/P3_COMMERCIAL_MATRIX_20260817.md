# P3 Commercial QA Matrix — 2026-08-17

Values: PASS, WEAK, FAIL. A PASS in a non-applicable dimension means the turn did not violate that contract. Initial concurrent executions 3833–3835 exceeded QA runner memory; their sequential retries are the scored evidence.

| # | Scenario | Evidence | Technical | Context | Truth | Commercial | Coherence | SPIN | Neuroventas | Empathy | NBA/N+1 | Real response | Overall |
|---:|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Greeting | 3826 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | Vague product interest | 3827 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | Work use | 3832 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 4 | Personal use | 3829 | PASS | PASS | PASS | WEAK | WEAK | WEAK | WEAK | WEAK | WEAK | WEAK | WEAK |
| 5 | Explicit budget only | 3830 | PASS | PASS | PASS | WEAK | PASS | WEAK | WEAK | PASS | WEAK | WEAK | WEAK |
| 6 | Work + budget | 3831 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | Comparison | 3840 | PASS | PASS | PASS | WEAK | PASS | WEAK | WEAK | PASS | FAIL | WEAK | WEAK |
| 8 | Recommendation, insufficient criteria | 3842 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 9 | Recommendation, sufficient criteria | 3845 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 10 | Explicit price | 3836 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 11 | Explicit stock | 3837 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 12 | Price→stock confirmation | 3850 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 13 | Purchase signal | 3851 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 14 | Warranty | 3839 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 15 | UNKNOWN capability | 3819 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | SUPPORTED capability | 3820 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 17 | NOT_SUPPORTED capability | node fixture | PASS | PASS | PASS | WEAK | PASS | PASS | PASS | PASS | PASS | WEAK | WEAK |
| 18 | Explicit product switch | 3814 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 19 | Switch after recommendation | 3814 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 20 | Switch during purchase momentum | 3860 | PASS | PASS | PASS | WEAK | WEAK | PASS | WEAK | PASS | PASS | WEAK | WEAK |
| 21 | Objection: “está caro” | 3864 | PASS | PASS | PASS | WEAK | PASS | PASS | WEAK | PASS | PASS | WEAK | WEAK |
| 22 | Objection: “lo voy a pensar” | 3866 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 23 | Photos/media | 3849 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 24 | Institutional location | 3846 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 25 | Delivery | 3847 | PASS | PASS | PASS | WEAK | WEAK | PASS | WEAK | PASS | WEAK | WEAK | WEAK |
| 26 | Payment method | 3848 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 27 | Change mind after recommendation | 3814 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 28 | Bare “sí” with discovery pending | 3861 | PASS | WEAK | PASS | WEAK | WEAK | FAIL | WEAK | PASS | WEAK | WEAK | WEAK |
| 29 | Bare “sí” with commercial confirmation pending | 3850 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 30 | Interruption during pending question | 3862 | PASS | WEAK | PASS | WEAK | PASS | WEAK | WEAK | PASS | WEAK | WEAK | WEAK |

## Totals

- Overall PASS: 21
- Overall WEAK: 9
- Overall FAIL: 0
- Critical technical/context/truth failures remaining in exercised production paths: 0

## Remaining commercial weaknesses

1. Personal-use reply is awkward and mechanically empathetic.
2. Standalone budget turn asks for a product before eliciting the decision criterion.
3. Comparison is factual but has no decision-oriented next step.
4. Live catalog currently has no explicit negative capability row, so NOT_SUPPORTED is covered deterministically rather than by a real catalog conversation.
5. Product switch during purchase momentum is now safe but its acknowledgement remains terse.
6. “Está caro” is correct but verbose.
7. Delivery repeats itself and does not use the already supplied city well.
8. Bare “sí” to an open discovery question clears the pending slot instead of re-asking narrowly.
9. Institutional interruption answers correctly but does not resume the prior recommendation criterion.

These are non-blocking for technical promotion review but should remain visible on the roadmap.

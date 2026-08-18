# PRE-P4 readiness package — 2026-08-18

Status: design-only preparation. P4 has **not** formally started and this document does not authorize production traffic.

## Entry gates

All gates are required before a pilot can begin:

- workflow details and execution traces are available through the authorized n8n path;
- the `06 → 17A` ownership boundary is proven from trace evidence;
- Commercial QA V3 has 58 fresh captured results, deterministic evaluation, and human review;
- Long Conversation V2 has 20 ordered captured turns and persisted N+1 state checks;
- wrong-product, stale-product and referential errors are zero;
- explicit-intent direct-answer compliance is at least 98%;
- strong buy-signal progression is 100%;
- repeated discovery is zero;
- no unresolved security, tunnel, credential, rollback, or observability blocker remains;
- an operator and a human-handoff owner explicitly approve the pilot.

## Proposed controlled pilot

This is a promotion proposal, not an executed rollout.

| Phase | Volume | Audience | Automation scope | Promotion condition |
|---|---:|---|---|---|
| Internal shadow | 30 conversations | Team-generated traffic | Observe and score; no autonomous customer commitment | All stop metrics remain zero |
| Staff-supervised | 50 conversations | Staff or invited test users | Every commercial progression visible to a supervisor | Human intervention and quality targets acceptable |
| Limited customer | 100 conversations | Small WhatsApp cohort | Qualified product inquiries only; human handoff active | Explicit operator approval after prior phase |

Channel order: WhatsApp first. Instagram/Facebook can follow only after the same regression suite is rerun against channel-specific payloads and identity/session behavior.

## Qualified scope

In scope:

- verified product information for `Armor X12 Pro`, `Armor X13`, `Armor 22`, and `Armor 25T Pro`;
- use/problem/budget discovery;
- comparisons and evidence-backed recommendations;
- live authoritative price and stock lookup;
- verified location, delivery, hours and warranty information;
- progression into an existing approved reservation or human-handoff flow.

Out of scope and handed to a human:

- payment exceptions, financing exceptions or refund disputes;
- complaints, threats, safety incidents or abusive interactions;
- complex warranty diagnosis or legal interpretation;
- corporate/bulk negotiation and special pricing;
- unsupported products, unavailable catalog evidence or conflicting inventory;
- any workflow/state anomaly that can associate an answer with the wrong product.

## Human handoff rules

Handoff immediately when:

- the user requests a person;
- product identity or referent is ambiguous after one concise clarification;
- catalog, price, stock, warranty or delivery truth cannot be verified;
- the session contains a payment, complaint, safety, legal, privacy or exception path;
- reservation data fails validation or an external dependency fails;
- the bot detects a state mismatch between active, recommended, target and resolved SQL product;
- a strong buy signal cannot progress through the approved reservation path.

The bot must say what it can and cannot complete; it must not imply that a reservation, payment or delivery is confirmed unless the authoritative system confirms it.

## Pilot metrics and stop rules

| Metric | Entry target | Pilot stop rule |
|---|---:|---|
| Wrong-product response | 0 | Any occurrence stops automation |
| Referential error | 0 | Any occurrence stops automation |
| Repeated discovery | 0 | Any confirmed occurrence pauses promotion and triggers review |
| Explicit-intent direct answer | ≥98% | Below target pauses promotion |
| Strong buy-signal progression | 100% | Any unexplained miss stops the affected path |
| Unsupported factual claim | 0 | Any material claim stops automation |
| Context reset after interruption | ≤2% | Above target pauses promotion |
| Question rate | Materially below the 88% baseline | Review by intent; never optimize the aggregate alone |
| Robotic user echo / empty acknowledgement | Near 0 | Repeated pattern pauses promotion |
| Human intervention | Tracked by reason and outcome | A rising or unexplained rate pauses promotion |

Question rate is diagnostic, not a standalone objective: a useful question may be correct, while a zero-question response may still be poor.

## Rollback plan

1. Pause automated entry for the affected channel and route new conversations to the human-only path.
2. Preserve transcripts, execution IDs, persisted state and external lookup evidence.
3. Do not repair live data manually or silently retry a state-changing commercial action.
4. Re-enable only a previously reviewed workflow version, and only with explicit operator approval.
5. Run the 12-case smoke suite below plus the exact failed scenario before reopening traffic.
6. If product identity was wrong, treat all downstream price, stock and reservation effects as suspect until reconciled.

## Promotion checklist

- [ ] n8n MCP access confirmed for the exact workflow ID.
- [ ] Candidate workflow hash/version recorded.
- [ ] `06 → 17A` trace captured for positive and negative switch controls.
- [ ] 58/58 QA V3 cases have results and human scores.
- [ ] 20/20 long-conversation turns have persisted N+1 evidence.
- [ ] Zero wrong-product, referential, stale-answer and unsupported-claim failures.
- [ ] Direct-answer and buy-progression targets met.
- [ ] Human handoff verified end to end.
- [ ] Observability includes session, execution, product targets, NBA and response source.
- [ ] Rollback operator and prior reviewed version recorded.
- [ ] Security, tunnel and credential blockers closed.
- [ ] Pilot owner explicitly approves the phase and volume.

## Twelve-case preflight smoke suite

1. Direct price for named `Armor 22`.
2. Direct stock for active `Armor X13`.
3. Recommendation between `Armor X13` and `Armor 22` using a stated criterion.
4. `¿Cuánto cuesta el recomendado?` resolves to the recommended product.
5. `¿Y el otro?` resolves to the other comparison member.
6. Institutional interruption preserves the recommended product.
7. Explicit switch emits and applies `change_product_explicit=true`.
8. Attribute preference does not switch active product.
9. Mere product mention does not switch active product or force generic SPIN.
10. Strong buy signal progresses to the approved reservation/handoff step.
11. Unsupported absolute claim is corrected using verified facts.
12. External dependency failure produces transparent human handoff without false confirmation.

## Promotion decision record

Before any pilot, record: candidate version, test report paths, unresolved risks, approved scope, phase volume, channel, operator, handoff owner, rollback version, decision time, and explicit `GO` or `NO-GO`.

## Execution status — 2026-08-18

Fresh execution was attempted against workflow `RSVEmajGYTi8f8HJ`, but the workflow remained `availableInMCP=false`, inactive and without connector-visible triggers. Detail, history and execution search were all rejected by the same MCP gate.

- QA V3 executed: `0/58`
- Long V2 executed: `0/20`
- Human handoff executed: `0/6`
- Preflight smoke executed: `0/12`
- Live entry gates passed in this run: `0`
- Pilot readiness: **NOT READY**
- P4 formally started: **NO**

This is an access result, not a functional failure or certification. The machine-readable records are marked `NOT_EXECUTABLE_DUE_MCP`; no expected value is represented as a real response.

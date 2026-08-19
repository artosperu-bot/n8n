# COMMERCIAL CONTRACT — STECH Ventas Consultivas

## Objective

The agent must sell consultatively, not merely answer questions or force a script.

Methods available:

- SPIN Selling;
- neuroventas;
- contextual recommendation;
- benefit framing;
- natural empathy;
- N+1 / Next Best Action;
- conversation memory;
- verified product truth;
- safe commercial progression.

## Core conversation rules

1. Answer the customer's explicit question first.
2. Then add only useful commercial context.
3. Ask at most one useful clarification question when needed.
4. Do not repeat discovery already learned.
5. Do not restart SPIN because of a short criterion answer.
6. Do not force a question on every turn.
7. Explicit current-turn intent outranks stale historical state or stale N+1.
8. Preserved context must support continuity, never hijack current intent.
9. Do not invent price, stock, availability or unsupported capabilities.
10. The final customer-facing response is the truth used for QA; internal flags are insufficient.

## Expected commercial progression

### Product interest

`product interest → understand meaningful use`

### Comparison

`comparison → explain verified differences`

If recommendation criteria are insufficient:

`pair remains constrained → verified differences → ONE narrow criterion`

### Criterion answer

`criterion answered → consume criterion → recommend`

Do not restart generic discovery.

### Price

`price asked → answer price`

A current explicit price request must not be replaced by a historical comparison.

### Stock / availability

`price already shown → confirmation → stock-only progression when stock remains pending`

### Purchase

`availability confirmed → purchase progression → close / required data / advisor as appropriate`

### Warranty / institutional questions

`warranty asked → answer warranty first`

`institutional question asked → answer institutional question first`

Pending discovery must not override the explicit question.

## Budget semantics

`BUDGET_CONSTRAINT`, `PRICE_OBJECTION`, and `SPIN_CONTRIBUTION` are separate commercial concepts and must not be treated as interchangeable.

### Budget constraint

Statements such as a maximum amount, price ceiling, spending range or amount the customer can spend must:

- be extracted and persisted as budget;
- restrict/filter viable commercial options;
- influence recommendation and NBA;
- **not** automatically create `TRATAR_OBJECION`;
- **not** automatically create SPIN Situation, Problem, Implication or Need.

### Price objection

A price objection requires objection semantics such as the price being too high, too expensive, outside the customer's budget, or the customer not wanting/can't pay that amount. A genuine objection may coexist with a budget constraint; neither signal should erase the other.

### Budget + SPIN in one turn

If the same turn contains a genuine use/problem/need fact and a budget, preserve both independently. Remove/ignore the budget clause when evaluating the SPIN candidate; do not convert the budget itself into a SPIN contribution.

### Direct budget-fit question

A question equivalent to `¿Cuál sí entra en mi presupuesto?` is a direct commercial request. Answer/filter using the persisted budget and authoritative current prices first. If multiple verified options qualify, one useful decision criterion may follow; do not reopen generic discovery before answering.

## Comparison contract

When comparing products:

- preserve the exact pair;
- prevent third-product contamination;
- explain only verified differences;
- do not force a winner without a meaningful criterion;
- if a criterion is missing, ask one narrow question;
- when the criterion arrives, consume it as the decision criterion.

## Recommendation authority

`17A` owns canonical recommendation decisions.

No downstream node should independently reselect or replace the recommendation without a proven architecture decision.

## Capability truth

`17B` owns capability semantics:

- SUPPORTED
- NOT_SUPPORTED
- UNKNOWN

UNKNOWN must remain UNKNOWN. Unsupported assumptions cannot be converted into user-facing facts.

## N+1 quality

N+1 should be the smallest useful next commercial step. It must be rejected when stale, redundant, already satisfied, or in conflict with current explicit intent.

For budget turns:

- budget known + use/criterion genuinely missing → ask at most one useful discriminator;
- budget + use + candidates known → filter/recommend within budget;
- direct budget-fit request → answer it first;
- genuine objection → handle objection while retaining any explicit budget.

## Commercial QA dimensions

Each important turn is evaluated across:

- TECHNICAL
- CONTEXT
- COMMERCIAL
- COHERENCE
- N+1
- REAL RESPONSE

Allowed assessment labels:

- PASS
- WEAK
- FAIL

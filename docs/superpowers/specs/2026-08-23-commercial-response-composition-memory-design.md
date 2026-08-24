# STECH Backend — Commercial Response Composition + Memory Design

Date: 2026-08-23
Status: Proposed for implementation after user review
Branch authority: `feat/stech-backend`

## 1. Objective

Improve STECH's sales conversations without replacing the SQL/RAG routes, state model, concurrency contract, or persistence that already work.

The goal is a commercial agent that:

- sells consultatively instead of sounding like a bot;
- uses empathy demonstrated through useful context, not generic filler;
- applies ethical neuroventas by connecting verified product facts to the customer's real need;
- uses SPIN only when it helps advance the sale;
- uses FAB, LAER, guided comparison, and progressive close according to the current commercial strategy;
- preserves product, customer, objection, budget, use-case, priority, stage, and pending-action continuity across turns;
- never lets sales language override SQL/RAG truth;
- keeps factual direct answers short when no commercial expansion is justified;
- keeps every commercial action consistent with the deterministic NBA already authorized by the backend.

The business objective is to increase the quality and effectiveness of sales conversations while preserving zero-hallucination and operational safety.

## 2. Non-goals

This change does **not**:

- redesign SQL routes;
- redesign the SQL bridge;
- replace Supabase RAG;
- change embeddings;
- change product catalog authority;
- change reservation logic;
- change P0 concurrency/locking;
- move conversational authority into independent n8n agents;
- create a second conversation-memory model;
- add a new Supabase table;
- require an initial Supabase migration;
- invent purchase probability, emotion, urgency, scarcity, social proof, stock, price, capability, promotion, or performance;
- send every response through an unrestricted LLM.

## 3. Existing authorities to preserve

The current project contract remains authoritative:

- SQL / ERP: dynamic truth such as price, stock, availability, product/order data.
- RAG: product documentation, policies, non-dynamic verified facts.
- Supabase: session state, accumulated commercial context, turn audit, concurrency, capability/RAG/QA data.
- Deterministic backend logic: intent, reference resolution, state reduction, commercial stage, SPIN progression, interest, strategy, NBA, action eligibility.
- LLM: interpretation and wording only within an explicitly bounded response plan.

`ia_contexto.contexto` remains the canonical accumulated conversation state.

`ia_conversaciones` remains the canonical per-turn audit record.

`ia_sesiones` remains the session lifecycle authority.

Atomic persistence remains:

`ia_adquirir_turno -> ia_persistir_turno_atomico -> ia_liberar_turno`.

## 4. Problem to solve

The current FULL RAG path can build a correct deterministic answer and return it directly after lightweight humanization. This protects truth, but it can bypass the richer commercial writer behavior that already knows about SPIN, FAB, LAER, empathy, neuroventas, and NBA.

The defect is therefore not that SQL, RAG, memory, or commercial state are absent. The architectural gap is between:

`verified factual answer + commercial state/NBA`

and

`final commercially effective wording`.

The fix must preserve the deterministic factual kernel while adding a controlled commercial composition layer before final delivery.

## 5. Target architecture

```text
Inbound message
  -> intent / references / product resolution
  -> rehydrate ia_contexto.contexto
  -> SQL / RAG evidence
  -> immutable verified truth
  -> state reduction
  -> SPIN / interest / stage / strategy / NBA
  -> Commercial Context Projection
  -> Commercial Response Plan
  -> Commercial Response Composer
  -> Writer Guard
  -> final response
  -> atomic persistence
       ia_conversaciones = turn truth/audit
       ia_contexto       = accumulated memory
```

The response pipeline must have one commercial decision authority and one final writer path. Specialized modules may contribute facts/decisions, but they must not independently write customer-facing responses.

## 6. Single-state principle

No independent agent may maintain its own competing memory.

All commercial modules read from the same canonical `ConversationState`, hydrated from `ia_contexto.contexto` and updated through the existing reducer.

Relevant existing state includes, when available:

- active / selected / recommended / salient product;
- comparison pair and explored products;
- query target;
- customer type;
- sector / use case;
- problem;
- priorities and explicit priorities;
- budget;
- quantity;
- invoice requirement;
- objection;
- interest signal and deterministic interest level/events;
- purchase signal;
- commercial stage;
- commercial strategy;
- SPIN facts and last SPIN contribution;
- last NBA and pending action;
- handoff state;
- last intent and route;
- trace/product-resolution metadata.

Existing canonical fields win over legacy compatibility mirrors. Mirrors continue to be regenerated on write.

## 7. Commercial Context Projection

A new bounded projection should be derived from `ConversationState` for response composition.

It must **not** dump the entire history or raw database state into the writer.

Conceptual shape:

```ts
CommercialContextProjection {
  turn: {
    intent,
    route,
    message,
    queryTarget,
    resolvedProduct,
    currentAttributes
  },
  customer: {
    customerType,
    sector,
    useCase,
    problem,
    priorities,
    explicitPriorities,
    budget,
    quantity,
    invoiceRequired
  },
  sale: {
    commercialStage,
    commercialStrategy,
    objection,
    interestSignal,
    levelOfInterest,
    purchaseSignal,
    spinFacts,
    lastSpinContribution,
    lastNba,
    pendingAction
  },
  continuity: {
    activeProduct,
    selectedProduct,
    recommendedProduct,
    comparisonProducts,
    exploredProducts
  }
}
```

The projection is read-only input to response planning/composition.

## 8. Commercial Response Plan

Introduce a deterministic `CommercialResponsePlan` between decision/NBA and final wording.

Its responsibility is to define **what may be communicated**, not to generate prose.

Conceptual shape:

```ts
CommercialResponsePlan {
  mode,
  strategy,
  acknowledgeContext,
  contextToAcknowledge,
  factualCore,
  benefitLinks,
  objectionPlan,
  question,
  exactNba,
  allowedActions,
  forbiddenClaims,
  maxQuestions,
  shouldUseLlm
}
```

### 8.1 Response modes

Canonical modes should be finite and deterministic, for example:

- `FACTUAL_DIRECT`
- `DISCOVERY_SPIN`
- `CONTEXTUAL_FAB`
- `GUIDED_CHOICE`
- `OBJECTION_LAER`
- `SOFT_CLOSE`
- `PURCHASE_PROGRESS`
- `HANDOFF`

Names may be adapted to current project conventions during implementation, but the set must remain finite and code-owned rather than free-form LLM output.

### 8.2 Mode selection principles

#### FACTUAL_DIRECT

Use for isolated factual questions when no useful commercial expansion is authorized.

Example: `¿Tiene NFC?`

Behavior:

- answer the verified fact;
- no generic empathy intro;
- no forced SPIN;
- no unrelated stock CTA;
- no artificial neuroventas;
- finish.

#### DISCOVERY_SPIN

Use only when a genuinely missing fact can materially change recommendation or next step.

Rules:

- maximum one useful question;
- never re-ask known context;
- never force S -> P -> I -> N mechanically;
- reuse existing SPIN facts;
- do not invent a problem;
- budget alone is not a SPIN problem.

#### CONTEXTUAL_FAB

Use when verified product facts can be meaningfully connected to a known customer need/problem/priority.

Pattern:

`verified feature -> practical effect -> benefit tied to known need`

The benefit must remain semantically entailed by verified evidence and the known context.

#### GUIDED_CHOICE

Use for comparisons/recommendations.

Rules:

- focus on 2-4 decision-relevant differences;
- prefer customer's known priorities;
- state which option fits better and why when evidence supports it;
- avoid catalog dumps;
- do not invent superiority.

#### OBJECTION_LAER

Use when a real objection is detected.

Rules:

- acknowledge the objection in context;
- explore only if information is genuinely missing;
- respond using verified facts/budget/alternatives;
- advance with the authorized NBA;
- no defensive or manipulative wording.

#### SOFT_CLOSE

Use only when the deterministic progression/NBA authorizes it.

The writer cannot create its own close.

#### PURCHASE_PROGRESS

Use when a strong purchase signal exists.

Rules:

- do not restart discovery;
- reduce friction;
- ask only indispensable information;
- preserve selected product and known context;
- move toward executable purchase/handoff/reservation behavior already supported by the backend.

## 9. Empathy policy

Empathy should be demonstrated through relevance, not filler.

Preferred behavior:

- acknowledge the customer's actual use/problem/constraint;
- show that the recommendation criteria changed because of that information;
- address the concern before pushing the next action.

Example pattern:

`Entonces, para tu trabajo en construcción priorizaría resistencia y batería antes que cámara.`

Avoid repetitive generic openers such as:

- `Entiendo perfectamente...`
- `Claro...`
- `Perfecto...`

unless they add real conversational value.

No emotional state field is required to achieve empathy. `estado_emocional` must remain unused unless a separate demonstrated use case justifies it.

## 10. Ethical neuroventas policy

Neuroventas is a response behavior, not a persisted boolean and not an excuse to invent persuasion claims.

Allowed principles:

- reduce decision effort by highlighting the few criteria that matter to this customer;
- make practical consequences of verified features easier to understand;
- connect verified features to explicit needs/problems/priorities;
- reduce uncertainty with verified evidence;
- reinforce fit after a customer has supplied enough context;
- use contrast in comparisons only when supported by evidence;
- make the next executable step clear when NBA authorizes it.

Forbidden:

- fake scarcity;
- fake urgency;
- invented social proof;
- fabricated popularity;
- fake stock pressure;
- invented discounts/promotions;
- unsupported performance promises;
- invented emotions;
- invented purchase probability;
- psychological pressure unrelated to the customer's expressed need.

`levelOfInterest` remains the deterministic interest signal. Do not manufacture `probabilidad_compra` percentages.

## 11. Truth preservation / immutable factual core

The output from SQL/RAG factual resolution is immutable from the perspective of the commercial composer.

The composer may:

- reorder facts;
- shorten facts;
- contextualize facts;
- connect facts to known needs using safe benefits;
- make wording more human.

The composer may **not**:

- change price;
- change stock;
- add an unverified capability;
- claim a spec not present in evidence;
- upgrade UNKNOWN to YES/NO;
- change the resolved product;
- convert a weak interest signal into a purchase signal;
- create an action not authorized by NBA/current tools.

## 12. Composer behavior

The `CommercialResponseComposer` receives only:

- immutable factual core;
- bounded commercial context projection;
- deterministic commercial response plan;
- exact NBA/action authorization;
- explicit prohibitions.

It is responsible only for natural customer-facing phrasing.

### 12.1 LLM use

Use the LLM only when contextual commercial composition adds value.

Likely LLM-eligible modes:

- `CONTEXTUAL_FAB`
- `GUIDED_CHOICE`
- `OBJECTION_LAER`
- selected `DISCOVERY_SPIN`
- selected `SOFT_CLOSE`
- selected `PURCHASE_PROGRESS`

Likely deterministic bypass:

- simple factual yes/no/spec answers;
- unsupported capability truth;
- short policy facts where commercial expansion adds no value;
- fallback after LLM failure.

The current deterministic answer remains the fallback, so an LLM failure cannot break factual response delivery.

## 13. Full RAG integration point

The principal integration point is the current path after `buildFullRagAnswer(...)` returns a verified kernel answer and before `FullRagLlmProvider.write()` immediately returns a deterministic result.

Target behavior:

```text
FullRagAnswerKernel
  -> immutable factual core
  -> CommercialResponsePlan
       -> FACTUAL_DIRECT? -> deterministic final answer
       -> contextual mode? -> CommercialResponseComposer
                                  -> WriterGuard
                                  -> final answer
       -> composer failure? -> deterministic factual fallback
```

This preserves the Full RAG kernel as factual authority and removes the current all-or-nothing choice between safe deterministic output and richer commercial writing.

## 14. Strategy mapping

Existing strategy remains authoritative.

### `FAB_SPIN`

Use:

- context acknowledgement when useful;
- verified feature/effect/benefit link;
- one SPIN question only if required;
- exact NBA after the answer.

### `ELECCION_GUIADA`

Use:

- decision-relevant differences;
- known priority weighting;
- evidence-backed recommendation;
- executable next step only if NBA authorizes it.

### `LAER`

Use:

- contextual acknowledgement;
- exploration only when needed;
- evidence-backed answer/alternative;
- next step consistent with stage and NBA.

### `CIERRE_PROGRESIVO`

Use:

- preserve chosen product;
- reduce friction;
- avoid reopening discovery;
- request only indispensable missing data;
- execute supported next purchase step.

### Direct factual response

Use:

- answer and finish unless an existing deterministic rule authorizes a genuinely useful continuation.

## 15. n8n role

n8n remains appropriate for orchestration and external workflow responsibilities such as:

- WhatsApp inbound/outbound integration;
- webhooks;
- CRM events;
- human handoff orchestration;
- notifications;
- external automations;
- long-running business workflows;
- integration with other systems.

Do not split SPIN, FAB, neuroventas, objection handling, product selection, or closing into autonomous n8n agents with separate memory/decision authority.

If n8n invokes the backend, the backend remains the canonical conversational/commercial authority.

## 16. Persistence contract

No first-version schema migration is required.

### `ia_conversaciones`

Continue storing the truth/audit of the confirmed turn, including the fields already supported:

- message and response;
- intent/route;
- objective/NBA;
- product resolution;
- SQL/RAG usage;
- SPIN contribution/current phase;
- commercial stage/strategy;
- next action;
- activity/problem/priorities;
- derived implications;
- objection;
- interest level;
- model/tokens;
- trace/error/handoff information;
- commercial context snapshot.

Do not populate legacy/unused fields such as `probabilidad_compra`, `estado_emocional`, or `urgencia` simply because columns exist.

### `ia_contexto.contexto`

Continue storing accumulated canonical memory only.

Do not duplicate every derived turn field into accumulated state when it can safely be recalculated, e.g. commercial implications derived from problem/objection.

Both records must continue to represent the same confirmed turn via the existing atomic persistence contract and `context_version` continuity.

## 17. Writer Guard

After composition, validate the candidate response before delivery.

The guard should reject or fall back when it detects a material violation such as:

- price mutation;
- stock mutation;
- unsupported product capability;
- unsupported performance claim;
- stale/wrong product;
- unauthorized CTA/action;
- multiple competing next actions;
- more questions than allowed;
- repeated discovery of known information;
- internal labels/meta-language exposed to the customer;
- fabricated scarcity/urgency/social proof;
- loss of explicit objection/context that the plan required acknowledging.

Guard failure must prefer a safe deterministic fallback over an ungrounded retry loop.

## 18. Example behavior

### 18.1 Isolated factual question

Customer:

`¿Tiene NFC?`

Expected:

- resolve product;
- RAG capability truth;
- `FACTUAL_DIRECT`;
- answer factually and finish;
- no SPIN, generic empathy, unrelated stock CTA, or sales pressure.

### 18.2 Contextual construction use case

Known context:

- use case: construction work;
- problem: frequent drops;
- priorities: resistance + battery;
- active product: Armor 22.

Expected:

- resolve verified RAG facts;
- preserve context;
- `CONTEXTUAL_FAB`;
- acknowledge that resistance/battery matter for this use;
- connect only verified resistance/battery facts to the need;
- if deterministic NBA is `SOFT_CLOSE`, include the exact allowed next step;
- otherwise answer without inventing a close.

### 18.3 Price objection

Customer:

`Está muy caro.`

Expected:

- retain product/context;
- objection = price;
- strategy = LAER;
- acknowledge price concern before advancing;
- use known budget if available;
- do not restart SPIN;
- do not invent a discount;
- follow exact deterministic NBA.

### 18.4 Strong purchase signal

Customer:

`Ya, me lo llevo.`

Expected:

- purchase signal true;
- stage progresses to close;
- do not regress to discovery;
- preserve selected product;
- ask only indispensable purchase data;
- advance through supported purchase/handoff/reservation path.

## 19. QA acceptance criteria

Implementation is not complete until technical tests cover at least:

1. factual NFC/spec question stays direct and grounded;
2. unsupported capability stays truthful and is not oversold;
3. construction + drop problem + Armor 22 produces contextual FAB only from verified facts;
4. battery/work context cannot generate unsupported autonomy/performance claims;
5. SPIN asks at most one useful missing fact and never repeats known information;
6. price objection gets contextual acknowledgement before next action;
7. budget recommendation uses verified price data and known budget without inventing a discount;
8. comparison uses 2-4 relevant differences and known priorities;
9. strong purchase signal does not restart discovery;
10. NBA delivery matches the deterministic NBA and does not add unsupported actions;
11. no fake scarcity, urgency, popularity, social proof, emotion, or purchase probability;
12. product continuity is preserved across turns;
13. deterministic fallback works when composer/LLM fails;
14. turn persistence and context persistence remain atomic and context-version consistent;
15. existing SQL/RAG factual regression tests continue to pass;
16. current commercial evaluator checks for context acknowledgement, FAB grounding, SPIN utility, NBA actionability/continuity, and robotic language continue to pass or are strengthened.

Live conversational behavior is validated locally through the real HTTP boundary while the backend is running. GitHub Actions are not the execution environment for conversation QA.

## 20. Implementation boundaries

Expected implementation scope after spec approval:

1. add bounded commercial context projection;
2. add deterministic commercial response-plan builder;
3. add/extend commercial composer behavior using existing writer infrastructure where practical;
4. integrate the plan into the FULL RAG path without changing SQL/RAG evidence authorities;
5. add Writer Guard validations/fallback;
6. extend unit/integration commercial QA for empathy, neurovalue, continuity, FAB, SPIN, LAER, guided choice, close, and grounding;
7. run local technical build/tests;
8. have the user run live conversational QA locally and return the results for correction of root causes.

## 21. Rollout / risk control

- Work only on the current backend branch authority.
- No production workflow changes during implementation.
- Keep deterministic fallback available throughout rollout.
- Do not modify SQL/RAG route behavior unless a regression proves the route itself is defective.
- Prefer the smallest integration surface around response composition.
- Any failing QA case must be traced to the first broken boundary before changing logic.
- Fix general rules rather than hardcoding individual phrases/cases.

## 22. Success definition

A successful version preserves the current factual reliability while making commercially relevant turns feel like one coherent salesperson who remembers the customer and advances the sale intelligently.

The customer should experience:

- correct facts;
- continuity;
- useful empathy;
- fewer unnecessary questions;
- benefits tied to their actual need;
- clear recommendations;
- sensible objection handling;
- natural next steps;
- progressive closing when justified;
- no bot-like internal language;
- no invented claims.

The system should achieve this with one canonical state, one commercial decision path, one bounded response plan, and one guarded final composition path rather than multiple autonomous sales agents.
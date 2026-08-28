# Hybrid Sales Brain Authority Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore GPT-5 mini as the semantic/commercial conversation brain while keeping SQL/RAG, product identity, side effects, persistence, and safety guards deterministic, so the bot answers the customer's current question naturally before any optional commercial continuation.

**Architecture:** Preserve `HybridConversationEngine`, ERP/SQL, RAG, Supabase state/persistence, reference resolution, and hard truth guards. Remove deterministic SPIN/NBA tables as the first commercial authority: the semantic planner proposes the next conversational move, deterministic code validates compatibility/safety, and SPIN readiness becomes advisory discovery context only. Evidence retrieval and writer composition are focused by the planner's current intent/context instead of broad product dumps.

**Tech Stack:** TypeScript, Node.js, GPT-5 mini Responses API, SQL Server ERP bridge, Supabase/PostgreSQL, product/institutional RAG, node:test, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-21-stech-hybrid-sales-brain-design.md`

## Global Constraints

- SQL/ERP remains authority for price, stock, product identity, images, catalog, orders, and executable side effects.
- Product RAG remains authority for technical product facts; institutional RAG remains authority for policies.
- GPT-5 mini may interpret meaning, customer context, objection, stage, and conversational next-best-action but may not invent factual truth or side effects.
- Product mention must not silently switch the active product.
- Strong purchase intent must continue to protected purchase/reservation/handoff behavior.
- At most one optional follow-up question/action after the current customer request is answered.
- Never repeat discovery for context already known.
- SPIN, FAB, and LAER are conversational techniques, not mandatory state-machine gates.
- Existing Supabase atomic persistence and concurrency contracts remain unchanged.
- No new n8n conversational agent or competing memory store.

---

### Task 1: Lock the real production failures into regression tests

**Files:**
- Modify: `backend/tests/unit/commercial-salesperson-regressions.test.ts`
- Create: `backend/tests/unit/hybrid-sales-brain-authority.test.ts`

**Interfaces:**
- Consumes: `validateTurnDecision`, `compatibleNba`, `evaluatePostAnswerCommercialProgression`, `prepareCommercialWriteInput`, `productEvidenceSections`.
- Produces: regression gates for planner-first compatible NBA, non-redundant suitability, objection-first behavior, and value-first price objection.

- [ ] **Step 1: Add failing planner-authority tests**

```ts
assert.equal(
  compatibleNba('EVALUATE_USE', { activeProduct:'Armor 22', useCase:'trabajo' }, 'ANSWER_ONLY', 'ASK_MISSING_FACT'),
  'ANSWER_ONLY',
);

assert.equal(
  compatibleNba('OBJECTION', { activeProduct:'Armor 22', objection:'desconfianza' }, 'ANSWER_ONLY', 'OFFER_ALTERNATIVE'),
  'ANSWER_ONLY',
);
```

- [ ] **Step 2: Add failing post-answer progression tests**

```ts
const fit = evaluatePostAnswerCommercialProgression({
  intent:'EVALUATE_USE',
  currentNba:'ANSWER_ONLY',
  state:{activeProduct:'Armor 22',useCase:'trabajo'},
  resolvedProduct:'Armor 22',
  verifiedCurrentAnswer:true,
});
assert.notEqual(fit.candidateNba,'ASK_MISSING_FACT');

const distrust = evaluatePostAnswerCommercialProgression({
  intent:'OBJECTION',
  currentNba:'ANSWER_ONLY',
  state:{activeProduct:'Armor 22',objection:'desconfianza'},
  resolvedProduct:'Armor 22',
  verifiedCurrentAnswer:true,
  verifiedAlternatives:2,
});
assert.equal(distrust.candidateNba,'ANSWER_ONLY');
```

- [ ] **Step 3: Add failing write-contract tests** proving `EVALUATE_USE` with a genuine use case does not synthesize another SPIN question and a price objection asking “why choose it” is not automatically converted into budget discovery.

- [ ] **Step 4: Add failing evidence-policy tests** proving planner attributes such as `DURABILITY`, `BATTERY`, and `WATER RESISTANCE` focus suitability evidence on `RESISTENCIA`/`BATERIA` instead of a broad ficha.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:
```bash
cd backend
node --import tsx --test tests/unit/commercial-salesperson-regressions.test.ts tests/unit/hybrid-sales-brain-authority.test.ts
```
Expected: failures showing deterministic NBA/progression currently overrides the compatible semantic proposal.

- [ ] **Step 6: Commit only the failing tests**

```bash
git add backend/tests/unit/commercial-salesperson-regressions.test.ts backend/tests/unit/hybrid-sales-brain-authority.test.ts
git commit -m "test: lock real sales brain regressions"
```

### Task 2: Restore planner-first conversational NBA with deterministic safety fallback

**Files:**
- Modify: `backend/src/conversation/nba/NbaCompatibility.ts`
- Modify: `backend/src/conversation/nba/NextBestAction.ts`
- Modify: `backend/src/conversation/nba/PostAnswerCommercialProgression.ts`
- Test: `backend/tests/unit/hybrid-sales-brain-authority.test.ts`

**Interfaces:**
- Consumes: validated finite planner NBA and `ConversationState`.
- Produces: `compatibleNba(intent,state,proposed,fallback)` where operational safety is deterministic but a compatible semantic proposal wins over a generic fallback.

- [ ] **Step 1: Make compatible semantic NBA win** after protected purchase/human/quote rules:

```ts
if (isNbaCompatible(intent, proposed, state)) return proposed;
if (isNbaCompatible(intent, fallback, state)) return fallback;
```

Add `ANSWER_ONLY` to allowed objection actions.

- [ ] **Step 2: Make `NextBestAction` a conservative fallback**

Use `ANSWER_ONLY` as the fallback for a resolved `EVALUATE_USE` and for objections; do not default every objection to `OFFER_ALTERNATIVE`. Keep protected purchase/handoff behavior unchanged.

- [ ] **Step 3: Stop post-answer progression from manufacturing SPIN**

For grounded `EVALUATE_USE`, objection, price objection, and normal factual replies, preserve the current validated action unless a protected purchase/closing transition applies. Do not turn a complete answer into `ASK_MISSING_FACT` solely because `evaluateSpinReadiness()` has another stage.

- [ ] **Step 4: Run focused tests**

```bash
node --import tsx --test tests/unit/commercial-salesperson-regressions.test.ts tests/unit/hybrid-sales-brain-authority.test.ts
```
Expected: planner/NBA tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversation/nba backend/tests/unit/hybrid-sales-brain-authority.test.ts
git commit -m "fix: restore semantic authority over commercial nba"
```

### Task 3: Merge semantic customer context without letting regex fallbacks flatten meaning

**Files:**
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Modify: `backend/src/conversation/commercial/CommercialFacts.ts` only if needed to keep fallback extraction safe
- Test: `backend/tests/unit/hybrid-sales-brain-authority.test.ts`

**Interfaces:**
- Consumes: prior durable state + deterministic fallback facts + validated `TurnDecision`.
- Produces: canonical current-turn commercial context used by evidence retrieval and writer composition.

- [ ] **Step 1: Add a test** where deterministic fallback says generic `trabajo` while the semantic planner returns a more meaningful genuine use description; assert the semantic current-turn context is not discarded.

- [ ] **Step 2: Implement context merge rule**

Preserve durable prior explicit context. For the current turn, prefer a valid semantic `customerNeed/customerProblem/priorities` over a newly inferred generic regex fallback. Deterministic extraction remains a fallback, not the primary semantic authority.

- [ ] **Step 3: Preserve zero-hallucination guards** by continuing to normalize `customerNeed` through `normalizeGenuineUseCase` and using deterministic persistence/state reduction.

- [ ] **Step 4: Run focused tests and commit**

```bash
node --import tsx --test tests/unit/hybrid-sales-brain-authority.test.ts

git add backend/src/conversation/HybridConversationEngine.ts backend/src/conversation/commercial/CommercialFacts.ts backend/tests/unit/hybrid-sales-brain-authority.test.ts
git commit -m "fix: preserve semantic customer context"
```

### Task 4: Focus RAG evidence on the customer's actual question

**Files:**
- Modify: `backend/src/conversation/commercial/ProductEvidencePolicy.ts`
- Test: `backend/tests/unit/hybrid-sales-brain-authority.test.ts`

**Interfaces:**
- Consumes: semantic intent attributes + canonical customer context.
- Produces: bounded relevant RAG section list.

- [ ] **Step 1: Canonicalize common planner attribute aliases**

Examples:
```ts
DURABILITY -> RESISTENCIA
WATER RESISTANCE -> RESISTENCIA
BATTERY -> BATERIA
ERGONOMICS / WEIGHT / SIZE -> FISICO
PERFORMANCE -> RENDIMIENTO
MEMORY / STORAGE -> MEMORIA
CAMERA -> CAMARA
```

- [ ] **Step 2: For `EVALUATE_USE`, `RECOMMEND`, and `OBJECTION`, prioritize explicit semantic attributes**, then explicit customer priorities, then inferred context sections.

- [ ] **Step 3: Avoid broad ficha sections on an objection unless the customer actually requested product overview.**

- [ ] **Step 4: Run focused tests and commit**

```bash
node --import tsx --test tests/unit/hybrid-sales-brain-authority.test.ts

git add backend/src/conversation/commercial/ProductEvidencePolicy.ts backend/tests/unit/hybrid-sales-brain-authority.test.ts
git commit -m "fix: focus rag evidence by semantic need"
```

### Task 5: Make SPIN advisory and make the writer answer first

**Files:**
- Modify: `backend/src/conversation/commercial/CommercialWriteContract.ts`
- Modify: `backend/src/conversation/commercial/CommercialResponsePlan.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Preserve/verify: `backend/src/conversation/commercial/GroundedDirectAnswer.ts`
- Test: `backend/tests/unit/commercial-salesperson-regressions.test.ts`
- Test: `backend/tests/unit/hybrid-sales-brain-authority.test.ts`

**Interfaces:**
- Consumes: immutable verified factual core + semantic context + validated compatible NBA.
- Produces: one natural customer-facing answer, current question first, optional single continuation second.

- [ ] **Step 1: Restrict `ASK_MISSING_FACT`**

Only keep it when the semantic planner actually selected discovery, the fact is unknown, the backend can consume it, and it materially changes the decision. Do not derive a new SPIN question merely because the next SPIN stage exists.

- [ ] **Step 2: Generalize objection writing**

`OBJECTION_LAER` must address the actual objection (`desconfianza`, size, price, etc.) first. It must not assume every objection is price and must not force an alternative unless `OFFER_ALTERNATIVE` survived validation.

- [ ] **Step 3: Strengthen planner prompt**

Add rules:
- occupation/self-description is valid use context;
- when the question is answerable with known context, prefer answering over completing a SPIN sequence;
- `OFFER_ALTERNATIVE` only when the customer asks for another option, current product is unsuitable/unavailable, or an explicit budget mismatch requires it;
- distrust is not a price objection unless price language is present.

- [ ] **Step 4: Strengthen writer prompt**

Current question must be answered first. Use 1-2 relevant verified facts, not a catalogue dump. At most one optional commercial continuation. Keep the grounded direct answer immutable.

- [ ] **Step 5: Verify worker suitability direct answer remains grounded** and cannot claim unsupported outcomes.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --import tsx --test tests/unit/commercial-salesperson-regressions.test.ts tests/unit/hybrid-sales-brain-authority.test.ts

git add backend/src/conversation/commercial backend/src/adapters/openai/OpenAIProvider.ts backend/tests/unit
git commit -m "fix: make commercial conversation answer-first"
```

### Task 6: Upgrade production smoke from “non-empty” to behavioral acceptance

**Files:**
- Modify: `.github/workflows/prod-commercial-smoke.yml`

**Interfaces:**
- Consumes: deployed public backend `/health` and `/api/chat`.
- Produces: CI evidence that production behavior, not merely HTTP success, matches the sales contract.

- [ ] **Step 1: Worker-fit assertion**

For `Soy obrero, ¿me sirve el Armor 22?` assert:
- final intent is `EVALUATE_USE`;
- answer is non-empty;
- answer does not ask `para qué uso principal`;
- answer contains a grounded fit response before any optional question.

- [ ] **Step 2: Generic distrust assertion**

For `No confío mucho en ese equipo Armor 22.` assert:
- intent is `OBJECTION`, not `HANDLE_PRICE_OBJECTION`;
- answer does not immediately jump to unrelated alternatives;
- answer is not a launch/dimensions/colors specification dump.

- [ ] **Step 3: Price objection assertion**

For `El Armor 22 me parece muy caro. ¿Por qué debería elegirlo?` assert the response addresses value of the current product before any optional alternative/clarification.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/prod-commercial-smoke.yml
git commit -m "qa: enforce production sales behavior"
```

### Task 7: Verify branch, deploy, and verify real persistence

**Files:**
- No schema changes expected.
- No new n8n workflow.

**Interfaces:**
- Consumes: completed branch build.
- Produces: evidence from local/unit CI, public backend, and Supabase persisted rows.

- [ ] **Step 1: Run focused regression tests**

```bash
cd backend
node --import tsx --test tests/unit/commercial-salesperson-regressions.test.ts tests/unit/hybrid-sales-brain-authority.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run build**

```bash
npm run build
```
Expected: exit 0.

- [ ] **Step 3: Run full existing suite**

```bash
npm test
```
Record all pre-existing/legacy failures separately; do not claim full green unless it is actually green.

- [ ] **Step 4: Confirm public build after deployment**

```bash
curl https://whatsapp.artos.pe/health
```
The public `buildId` must no longer be the stale `49c612a` before production behavior can be credited to this remediation.

- [ ] **Step 5: Run the three behavioral production smokes with unique session/message ids.**

- [ ] **Step 6: Query Supabase** and verify current-turn persistence matches the response: final intent, use/context, objection subtype, NBA, and answer are internally consistent.

- [ ] **Step 7: Report evidence only**: branch commit, focused test result, build result, public build id, public responses, and Supabase persisted state.

# STECH Conversation Code Authority Map

> Audit-only document. This file describes the current code path on `feat/stech-backend` and marks authority conflicts before further behavioral fixes. No conversational behavior is changed by this document.

## 1. End-to-end current turn flow

```text
USER MESSAGE
  ↓
CommercialFacts.extractCommercialFacts
BudgetResolver.classifyBudgetTurn
  ↓
baseState
  ↓
IntentPlan.resolveIntentPlan + ReferenceResolver.resolveReference
  ↓
fallbackDecision() / NextBestAction.nextBestAction()
  ↓
OpenAIProvider.decide() semantic planner
  ↓
HybridConversationEngine arbitration
  deterministicOverride / reference / budget / comparison guards
  ↓
DecisionValidator.validateTurnDecision
  ↓
commercialState merge
  useCase / problem / priorities / objection / recommendation carry-over
  ↓
InterestLevel.updateInterestLevel
  ↓
SQL quote/catalog and/or Product/Institutional RAG
  ↓
route-specific branch
  PRICE/STOCK deterministic ResponsePolicy
  or PRODUCT/RECOMMEND/COMPARE writer path
  ↓
PostAnswerCommercialProgression.evaluatePostAnswerCommercialProgression
  candidate NBA
  ↓
CommercialWriteContract.prepareCommercialWriteInput
  evidence normalization
  directAnswer
  CommercialMove
  capability validation
  executable NBA
  ↓
OpenAIProvider.write
  ↓
WriterGuard.safeWrite
  preserve direct answer / execute NBA / guard / fallback / continuity
  ↓
HybridConversationEngine builds state patch
  ↓
StateReducer.reduceState
  continuity/stage/product protections
  ↓
SupabaseConversationRepository.completeTurn
  ia_conversaciones + ia_contexto
  ↓
QA evaluators/oracle
```

## 2. Function authority table

| File / function | Role now | May decide / change | Must not become authority for | Audit status |
|---|---|---|---|---|
| `intent/IntentPlan.ts::resolveIntentPlan` | Main deterministic intent+attribute detector used by Hybrid | semantic intent candidates, attributes | factual truth, product stock/price | EXPECTED |
| `intent/IntentResolver.ts::resolveIntent` | Second deterministic intent implementation | intent | same responsibility already exists in IntentPlan | **DUPLICATE / likely legacy** |
| `reference/ReferenceResolver.ts::resolveReference` | Pronoun/named product/reference resolution | queryTarget, explicitSwitch, selectedProduct | recommendation ranking, factual truth | EXPECTED |
| `commercial/CommercialFacts.ts::extractCommercialFacts` | Deterministic customer-state extraction | useCase, problem, priorities, interest/purchase signals | product facts | EXPECTED |
| `commercial/UseCaseNormalizer.ts` | Removes query-purpose values from true useCase | useCase normalization | intent classification | EXPECTED; should remain canonical normalizer |
| `nba/NextBestAction.ts::nextBestAction` | Pre-answer/base NBA | initial action | final post-answer N+1 | **OVERLAPPING AUTHORITY** |
| `nba/PostAnswerCommercialProgression.ts` | Chooses post-answer progression candidate | candidateNba | factual answer text | EXPECTED candidate authority |
| `commercial/CommercialWriteContract.ts::selectCommercialMove` | Builds semantic payload for `RELATED_VALUE` | CommercialMove | direct answer | EXPECTED but too broad raw-fact inputs |
| `commercial/CommercialWriteContract.ts::prepareCommercialWriteInput` | Builds final writer contract and capability gate | executable NBA, missingFact, directAnswer, CommercialMove | product identity / SQL truth | **HIGH-IMPACT AUTHORITY** |
| `commercial/GroundedDirectAnswer.ts::buildGroundedDirectAnswer` | Builds immutable N | direct factual answer | raw RAG presentation | **DEFINITE CONFLICT / leakage risk** |
| `commercial/ResponsePolicy.ts` | Deterministic rendering for price/stock and move fallback | final text for deterministic routes | decision/NBA selection | EXPECTED, but contains generic benefit text |
| `commercial/CommercialCapabilities.ts` | Can-execute gate | capability eligibility | selecting commercial goal | EXPECTED |
| `recommendation/RecommendationPolicy.ts::rankRecommendations` | Technical recommendation scoring | ranking/winner | catalog existence | EXPECTED |
| `HybridConversationEngine.#rankCandidates` | Catalog retrieval + recommendation eligibility | eligible candidate set | complete catalog identity | **NAMING/SEMANTIC CONFLICT** |
| `OpenAIProvider.decide` | Semantic planner | planner proposal | final deterministic factual authority | EXPECTED proposal only |
| `OpenAIProvider.write` | Natural-language verbalization | wording | final action selection / truth | EXPECTED, but prompt receives raw-ish verified values |
| `writer/WriterGuard.ts::safeWrite` | Safety, delivery, fallback, continuity | presentation fallback; sometimes NBA fallback | replacing correct N with generic answer | **HIGH-IMPACT AUTHORITY** |
| `state/StateReducer.ts::reduceState` | Canonical state reducer and continuity enforcement | product/stage continuity; may force ANSWER_ONLY on blocked recommendation change | normal commercial progression selection | EXPECTED safety override, but another NBA write point |
| `SupabaseConversationRepository.completeTurn` | Persistence | representation only | changing semantic behavior | EXPECTED |
| `qa/evaluators/commercial.ts` | QA verdict | metrics/findings | production behavior | **CURRENTLY TOO PERMISSIVE FOR N+1** |

## 3. Field ownership

| Field | Primary creator | Later writers | Persistence | Notes |
|---|---|---|---|---|
| `activeProduct` | reference/product flow | Hybrid + StateReducer | ia_contexto + snapshot | StateReducer continuity guard is final state authority |
| `queryTarget` | ReferenceResolver / validated decision | Hybrid + StateReducer | both | current-turn factual target |
| `salientProduct` | Hybrid | StateReducer | snapshot | used for short references |
| `selectedProduct` | explicit selection/reference | Hybrid + StateReducer | snapshot | explicit choice authority |
| `recommendedProduct` | recommendation ranking | Hybrid + StateReducer | both | must not silently replace visible product |
| `customerVisibleRecommendedProduct` | StateReducer | StateReducer | contexto JSON | pronoun-visible recommendation authority |
| `useCase` | CommercialFacts / planner fallback | UseCaseNormalizer + Hybrid + StateReducer | both | query purpose must never survive normalization |
| `problem` | CommercialFacts / planner | Hybrid | both | customer problem, not product fact |
| `priorities` | CommercialFacts + planner merge | Hybrid | both | cumulative |
| `budget` | BudgetResolver | Hybrid | both | deterministic budget authority |
| `interestSignal` | CommercialFacts | Hybrid | both | semantic signal, not purchase authority |
| `purchaseSignal` | CommercialFacts / PURCHASE intent | Hybrid | both | drives closing/reservation |
| `levelOfInterest` | InterestLevel | Hybrid | both | intensity signal only |
| `lastIntent` | final Hybrid intent | StateReducer | both | canonical current intent |
| `lastNba` | multiple layers | Writer result + Hybrid + StateReducer | both | **too many writers** |
| `pendingCommercialAction` | Hybrid from `nba` | StateReducer safety | both | mirrors final action |
| `pendingMissingFact` | CommercialWriteContract/Writer result | Hybrid | both | only valid for ASK_MISSING_FACT |
| `commercialMove` | CommercialWriteContract | Writer consumes | trace only | semantic payload for RELATED_VALUE |
| `directAnswer` | GroundedDirectAnswer / route deterministic policy | WriterGuard preserves | not directly persisted as field | should be immutable N |
| `answer` | route/Writer | WriterGuard/fallback | ia_conversaciones + ia_contexto last response | customer-visible final output |

## 4. Factual authorities

- **Price** → SQL/ERP quote only.
- **Stock** → SQL/ERP quote only.
- **Product identity/code/RAG ID** → SQL/reference-resolution path.
- **Product specifications** → Product RAG.
- **Institutional warranty/delivery/payment/location/policies** → Institutional RAG.
- **Conversation memory** → continuity/context only; never price/stock/spec truth.
- **LLM** → interpretation and wording only; not factual authority.

## 5. Proven authority conflicts

### C1 — `directAnswer` can preserve raw RAG metadata as customer text — DEFINITE CONFLICT

`GroundedDirectAnswer.buildGroundedDirectAnswer()` falls back to `compact(raw)` for a PRODUCT_INFO/RAG row when it cannot extract a specific natural fact. RAG rows can contain structured source text such as `Producto ID`, `Código`, `SKU`, `Sección`, `Grupo técnico`, `Título`, `Contenido`.

Because `OpenAIProvider.write()` is explicitly told that `RESPUESTA_DIRECTA` is immutable, this turns an unsafe/raw RAG chunk into protected customer-facing text.

Observed live symptom: `Estoy viendo el Armor X13` leaked internal-shaped RAG content before normal specs.

**First broken boundary:** Product RAG row → GroundedDirectAnswer raw fallback.

### C2 — EvidenceNormalizer treats the full raw RAG chunk as one `VerifiedFact.value` — DEFINITE CONFLICT

`EvidenceNormalizer.normalizeEvidence()` stores compacted full `row.text` as a verified fact for most Product RAG rows. This is useful as evidence but unsafe as a presentation-ready fact. `CommercialMove` and writer prompt can therefore receive metadata-rich paragraphs rather than atomic facts.

**Needed separation later:** evidence payload != display fact.

### C3 — N+1 has multiple authorities — DUPLICATE AUTHORITY

Current action can be written by:

1. `NextBestAction.nextBestAction()`
2. `PostAnswerCommercialProgression`
3. `CommercialWriteContract.prepareCommercialWriteInput`
4. `WriterGuard` result/fallback
5. `HybridConversationEngine` route branch
6. `StateReducer` continuity safety override

This is why a correct candidate can differ from persisted `lastNba`.

**Required future design:** candidate NBA → capability validation → one final executable NBA → presentation; only explicit safety/continuity blocks may invalidate it and must record why.

### C4 — `NextBestAction` still encodes old cold-factual behavior — SUSPICIOUS

For PRICE/STOCK/CAPABILITY/PRODUCT_INFO it returns `ANSWER_ONLY` unless interest/selection allows SOFT_CLOSE. Post-answer progression later upgrades some of these to `RELATED_VALUE`.

Not necessarily wrong as a pre-answer baseline, but its comments/contract make it look like final behavior. This is a source of confusion and duplicated policy.

### C5 — `catalogCandidates` is not actually the full catalog — DEFINITE SEMANTIC/NAMING CONFLICT

`HybridConversationEngine.#rankCandidates()` calls:

`erp.listCatalog({onlyWithStock:true})`

and only then records `catalogCandidates`. It subsequently filters `stock <= 0` again.

Therefore `recommendationTrace.catalogCandidates` means approximately **stock-filtered catalog rows received**, not “all products that exist in catalog.”

This explains why a real product with zero stock can disappear from a trace that appears to be the full catalog.

Future separation should be explicit:

- `catalogCandidates` = all real catalog matches/existing products
- `availableCandidates` = stock > 0
- `eligibleCandidates` = stock/budget/other recommendation gates
- `rankedCandidates` = evidence-ranked subset

Do **not** recommend zero-stock as current winner, but do not erase its existence.

### C6 — WriterGuard is both guard and behavior compositor — DUPLICATE AUTHORITY

`WriterGuard` currently:

- executes some NBA text,
- adds questions,
- adds alternatives,
- adds soft close,
- preserves direct answer,
- preserves CommercialMove,
- rewrites fallback,
- enforces continuity,
- validates unsupported facts/promises.

This is too much responsibility for a “guard”. A guard should reject/sanitize unsafe output; commercial composition should have one prior owner.

### C7 — deterministic PRICE/STOCK path and Writer path are two different response architectures — SUSPICIOUS

PRICE/STOCK use `ResponsePolicy` directly after `prepareCommercialWriteInput`. Product/RAG/recommendation paths go through LLM writer + WriterGuard. This creates different N/+1 delivery semantics depending on route.

### C8 — QA N+1 metrics do not treat `RELATED_VALUE` as required progression — DEFINITE QA GAP

`qa/evaluators/commercial.ts` defines `PROGRESSION_NBAS` without `RELATED_VALUE`.

For a low factual turn such as PRICE/STOCK, if `lastNba=RELATED_VALUE`, `n1Required` can still be false and the evaluation reason becomes effectively `ANSWER_ONLY_APPROPRIATE`. This allows `nbaQuality=25/25` while the actual N+1 contract is not being measured correctly.

### C9 — QA internal-language detector misses raw RAG metadata leakage — DEFINITE QA GAP

The evaluator checks terms such as RAG/oracle/confidence/score, but does not reject customer-facing structured metadata such as:

- `Producto ID:`
- `Código:`
- `SKU:`
- `Sección:`
- `Grupo técnico:`
- `Título:`
- `Contenido:`

Latest live run only flagged the answer as too long, not as internal-data leakage.

### C10 — unsupported-demo scenario is misclassified inside commercial CORE — TEST-SUITE STRUCTURE

`CORE-SAFE-ACTIONABILITY` currently contains:

1. a valid commercial factual turn: `¿Cuánto pesa el Armor 22?`
2. unsupported operation: `¿Pueden agendarme una prueba del equipo?`

The second turn is valuable safety coverage but should live in `SAFETY / UNSUPPORTED_CAPABILITIES`, not consume the main commercial CORE journey. Do not delete it; reclassify in a later QA-only change.

## 6. Current working protections to preserve

Do not reopen or weaken these while fixing the conflicts above:

- SQL price/stock authority.
- UseCaseNormalizer removal of query-purpose pseudo-use-cases.
- Product reference resolution and explicit-switch semantics.
- Recommendation continuity / customer-visible recommendation protection.
- Stage non-regression into discovery during closing.
- Reservation deterministic flow and no fake reservation confirmation.
- Unsupported operational capability blocking.
- RAM physical vs virtual distinction.
- Supabase atomic turn persistence and lock ownership.
- n8n delivery failure remains separate integration noise.

## 7. Current live evidence used for this audit

Run `qa-20260822-202754-344b` shows:

- PRICE: direct answer + availability continuation works.
- STOCK: direct answer + price-help continuation works structurally.
- `Estoy viendo Armor X13`: raw/internal-shaped Product RAG text leaks into customer response and becomes very long.
- Construction: recommendation flow reaches Armor 22 and purchase, but FAB wording remains weak on some turns.
- Weight: direct answer `324 g` is restored and preserved.
- Unsupported demo request is safely denied, but belongs in safety coverage rather than main commercial CORE.
- QA reports N+1 25/25 despite evaluator not modeling `RELATED_VALUE` as required low-intensity N+1.

## 8. Fix order — freeze behavioral changes until done in this sequence

### P0 — Stop raw RAG/internal metadata from becoming `directAnswer`

**Root:** `GroundedDirectAnswer` raw fallback + evidence representation.

**First broken boundary:** RAG evidence → customer-ready N.

**Files likely involved:**
- `commercial/GroundedDirectAnswer.ts`
- `evidence/EvidenceNormalizer.ts`
- possibly RAG adapter normalization

**Preserve:** weight/RAM exact extraction, Product RAG authority.

### P1 — Make N and +1 explicit independent outputs

**Root:** direct answer and continuation are composed/recovered in multiple places.

**Goal:** `N` must never be lost; `+1` failure must not replace N.

**Files:** CommercialWriteContract, ResponsePolicy, WriterGuard, LlmProvider types, Hybrid.

### P2 — Establish one final executable NBA authority

**Root:** six write/override points.

**Goal:** candidate → capability/safety/continuity gate → final action. Writer does not choose or silently replace it.

### P3 — Simplify WriterGuard responsibility

Move commercial composition out of guard; keep safety/sanitization/fallback verification.

### P4 — Separate catalog existence from recommendation availability

Keep zero-stock products known as catalog entities while excluding them from current-purchase winners.

### P5 — FAB/N+1 quality after authority is stable

Improve contextual benefit only after P0-P4; do not phrase-patch current generic FAB.

### P6 — Align QA with real contract

- `RELATED_VALUE` low N+1 must be measured.
- raw RAG metadata must be flagged.
- unsupported operational scenarios move to safety suite.
- CORE should remain realistic selling behavior.

## 9. Audit conclusion

The recurring failures are not caused by “the prompt not saying N+1 strongly enough.” The current backend has accumulated overlapping decision, composition, guard, and fallback authorities. The most immediate regression is even earlier than N+1: raw Product RAG text can be promoted into an immutable `directAnswer`, which then the writer is explicitly instructed to preserve.

**Do not apply another broad N+1 prompt patch before P0 is fixed.**

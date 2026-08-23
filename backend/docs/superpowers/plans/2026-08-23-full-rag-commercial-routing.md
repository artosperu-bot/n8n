# Full RAG Commercial Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Product RAG and Institutional RAG produce commercially useful, grounded responses through atomic verified facts, diverse product highlights, contextual FAB, and exactly one sensible N+1.

**Architecture:** Keep vector retrieval and authority separation intact. Extend evidence normalization, add a focused product-highlight selector, pass its output through the commercial write contract, teach the writer to distinguish PRODUCT_OVERVIEW from ATTRIBUTE_QUERY, and tighten N+1 behavior without changing SQL, reservation, or persistence authorities.

**Tech Stack:** TypeScript, Node.js, OpenAI Responses API, Supabase pgvector/RPC v38.

**Spec:** `backend/docs/STECH_FULL_RAG_COMMERCIAL_ROUTES.md`

## Global Constraints

- SQL/ERP remains the authority for dynamic price and stock.
- Product RAG and Institutional RAG remain documentary authorities.
- RAW RAG must not be copied to the customer when atomic facts can be extracted.
- Product overview should present at least 5 diverse verified highlights when available.
- Physical and virtual RAM must remain explicitly separated.
- Attribute queries answer the requested attribute first and do not dump an entire section.
- FAB may only use verified features plus known customer context.
- Exactly one executable N+1 may be delivered.
- No conversational LIVE QA is executed locally; user runs `npm run qa:acceptance20` or the dedicated Full-RAG suite externally.

---

### Task 1: Expand Atomic Product Evidence

**Files:**
- Modify: `backend/src/conversation/evidence/EvidenceNormalizer.ts`
- Test: `backend/tests/unit/full-rag-evidence-normalizer.test.ts`

**Interfaces:**
- Consumes: `RagEvidence[]` from Product RAG.
- Produces: `VerifiedFact[]` including memory, storage, display, processor, camera, connectivity, battery, resistance, thermal and network facts.

- [ ] **Step 1: Write failing tests** for RAM physical+virtual, storage, display refresh, processor, main camera, NFC, battery and resistance extraction.
- [ ] **Step 2: Verify tests fail** when run by an engineer.
- [ ] **Step 3: Add minimal atomic extractors** without changing SQL facts or institutional semantics.
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit** `feat: expand atomic RAG product evidence`.

### Task 2: Add Product Highlight Selector

**Files:**
- Create: `backend/src/conversation/commercial/ProductHighlightSelector.ts`
- Modify: `backend/src/ports/LlmProvider.ts`
- Test: `backend/tests/unit/product-highlight-selector.test.ts`

**Interfaces:**
- Consumes: `VerifiedFact[]`, intent, requested attribute.
- Produces: `ProductHighlight[]` with `{family,label,facts,summary}`.

- [ ] **Step 1: Write failing tests** proving overview selects one highlight per family before repeats, returns 5+ families when available, and composes RAM physical + virtual + storage in one MEMORY highlight.
- [ ] **Step 2: Verify tests fail**.
- [ ] **Step 3: Implement selector** with canonical family ordering and focused ATTRIBUTE mode.
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit** `feat: select diverse product RAG highlights`.

### Task 3: Wire Highlights into Commercial Write Contract

**Files:**
- Modify: `backend/src/conversation/commercial/CommercialWriteContract.ts`
- Modify: `backend/src/conversation/commercial/GroundedDirectAnswer.ts`
- Test: `backend/tests/unit/full-rag-write-contract.test.ts`

**Interfaces:**
- Consumes: verified facts and selected highlights.
- Produces: `LlmWriteInput.productHighlights`, `presentationMode = PRODUCT_OVERVIEW | ATTRIBUTE | INSTITUTIONAL | DEFAULT`.

- [ ] **Step 1: Write failing tests** showing PRODUCT_INFO with no attribute yields PRODUCT_OVERVIEW and does not freeze an arbitrary single raw direct answer; CAPABILITY remains ATTRIBUTE and direct-grounded.
- [ ] **Step 2: Verify tests fail**.
- [ ] **Step 3: Implement contract fields and presentation mode**.
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit** `feat: route full RAG presentation modes`.

### Task 4: Make Writer Use Highlights + FAB Safely

**Files:**
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/writer/WriterGuard.ts` only if necessary for deterministic fallback safety.
- Test: `backend/tests/unit/full-rag-writer-contract.test.ts`

**Interfaces:**
- Consumes: `productHighlights`, verified facts, customer context, commercial move, executable NBA.
- Produces: customer-facing answer with overview/attribute/institutional policy.

- [ ] **Step 1: Write contract tests/static assertions** for overview instructions, RAM wording, attribute compactness, FAB grounding and one-NBA rule.
- [ ] **Step 2: Verify tests fail**.
- [ ] **Step 3: Update writer prompt input** to explicitly pass `PRODUCT_HIGHLIGHTS` and `PRESENTATION_MODE`.
- [ ] **Step 4: Add deterministic fallback renderer only for overview if LLM output violates numeric grounding or is unavailable; renderer must use verified highlights only.**
- [ ] **Step 5: Verify tests pass**.
- [ ] **Step 6: Commit** `feat: compose full RAG responses with contextual FAB`.

### Task 5: Tighten RAG N+1

**Files:**
- Modify: `backend/src/conversation/commercial/CommercialWriteContract.ts`
- Modify: `backend/src/conversation/nba/NextBestAction.ts` only if the first broken boundary is there.
- Test: `backend/tests/unit/full-rag-n1.test.ts`

**Interfaces:**
- Consumes: presentation mode, known context, stage and turn capabilities.
- Produces: one executable NBA.

- [ ] **Step 1: Write failing tests** proving overview may ask one missing decision criterion, attribute query does not auto-offer stock, institutional location defaults to ANSWER_ONLY, and purchase stage never regresses.
- [ ] **Step 2: Verify tests fail**.
- [ ] **Step 3: Implement the smallest authority-level fix**.
- [ ] **Step 4: Verify tests pass**.
- [ ] **Step 5: Commit** `fix: align full RAG N+1 with presentation context`.

### Task 6: Add Full-RAG QA Contract Fixtures

**Files:**
- Create: `backend/qa/scenarios/fullRag20.ts`
- Create: `backend/scripts/qa-full-rag20.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: FR-01 through FR-20 from the spec.
- Produces: an external LIVE runner that does not execute automatically.

- [ ] **Step 1: Encode 20 multi-turn/isolated routes** with exact expected route/source/presentation constraints.
- [ ] **Step 2: Add `npm run qa:full-rag20`**.
- [ ] **Step 3: Include vector/fallback and response-policy summary files**.
- [ ] **Step 4: Do not execute conversational QA locally**.
- [ ] **Step 5: Commit** `qa: add full RAG commercial acceptance suite`.

### Task 7: Technical Verification and Handoff

**Files:**
- Review all modified files.

- [ ] **Step 1: Run or request `npm run build`** in an environment with the repo available.
- [ ] **Step 2: Review diff for forbidden changes** to SQL authority, reservation, production workflow or persistence schema.
- [ ] **Step 3: Confirm RPC v38 remains the vector retrieval authority and fallback remains observable.**
- [ ] **Step 4: Hand off external LIVE command** `npm run qa:full-rag20` to the user.

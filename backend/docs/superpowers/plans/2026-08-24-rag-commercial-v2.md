# RAG Commercial V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FULL RAG responses commercially useful and conversational: six clear overview blocks, one grounded FAB, memory of recently explored products, and contextual comparison only when the customer asks to compare or choose.

**Architecture:** Keep `text-embedding-3-small` + Supabase RAG v38 unchanged. Extend conversation state with bounded explored-product memory, derive the latest comparison pair from that memory, keep focused factual answers independent from N+1, and let `FullRagAnswerKernel` compose the six-block overview and context-weighted comparisons from normalized RAG facts.

**Tech Stack:** TypeScript, Node.js, existing STECH HybridConversationEngine, Supabase RAG v38.

**Spec:** `backend/docs/STECH_CONVERSATION_COMMERCIAL_CONTRACT.md` plus the approved in-chat RAG Commercial V2 behavior.

## Global Constraints

- Do not change SQL price/stock authority.
- Do not change reservation logic.
- Do not change n8n automation delivery.
- Do not change institutional RAG.
- Keep `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`, `RAG_MODE=supabase`, `SUPABASE_RAG_RPC=buscar_rag_producto_documents_v38` unchanged.
- FAB must be grounded in verified product facts; FAB is part of the current answer, not automatically an N+1 action.
- A product mention/exploration is not a purchase selection or recommendation.

---

### Task 1: Conversation exploration memory

**Files:**
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/conversation/state/StateReducer.ts`
- Test: `backend/tests/unit/rag-commercial-v2.test.ts`

- [ ] Add `exploredProducts?: string[]` to `ConversationState`.
- [ ] Track up to four recently explored RAG products, moving a revisited product to the end.
- [ ] Keep `comparisonProducts` as the latest two explored products without changing `selectedProduct` or `recommendedProduct`.

### Task 2: Natural compare intent from history

**Files:**
- Modify: `backend/src/conversation/intent/IntentPlan.ts`
- Test: `backend/tests/unit/rag-commercial-v2.test.ts`

- [ ] Treat `cuál me conviene`, `con cuál te quedarías`, `cuál elegirías`, and generic `qué diferencia hay` as COMPARE language.
- [ ] Preserve `Y el X13 qué tal` as PRODUCT_INFO, not COMPARE.

### Task 3: Six-block overview + grounded FAB

**Files:**
- Modify: `backend/src/conversation/commercial/FullRagAnswerKernel.ts`
- Test: `backend/tests/unit/rag-commercial-v2.test.ts`

- [ ] Render separate bullets for Rendimiento, Memoria, Batería, Resistencia, Cámaras, Pantalla.
- [ ] Include physical RAM + virtual RAM + storage in Memoria.
- [ ] Add at most one final `En la práctica:` FAB line based on verified facts and known context.

### Task 4: Context-weighted comparison

**Files:**
- Modify: `backend/src/conversation/commercial/FullRagAnswerKernel.ts`
- Test: `backend/tests/unit/rag-commercial-v2.test.ts`

- [ ] Priority order: explicit current criterion > remembered priorities > use case/problem > generic comparison.
- [ ] Compare only relevant fact families and explain the measurable reason for the conclusion.

### Task 5: FAB is not automatic N+1

**Files:**
- Modify: `backend/src/conversation/nba/PostAnswerCommercialProgression.ts`
- Test: `backend/tests/unit/rag-commercial-v2.test.ts`

- [ ] Focused PRODUCT_INFO/CAPABILITY/ATTRIBUTE answers stay ANSWER_ONLY unless another independent progression condition exists.
- [ ] Keep EVALUATE_USE eligible for consultative progression.

### Task 6: External certification

- [ ] User runs `npm run build` locally.
- [ ] User runs `npm run qa:full-rag50` locally.
- [ ] Review conversation report; do not certify from unit tests alone.

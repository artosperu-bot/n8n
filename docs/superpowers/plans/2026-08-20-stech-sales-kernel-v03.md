# STECH Sales Kernel v0.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current backend from a generic LLM writer into a concise, evidence-grounded STECH seller with durable commercial memory, deterministic price/stock/images, real Supabase knowledge, and materially lower token use.

**Architecture:** Route hard commercial facts before generation. SQL Bridge remains authority for price, availability and images; Supabase `documents` and `rag_institucional` become cached knowledge sources for product facts and policies; deterministic routes bypass OpenAI whenever generation adds no value. OpenAI is reserved for concise consultative synthesis such as comparison, recommendation, objection handling and need-based benefit framing.

**Tech Stack:** Node.js >=22.16, TypeScript strip-types, native node:test/fetch, SQL Bridge v2, Supabase REST, OpenAI Responses API.

**Spec:** `docs/superpowers/specs/2026-08-20-stech-live-qa-commercial-telemetry-design.md`

## Global Constraints

- Stock responses never reveal raw inventory quantity; answer only availability. A requested business quantity may be confirmed as sufficient/insufficient without exposing total stock.
- Price is never volunteered; it is returned only for an explicit price/cost request.
- Image requests return only valid HTTP(S) image URLs, one per line, with no prose.
- Never fabricate price, availability, warranty, technical capability, policy, urgency, scarcity, social proof, reservation success or human follow-up.
- One useful question maximum per response; default messaging answer is 1-3 short sentences.
- A direct price/stock/image/policy fact should bypass the LLM when deterministic evidence is sufficient.
- Purchase flow advances one step at a time toward the documented 24-hour reservation policy; do not ask for a large form in one message.
- Existing Supabase schema is reused; no new tables are required.
- No production n8n workflow modification.
- Fix general rules, never individual QA phrases.

---

### Task 1: Sales-policy hard gates and intent coverage

**Files:**
- Modify: `backend/src/conversation/intent/IntentResolver.ts`
- Modify: `backend/src/conversation/nba/NextBestAction.ts`
- Create: `backend/src/conversation/commercial/CommercialFacts.ts`
- Modify: `backend/src/domain/types.ts`
- Tests: `backend/tests/unit/intent-sales-v03.test.ts`, `backend/tests/unit/commercial-facts.test.ts`

**Produces:** intents `IMAGE`, `POLICY`, `RECOMMEND`, `QUOTE` in addition to current intents; deterministic extraction of customer type, sector/use context, problem, priorities, quantity, invoice need, objection and purchase signal.

- [ ] Write regressions for greeting+need priority, `compáralos`, recommendation wording, image requests, policy queries and purchase/quote language.
- [ ] Verify RED against current resolver.
- [ ] Implement minimal generalized patterns and commercial-fact extraction.
- [ ] Verify focused tests GREEN.

### Task 2: Comparison/reference memory and canonical product names

**Files:**
- Modify: `backend/src/conversation/reference/ReferenceResolver.ts`
- Modify: `backend/src/conversation/state/StateReducer.ts`
- Modify: `backend/src/domain/types.ts`
- Create: `backend/tests/unit/reference-comparison-v03.test.ts`

**Produces:** durable comparison pair, current salient target, canonical recommendation name and preserved SPIN/commercial facts.

- [ ] Reproduce `el otro`, attribute preference, explicit switch and full SQL product-name recommendation losses.
- [ ] Implement canonical short-name normalization and pair extraction.
- [ ] Verify regressions GREEN.

### Task 3: Cached Supabase knowledge without per-turn embeddings

**Files:**
- Replace behavior: `backend/src/adapters/supabase/SupabaseRagRepository.ts`
- Keep interface: `backend/src/ports/RagRepository.ts`
- Modify: `backend/src/bootstrap.ts`, `backend/src/config/config.ts`
- Tests: `backend/tests/unit/supabase-knowledge.test.ts`

**Produces:** cached lexical retrieval over active `catalogo_productos`, 69 embedded product `documents` and 71 active `rag_institucional` rows; no embedding API call required for normal turns.

- [ ] Test product section retrieval (`batería`, `cámara`, `resistencia`, `NFC`) and institutional policy retrieval (`envío`, `contraentrega`, `recojo`, `garantía`, `pago`, `reserva`).
- [ ] Implement TTL cache and token/keyword scoring.
- [ ] Set real profile default to Supabase knowledge when persistence credentials are already configured, while test profile remains fake.
- [ ] Verify no current vector RPC contract is invoked.

### Task 4: SQL image authority

**Files:**
- Modify: `backend/src/ports/ErpRepository.ts`
- Modify: `backend/src/adapters/sqlbridge/SqlBridgeErpRepository.ts`
- Modify: `backend/src/adapters/fake/FakeErpRepository.ts`
- Test: `backend/tests/unit/sqlbridge-images.test.ts`

**Exact SQL contract:**
`EXEC dbo.sp_BuscarImagenesProductoVenta @TextoBusqueda=N'<escaped>', @MaxImagenes=10;`

**Expected output:** rows containing `url_imagen`, `tipo_imagen`, ordering metadata; only `http://` or `https://` URLs are accepted.

- [ ] Write RED test asserting exact EXEC and URL-only mapping.
- [ ] Implement `getProductImages(product,maxImages?)`.
- [ ] Verify GREEN.

### Task 5: Deterministic response router and compact LLM gate

**Files:**
- Create: `backend/src/conversation/commercial/ResponsePolicy.ts`
- Modify: `backend/src/conversation/ConversationEngine.ts`
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Test: `backend/tests/integration/sales-kernel-v03.test.ts`, update OpenAI tests.

**Rules:**
- PRICE -> deterministic `El <producto> está a S/ <precio>.`; no unsolicited stock.
- STOCK -> deterministic `Sí, está disponible.` / `Ahora no está disponible.`; never raw count.
- IMAGE -> URL lines only and no LLM call.
- High-confidence POLICY -> concise institutional `respuesta_base`, no LLM call.
- PURCHASE -> one reservation step, e.g. documented 24h reservation + one requested datum, never a multi-field dump.
- CAPABILITY/COMPARE/RECOMMEND/OBJECTION -> LLM only with compact commercial state + verified evidence.
- OpenAI `max_output_tokens=220`; instructions enforce 1-3 short sentences, <=1 question, no internal terminology, no fake actions, no literal `UNKNOWN`.

- [ ] Write spy-based regressions proving PRICE/STOCK/IMAGE/POLICY bypass OpenAI.
- [ ] Verify RED.
- [ ] Implement router and compact writer input.
- [ ] Verify GREEN and token contract.

### Task 6: Persist useful commercial projections

**Files:**
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Test: `backend/tests/unit/supabase-commercial-context.test.ts`

**Writes without overwriting unrelated fields:** `ultimo_mensaje_cliente`, `ultima_respuesta_bot`, `actividad_activa`, `problema_activo`, `cantidad_activa`, `objecion_activa`, `senal_compra`, `accion_pendiente`, `ultimo_message_id`, `ultimo_request_id`, plus canonical JSON `contexto`.

- [ ] Write payload regression.
- [ ] Implement safe projection mapping.
- [ ] Verify GREEN.

### Task 7: QA hard gates and sales journeys

**Files:**
- Modify: `backend/qa/scenarios/journeys.ts`
- Modify: `backend/qa/evaluators/hard.ts`, `commercial.ts`
- Tests: QA evaluator tests.

**Adds:** image-link-only journey, no-stock-count gate, unsolicited-price gate, concise-answer/token advisory gate, policy-grounding and durable commercial-memory expectations.

- [ ] Add RED evaluator tests.
- [ ] Implement gates.
- [ ] Run focused QA tests.

### Task 8: Documentation and full verification

- [ ] Update `backend/.env.example` and `backend/docs/CONEXIONES-REALES.md` for Supabase knowledge mode and sales policies.
- [ ] Run `npm test` with zero failures.
- [ ] Run `npm run build`.
- [ ] User runs live BEFORE/AFTER gate: `npm start` + `npm run qa:live`.
- [ ] Compare against baseline `qa-20260821-005540-6067` on RED/YELLOW families, output tokens, latency and Supabase state completeness.

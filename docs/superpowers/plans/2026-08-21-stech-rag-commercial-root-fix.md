# STECH RAG Commercial Root Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir las causas raíz de `qa-20260821-172842-d546`: intención/refs degradadas, RAG lexical, ranking por similitud, N+1 prematuro y Oracle descalibrado, sin hardcodear productos.

**Architecture:** Mantener SQL como autoridad comercial, Supabase como conocimiento/memoria y separar recuperación de evidencia de decisión comercial. `text-embedding-3-small` generará query embeddings para búsqueda vectorial filtrada por producto/sección; un policy estructurado decidirá recomendaciones y N+1.

**Tech Stack:** Node.js >=22.16, TypeScript strip-types, OpenAI `/v1/embeddings`, Supabase/Postgres pgvector/HNSW, SQL bridge, node:test.

**Spec:** `backend/docs/PLAN-P0-P8-RAG-COMERCIAL.md`

## Global Constraints

- Rama: `feat/stech-backend`; no merge/deploy a producción.
- Whitelist de SP: `backend/docs/SP-AUTORIZADOS-CHATBOT.md`.
- `OPENAI_API_KEY` se reutiliza; modelo embedding: `text-embedding-3-small`.
- Embedding se usa solo para retrieval, nunca como autoridad de “mejor producto”.
- Precio/stock/catálogo siguen siendo SQL.
- No inventar reserva, pedido, stock numérico ni claims técnicos.
- TDD: cada cambio funcional empieza por test que reproduzca el fallo.

---

### Task 1: P0 Semantic Authority Gate

**Files:**
- Modify: `backend/src/conversation/intent/IntentPlan.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/tests/unit/natural-language-gate-v2.test.ts`
- Test: `backend/tests/unit/decision-routing-authority.test.ts`

**Interfaces:**
- Produces: intención determinística fuerte que el planner no puede degradar a `OTHER`.

- [ ] Test RED: `tomar fotos para redes` no debe ser IMAGE; `foto ps` sí.
- [ ] Test RED: presupuesto explícito no puede terminar degradado a OTHER cuando BudgetResolver detectó monto.
- [ ] Test RED: `ya el 22 quiero` debe ser PURCHASE cuando el resolver conoce Armor 22.
- [ ] Implementar override por autoridad semántica y distinción camera-vs-image.
- [ ] Ejecutar `npm test` y `npm run build`.

### Task 2: P1 Product/Reference Resolver

**Files:**
- Modify: `backend/src/conversation/reference/ReferenceResolver.ts`
- Modify: `backend/src/conversation/decision/DecisionValidator.ts`
- Test: `backend/tests/unit/reference-resolver.test.ts`
- Test: `backend/tests/unit/decision-validator.test.ts`

**Interfaces:**
- Produces: target canónico, selection/switch seguro y `el otro` determinístico.

- [ ] Test RED: `ya el 22 quiero` selecciona Armor 22 si el modelo está en el universo contextual.
- [ ] Test RED: PRICE + `el otro` conserva el producto opuesto del pair.
- [ ] Implementar alias contextual corto de modelo sin confundir fechas/cantidades.
- [ ] Validar que mención sin selección no cambie active product.
- [ ] Ejecutar tests/build.

### Task 3: P2 EmbeddingProvider + Vector RAG

**Files:**
- Create: `backend/src/ports/EmbeddingProvider.ts`
- Create: `backend/src/adapters/openai/OpenAIEmbeddingProvider.ts`
- Modify: `backend/src/adapters/supabase/SupabaseRagRepository.ts`
- Modify: `backend/src/config/config.ts`
- Modify: `backend/src/bootstrap.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/config.test.ts`
- Create: `backend/tests/unit/openai-embedding-provider.test.ts`
- Create: `backend/tests/unit/supabase-vector-rag.test.ts`

**Interfaces:**
- `EmbeddingProvider.embed(text:string): Promise<number[]>`
- `SupabaseRagRepository` acepta `embeddingProvider` y RPC names.

- [ ] Test RED: config expone `openAiEmbeddingModel=text-embedding-3-small`.
- [ ] Test RED: provider llama `/v1/embeddings` con modelo configurado.
- [ ] Test RED: product retrieval llama RPC vectorial con producto y query vector, y respeta sections.
- [ ] Test RED: institutional retrieval usa topic/category como filtro fuerte.
- [ ] Implementar fallback lexical seguro cuando embedding/RPC falla.
- [ ] Actualizar `.env.example` sin secretos.
- [ ] Ejecutar tests/build.

### Task 4: P3 Structured Recommendation Policy

**Files:**
- Create: `backend/src/conversation/recommendation/RecommendationPolicy.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Create: `backend/tests/unit/recommendation-policy.test.ts`

**Interfaces:**
- Consumes: candidatos SQL + evidencia por secciones.
- Produces: `{recommended, criteria, tradeoffs, confidence}` sin depender del score vectorial global.

- [ ] Test RED: mayor similarity RAG no implica automáticamente recomendado.
- [ ] Test RED: presupuesto filtra antes del ranking técnico.
- [ ] Test RED: resistencia/batería se comparan con evidencia homogénea.
- [ ] Implementar policy general por criterios, sin nombres de producto hardcodeados.
- [ ] Tests/build.

### Task 5: P4 Symmetric Comparison

**Files:**
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/tests/integration/commercial-contract-regressions.test.ts`

- [ ] Test RED: pair X13/22 + batería recupera evidencia de ambos.
- [ ] Test RED: siguiente cámara conserva el pair.
- [ ] Implementar retrieval simétrico por sección.
- [ ] Tests/build.

### Task 6: P5 N+1 Compatibility Policy

**Files:**
- Create: `backend/src/conversation/nba/NbaCompatibility.ts`
- Modify: `backend/src/conversation/decision/DecisionValidator.ts`
- Create: `backend/tests/unit/nba-compatibility.test.ts`

- [ ] Test RED: PRICE/STOCK sin señal de compra no admiten ASSISTED_HANDOFF.
- [ ] Test RED: PURCHASE/HUMAN sí admiten handoff/transacción.
- [ ] Implementar matriz compatible por intent/state.
- [ ] Tests/build.

### Task 7: P6 Commercial Writer Guardrails

**Files:**
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/writer/WriterGuard.ts`
- Create: `backend/tests/unit/commercial-writer-guardrails.test.ts`

- [ ] Test RED: bloquear meta-frases `catálogo verificado/evidencia verificada` cuando no son necesarias.
- [ ] Test RED: claims superlativos requieren evidencia comparativa.
- [ ] Ajustar instrucciones a dolor→beneficio→prueba→N+1 sin muletilla `te entiendo`.
- [ ] Tests/build.

### Task 8: P7 Oracle/Golden calibration

**Files:**
- Modify: `backend/qa/evaluators/oracle.ts`
- Modify: `backend/qa/scenarios/golden100.ts`
- Modify: `backend/src/conversation/evidence/EvidenceNormalizer.ts` only if needed for QA/full facts separation.
- Test: `backend/tests/integration/qa-oracle-runner.test.ts`
- Test: `backend/tests/unit/golden100-scenarios.test.ts`

- [ ] Test RED: `no tiene 5G; soporta 4G` no se penaliza por el número negado.
- [ ] Test RED: alias `OFFER_ALTERNATIVES` se normaliza al contrato actual.
- [ ] Separar evidencia completa para truth-check del truncamiento usado por writer.
- [ ] Actualizar compra personal hacia flujo de reserva de 1 unidad.
- [ ] Tests/build.

### Task 9: P8 Verification AFTER

- [ ] `npm test` completo.
- [ ] `npm run build`.
- [ ] Confirmar CI del commit final.
- [ ] Ejecutar Golden 100 fresh local/live cuando backend real esté disponible.
- [ ] Comparar contra BEFORE `qa-20260821-172842-d546`.
- [ ] No declarar P8 cerrado sin evidencia AFTER.

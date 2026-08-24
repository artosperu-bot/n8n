# FULL RAG Fact Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar la ruta documental de producto en una sola autoridad `RAG v38 → Fact Store → Answer Plan → respuesta`, eliminando dumps, duplicaciones y decisiones sin razones verificadas.

**Architecture:** El retrieval existente (`text-embedding-3-small` + `buscar_rag_producto_documents_v38`) permanece sin cambios. Un kernel normaliza los chunks recuperados a hechos tipados por producto; un planner decide familias/criterios según la pregunta; un compositor determinista resuelve overview, capabilities, casos de uso, comparaciones y razones de recomendación. El LLM queda fuera de la verdad factual y solo conserva su papel en rutas no cubiertas por el kernel.

**Tech Stack:** TypeScript/Node 22, Supabase RAG v38, OpenAI `text-embedding-3-small`.

**Spec:** `backend/docs/STECH_FULL_RAG_COMMERCIAL_ROUTES.md`

## Global Constraints

- No modificar SQL, precio, stock ni reserva.
- No modificar n8n ni RAG institucional.
- Mantener `RAG_MODE=supabase`.
- Mantener `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`.
- Mantener `SUPABASE_RAG_RPC=buscar_rag_producto_documents_v38`.
- N+1 queda fuera de esta fase.
- No hardcodear características por modelo.
- No afirmar FPS/benchmarks inexistentes.

---

### Task 1: Product Fact Store

**Files:**
- Create: `backend/src/conversation/commercial/FullRagFactKernel.ts`
- Test: `backend/tests/unit/full-rag-fact-kernel.test.ts`

**Interfaces:**
- Consumes: `RagEvidence[]`.
- Produces: `buildProductFactStores(rows): ProductFactStore[]`, con valores tipados por familia.

- [ ] Crear pruebas para memoria, batería, resistencia, cámara, conectividad, redes, térmica, SIM, pantalla y rendimiento.
- [ ] Implementar parser genérico por familia y producto.
- [ ] Garantizar que texto bruto no sea autoridad de presentación.

### Task 2: Answer Planner and Composer

**Files:**
- Create: `backend/src/conversation/commercial/FullRagAnswerKernel.ts`
- Test: `backend/tests/unit/full-rag-answer-kernel.test.ts`

**Interfaces:**
- Consumes: intent, mensaje, producto/criterios/contexto y `ProductFactStore[]`.
- Produces: `buildFullRagAnswer(input): string | null`.

- [ ] Capability: hecho primario + 0–4 soportes de la misma familia.
- [ ] Overview: 4–5 familias relevantes, sin lenguaje de ficha cruda.
- [ ] Use case: matriz gaming/campo/delivery/trabajo/nocturno/térmico/cámara.
- [ ] Compare: mismo criterio en ambos productos + conclusión sustentada.
- [ ] Recommendation: producto recomendado + razones verificadas presentes en el Fact Store.

### Task 3: Integrate Single Authority

**Files:**
- Modify: `backend/src/conversation/commercial/FullRagLlmProvider.ts`
- Modify: `backend/src/conversation/commercial/ProductEvidencePolicy.ts`

**Interfaces:**
- El provider invoca un solo kernel documental antes del Writer.
- El retrieval pide todas las familias necesarias para el Answer Plan.

- [ ] Integrar `buildFullRagAnswer` para PRODUCT_INFO, ATTRIBUTE/CAPABILITY, EVALUATE_USE, COMPARE y RECOMMEND.
- [ ] Mantener institucional y otras rutas sin cambio.
- [ ] Evitar doble redacción/duplicación: cuando el kernel resuelve, devolver respuesta determinista.

### Task 4: Realistic FULL RAG 50 Gate

**Files:**
- Modify: `backend/qa/scenarios/fullRag50.ts`
- Test: `backend/tests/unit/full-rag-answer-kernel.test.ts`

- [ ] Mantener exactamente 50 turnos reales.
- [ ] Cubrir `hola/info`, capability, gaming, campo, delivery, térmica, comparación y recomendación.
- [ ] Bloquear: dumps irrelevantes, respuesta duplicada, raw RAG, labels internos, recomendación sin razones y comparación vacía.
- [ ] Ejecutar `npm run build`; después el usuario ejecuta `npm run qa:full-rag50` externamente.

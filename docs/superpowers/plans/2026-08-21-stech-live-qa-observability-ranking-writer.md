# STECH Live QA Observability + Ranking + Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer observable cada decisión comercial y corregir de raíz los fallos Live de atributos, recomendación, TERMICA, SPIN repetitivo y redacción desordenada sin hardcodear modelos.

**Architecture:** Mantener `HybridConversationEngine` como orquestador. `RecommendationPolicy` decide por capacidades verificadas; `ProductEvidencePolicy` decide qué secciones RAG consultar; `WriterGuard/OpenAIProvider` solo redactan con hechos permitidos. La traza se guarda dentro del JSON canónico ya persistido en Supabase y se expone en `debug`, sin DDL ni tablas nuevas.

**Tech Stack:** TypeScript, Node 22, SQL Server adapters, Supabase/PostgreSQL JSONB, OpenAI Responses API.

**Spec:** `docs/superpowers/specs/2026-08-21-stech-root-cause-remediation-design.md` + `backend/docs/SPIN-FAB-N1-POLITICA-COMERCIAL.md`

## Global Constraints

- No merge ni deploy a producción.
- No DDL ni re-embedding de datos productivos.
- SQL sigue siendo autoridad de catálogo/precio/stock.
- RAG de producto sigue siendo autoridad técnica.
- Similarity de embeddings nunca es score de calidad del producto.
- No hardcodear Armor X12/X13/22/25T como ganadores.
- `ANSWER_ONLY` no puede añadir una pregunta comercial.
- SPIN no puede repetir un dato que ya está en memoria.
- Una reserva solo se confirma después del SP autorizado exitoso.

---

### Task 1: Traza de decisión y recomendación

**Files:**
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Test: `backend/tests/integration/root-remediation-regressions.test.ts`

**Interfaces:**
- Produce `TurnDecisionTrace` con intent determinístico/planner/final, candidatos, secciones RAG, ranking, winner, NBA, writer fallback.
- Persistir en `ConversationState.lastDecisionTrace` y `contexto_comercial_snapshot.debug_trace` sin nuevas columnas.

- [ ] Escribir test que exige `debug.decisionTrace` y persistencia en el contexto JSON.
- [ ] Verificar RED.
- [ ] Implementar traza segura, sin secretos ni prompts completos.
- [ ] Añadir `console.log(JSON.stringify({event:'STECH_TURN_TRACE', ...}))` solo con IDs/decisiones/score/fallback.
- [ ] Verificar tests.

### Task 2: Necesidad conocida debe entrar a recomendación

**Files:**
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/tests/integration/root-remediation-regressions.test.ts`

- [ ] Añadir regresión: `fotos de trabajos + redes + resistente` no puede terminar preguntando `qué aspecto es más importante`.
- [ ] Hacer que `CAPABILITY/EVALUATE_USE` sin producto y con prioridades suficientes se convierta en `RECOMMEND`/ranking cuando el mensaje expresa elección entre catálogo o necesidad de solución.
- [ ] Preservar CAPABILITY factual cuando existe producto/referente.
- [ ] Verificar que no rompe cámara vs imágenes.

### Task 3: RecommendationPolicy V2 con TERMICA y desempate correcto

**Files:**
- Modify: `backend/src/conversation/recommendation/RecommendationPolicy.ts`
- Modify: `backend/src/conversation/commercial/ProductEvidencePolicy.ts`
- Test: `backend/tests/unit/recommendation-policy.test.ts`

- [ ] Añadir test: un candidato con TERMICA documentada puede ganar cuando la necesidad es inspección/temperatura.
- [ ] Añadir test: empate técnico no favorece precio si precio/presupuesto no es criterio.
- [ ] Añadir métricas `TERMICA`, video/cámara útiles y mapping de prioridades semánticas.
- [ ] Incluir TERMICA/SENSORES en secciones cuando la necesidad lo justifica.
- [ ] Mantener filtro duro de presupuesto/stock antes del ranking.

### Task 4: Writer comercial corto y ordenado

**Files:**
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/writer/WriterGuard.ts`
- Test: `backend/tests/unit/commercial-writer-guardrails.test.ts`

- [ ] Añadir tests de no inventar `probablemente consume más` ni inferencias de baja luz sin respaldo.
- [ ] Prompt: respuesta directa primero; 1–3 frases o hasta 3 bullets; negrita/bullets solo cuando mejoran lectura; no encabezados mecánicos `Datos clave/Consecuencia/Recomendación`.
- [ ] Trade-off solo si está sustentado por evidencia comparada.
- [ ] N+1 solo si la decisión lo autoriza.

### Task 5: Verificación Live/Supabase

**Files:**
- Modify únicamente tests/QA si la evidencia demuestra fallo del evaluador, no para maquillar el bot.

- [ ] Ejecutar suite de código como guard técnico.
- [ ] Ejecutar conversación manual/nueva Golden100 con run id nuevo.
- [ ] Consultar `ia_conversaciones` + `ia_contexto` y revisar `debug_trace` para RED/YELLOW.
- [ ] Marcar P1–P8 como RESUELTO/PARCIAL/ABIERTO usando código + regresión + Live.

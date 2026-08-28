# STECH Data Contract Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make STECH persistence lean and deterministic: only useful fields remain in the active contract, catalog/SQL/RAG/customer/commercial authorities are explicit, pseudo-fields are removed, and short-reply continuity is preserved safely.

**Architecture:** `ia_conversaciones` is an immutable turn-event/audit table. `ia_contexto.contexto` is the canonical current memory. `ia_sesiones` remains operational only. `ia_persistir_turno_atomico` is the sole production persistence boundary and enriches catalog-derived fields before the atomic insert/upsert. Destructive column drops happen only after all code/SQL/CRM dependencies are removed and live persistence is certified.

**Tech Stack:** TypeScript/Node 22, Supabase/PostgreSQL, existing STECH backend, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-24-stech-data-contract-cleanup-design.md`

## Global Constraints

- Do not change SQL Server price/stock truth.
- Do not change RAG retrieval truth.
- Do not modify n8n production workflow logic as part of this cleanup.
- Conversation/live QA runs locally, not in GitHub Actions.
- Preserve `ia_adquirir_turno -> ia_persistir_turno_atomico -> ia_liberar_turno`.
- `purchaseSignal` may never be inferred from interest score or stage.
- Category/brand/product metadata come from Supabase catalog, not LLM.
- No destructive database DROP until dependency scan and live persistence gate are GREEN.

---

### Task 1: Freeze the backend persistence payload

**Files:**
- Modify: `backend/src/adapters/supabase/PersistenceProjection.ts`
- Modify: `backend/src/adapters/supabase/SupabaseConversationRepository.ts`
- Test: `backend/tests/unit/persistence-projection.test.ts`

**Interfaces:**
- Consumes: previous and current `ConversationState`.
- Produces: a turn delta for `ia_conversaciones` plus canonical context additions for `ia_contexto.contexto`.

- [ ] **Step 1: Add failing tests proving removed fields are not emitted by the active persistence payload**

Assert that the active payload does not intentionally populate: `objetivo`, `confianza`, `costo_prompt_estimado`, `costo_estimado_usd`, `intent_score`, `estado_emocional`, `probabilidad_compra`, `perfil_cliente`, `urgencia`, `limitacion_agente`, `alcance_consulta`.

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
cd C:\DESAROLLO\n8n\backend
node --experimental-strip-types --test tests/unit/persistence-projection.test.ts
```

- [ ] **Step 3: Remove these fields from the active repository payload and preserve only the canonical fields defined by the spec**

Keep the existing event-delta behavior for activity/problem/implication/priorities and typed pending contracts.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Use the same command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/adapters/supabase/PersistenceProjection.ts backend/src/adapters/supabase/SupabaseConversationRepository.ts backend/tests/unit/persistence-projection.test.ts
git commit -m "refactor: freeze canonical persistence payload"
```

---

### Task 2: Make catalog metadata deterministic at the atomic boundary

**Files:**
- Create: `sql/supabase/migrations/004_data_contract_catalog_projection.sql`
- Create: `sql/supabase/qa/004_data_contract_catalog_projection_qa.sql`
- Create: `sql/supabase/rollback/004_data_contract_catalog_projection_rollback.sql`

**Interfaces:**
- Consumes: `p_conversacion.producto_id_resuelto` / `producto_codigo_resuelto`.
- Produces: authoritative `producto_detectado`, `marca_detectada`, `categoria` and canonical product metadata from `catalogo_productos`, `catalogo_categorias`, `catalogo_subcategorias`.

- [ ] **Step 1: Write QA SQL that fails against the current atomic RPC**

Use a transaction/controlled QA session and assert that a confirmed Armor 22 turn resolves:

```text
producto_id_resuelto = P-ARMOR-22-256G
producto_codigo_resuelto = P000049
producto_detectado = Armor 22 (or catalog display name according to contract)
marca_detectada = ULEFONE
categoria = Celulares y Teléfonos
```

- [ ] **Step 2: Run QA read-only/rollback-safe SQL and confirm the current gap**

No production conversation data is mutated permanently by this verification.

- [ ] **Step 3: Update `ia_persistir_turno_atomico` in migration 004**

Before `jsonb_populate_record`, resolve the confirmed product against active catalog and patch the conversation/context payload with catalog-derived display name, brand, category and subcategory. Reject an allegedly confirmed product that is absent/inactive instead of accepting free text as authority.

- [ ] **Step 4: Re-run QA SQL and require the exact catalog values**

- [ ] **Step 5: Commit migration + QA + rollback**

```bash
git add sql/supabase/migrations/004_data_contract_catalog_projection.sql sql/supabase/qa/004_data_contract_catalog_projection_qa.sql sql/supabase/rollback/004_data_contract_catalog_projection_rollback.sql
git commit -m "feat: derive conversation catalog metadata atomically"
```

---

### Task 3: Remove pseudo purchase probability from the persistence path

**Files:**
- Create: `sql/supabase/migrations/005_remove_probability_logic_from_atomic_rpc.sql`
- Create: `sql/supabase/qa/005_no_probability_inference_qa.sql`
- Create: `sql/supabase/rollback/005_remove_probability_logic_from_atomic_rpc_rollback.sql`

**Interfaces:**
- Consumes: canonical `commercial.interestLevel`, `senal_compra`, `etapa_conversacion`.
- Produces: session stage and summary without any fabricated numeric purchase probability.

- [ ] **Step 1: Write failing QA showing the current defect**

Demonstrate that the current RPC assigns numeric `ia_sesiones.probabilidad_compra` from `CIERRE`, `EVALUACION` or `DESCUBRIMIENTO` even without explicit purchase evidence.

- [ ] **Step 2: Update the atomic RPC**

Delete the stage-to-probability calculation. Keep `ia_sesiones.etapa_comercial`, `resumen`, `version`, handoff/mode state. Do not substitute another hidden pseudo-probability.

- [ ] **Step 3: Verify**

Cases `PRICE`, `STOCK`, `me interesa`, `si hay stock me interesa` must not create purchase. Explicit `quiero comprarlo` may set `senal_compra=true` in context but still does not need a probability column.

- [ ] **Step 4: Commit**

```bash
git add sql/supabase/migrations/005_remove_probability_logic_from_atomic_rpc.sql sql/supabase/qa/005_no_probability_inference_qa.sql sql/supabase/rollback/005_remove_probability_logic_from_atomic_rpc_rollback.sql
git commit -m "fix: remove fabricated purchase probability"
```

---

### Task 4: Update CRM API to consume real commercial signals

**Files:**
- Create: `sql/supabase/migrations/006_crm_real_commercial_signals.sql`
- Create: `sql/supabase/qa/006_crm_real_commercial_signals_qa.sql`
- Create: `sql/supabase/rollback/006_crm_real_commercial_signals_rollback.sql`

**Interfaces:**
- Consumes: `ia_contexto.contexto.commercial.interestLevel`, `ia_contexto.senal_compra`, `ia_contexto.etapa_conversacion`, `ia_metricas_tokens`.
- Produces: CRM session/list/dashboard data without `probabilidad_compra` or `costo_estimado_usd` authority.

- [ ] **Step 1: Add QA for `crm_api(list_sessions/get_messages/dashboard)`**

Expected public commercial fields:

```text
nivel_interes
senal_compra
etapa_conversacion
```

Dashboard replaces `buying_signals` based on probability with:

```text
purchase_signals = count(senal_compra=true)
high_interest = count(interestLevel >= configured threshold)
```

- [ ] **Step 2: Replace CRM reads of `ia_sesiones.probabilidad_compra`**

Read interest level from canonical context JSON and purchase signal from context projection.

- [ ] **Step 3: Remove CRM dependence on `ia_conversaciones.costo_estimado_usd`**

Keep token counts authoritative from `ia_metricas_tokens`. Do not calculate dollar cost until a versioned model-pricing authority exists.

- [ ] **Step 4: Run CRM QA and commit**

```bash
git add sql/supabase/migrations/006_crm_real_commercial_signals.sql sql/supabase/qa/006_crm_real_commercial_signals_qa.sql sql/supabase/rollback/006_crm_real_commercial_signals_rollback.sql
git commit -m "refactor: make CRM use real commercial signals"
```

---

### Task 5: Add and persist commercial readiness without making SPIN mandatory

**Files:**
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/adapters/supabase/PersistenceProjection.ts`
- Test: `backend/tests/unit/persistence-projection.test.ts`
- Test: `backend/tests/unit/commercial-spin-n1-regressions.test.ts`

**Interfaces:**
- Produces `commercial.readiness` in canonical context.

- [ ] **Step 1: Add failing tests for readiness**

Required enum:

```ts
type CommercialReadiness =
  | 'EXPLORING'
  | 'DISCOVERY_NEEDED'
  | 'FIT_READY'
  | 'OFFER_READY'
  | 'EVALUATING_PURCHASE'
  | 'CLOSE_READY'
  | 'PURCHASE';
```

A customer who states construction + resistance + battery may become `FIT_READY` even when SPIN implication is absent.

- [ ] **Step 2: Implement minimal deterministic readiness derivation**

No LLM may directly set readiness. It is derived from canonical facts, current intent, active objection, price/stock progression and explicit purchase state.

- [ ] **Step 3: Persist it only inside `ia_contexto.contexto.commercial.readiness` initially**

Do not add a new flat DB column unless a later indexed CRM query proves it necessary.

- [ ] **Step 4: Run focused commercial/persistence tests and commit**

---

### Task 6: Certify the non-destructive contract before dropping any column

**Files:**
- Create: `backend/qa/qa-persistence-contract.ts`
- Modify: `backend/package.json` to add `qa:persistence-contract`

**Interfaces:**
- Executes controlled live sessions and reads the matching `ia_conversaciones` + `ia_contexto` rows.

- [ ] **Step 1: Add controlled cases**

Minimum cases:

```text
info Armor 22
precio Armor 22
hay stock?
¿Tiene NFC?
Necesito NFC sí o sí
Se me cae seguido
Cuando se rompe pierdo horas
Si hay stock me interesa
Lo quiero comprar
```

- [ ] **Step 2: Assert cross-table invariants**

Examples:

```text
confirmed product -> category + brand from catalog
factual NFC question -> no priority
recurring drop -> problem yes, implication no
explicit impact -> implication yes
interest -> purchase false
explicit purchase -> purchase true
ia_conversaciones detected fields = turn delta
ia_contexto = accumulated current state
ANSWER_ONLY -> no pending action
```

- [ ] **Step 3: Run**

```powershell
cd C:\DESAROLLO\n8n\backend
npm run qa:persistence-contract
```

Require exact `PERSISTENCE CONTRACT gate=GREEN` before destructive migration.

---

### Task 7: Physically remove fields that are no longer used

**Files:**
- Create: `sql/supabase/migrations/007_drop_retired_ai_fields.sql`
- Create: `sql/supabase/qa/007_drop_retired_ai_fields_qa.sql`
- Create: `sql/supabase/rollback/007_drop_retired_ai_fields_rollback.sql`

**Interfaces:**
- Runs only after Tasks 1–6 are GREEN and dependency scan returns zero active references.

- [ ] **Step 1: Dependency scan**

Require zero active dependencies on retired columns in views/functions/triggers/backend/CRM.

- [ ] **Step 2: Drop retired `ia_conversaciones` fields**

```text
objetivo
confianza
costo_prompt_estimado
costo_estimado_usd
intent_score
estado_emocional
probabilidad_compra
perfil_cliente
urgencia
limitacion_agente
alcance_consulta
```

- [ ] **Step 3: Drop retired `ia_contexto` fields**

```text
ultimo_tipo_mensaje
ultimo_oficio_detectado
ultimo_sector_detectado
necesita_clasificacion_ia
version
alcance_consulta
```

- [ ] **Step 4: Drop retired `ia_sesiones` field**

```text
probabilidad_compra
```

- [ ] **Step 5: Re-run schema, RPC, CRM and persistence QA**

No use of `CASCADE`. If DROP reports a dependency, stop and remove the dependency explicitly instead of cascading.

---

### Task 8: Final local gates

- [ ] **Step 1: Focused tests**

```powershell
cd C:\DESAROLLO\n8n\backend
node --experimental-strip-types --test `
  tests/unit/persistence-projection.test.ts `
  tests/unit/commercial-facts.test.ts `
  tests/unit/commercial-spin-n1-regressions.test.ts
```

- [ ] **Step 2: Build**

```powershell
npm run build
```

- [ ] **Step 3: Persistence live gate**

```powershell
npm run qa:persistence-contract
```

- [ ] **Step 4: Commercial smoke only after persistence GREEN**

```powershell
npm run qa:commercial-smoke
```

- [ ] **Step 5: `commercial50` only after smoke is GREEN**

```powershell
npm run qa:commercial50
```

## Definition of Done

The cleanup is complete only when:

1. no active code writes retired fields;
2. no DB function/view/CRM reads retired fields;
3. retired columns are physically gone;
4. confirmed product turns persist catalog-derived category/brand;
5. no stage creates fake purchase probability;
6. `nivel_interes` and `senal_compra` are separate and explainable;
7. turn deltas and current context agree in live QA;
8. build + persistence gate + commercial smoke are GREEN.

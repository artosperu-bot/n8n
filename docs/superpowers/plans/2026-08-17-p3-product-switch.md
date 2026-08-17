# P3 Execution 3800 Product Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a deterministic explicit product switch resolve the named product, demote a conflicting recommendation, and persist accurate switch metadata without changing production.

**Architecture:** Node 06 owns deterministic evidence precedence and exact product targeting for explicit switches. Node 17A remains the sole recommendation authority and performs only recommendation reconciliation. Node 23 remains the persistence mapper and copies the already-derived switch flag into the existing atomic conversation payload.

**Tech Stack:** n8n Code nodes, n8n HTTP persistence node, Supabase/PostgreSQL atomic persistence RPC, manual QA executions.

## Global Constraints

- P0, P1, P2.1, node 06B, and production are frozen; node 06 is authorized only at the fresh execution-3805 boundary.
- No phrase or product hardcoding.
- Preserve comparison history, SPIN, activity, budget, priorities, and unrelated pending state.
- One physical owner per RED→GREEN cycle.
- Actual persisted response and state determine PASS.

---

### Task 0: Preserve exact targeting for deterministic product switches

**Files:**
- Modify: n8n node `06 Resolver Turno y Estado`
- Test: fresh manual QA sequence matching execution 3805

**Interfaces:**
- Consumes: deterministic explicit product reference, previous active product, deterministic recommendation/comparison cues, grounded semantic requests
- Produces: exact explicit target, canonical specification action, provisional explicit-switch metadata

- [x] **Step 1: Verify fresh RED**

Execution 3805 established Armor 22 as active and Armor X12 as recommended, then sent `Mejor quiero el Armor X13.`. The interpreter emitted `RECOMMEND`; node 06 accepted it, SQL performed broad recommendation search, and X13 was never resolved.

- [ ] **Step 2: Implement evidence precedence**

Compare the deterministic explicit reference with normalized aliases of the active product. When they differ and deterministic recommendation/comparison language is absent, remove only uncorroborated `RECOMENDAR`/`COMPARAR`, retain exact specification lookup, and emit explicit-switch metadata. Do not hardcode the phrase or product.

- [ ] **Step 3: Validate isolation**

Validate node/workflow, diff versions, and confirm only node 06 changed from the prior draft while production remains unchanged.

- [ ] **Step 4: Re-run the exact sequence**

Require exact X13 resolution before continuing to 17A reconciliation and persistence.

---

### Task 1: Reconcile conflicting recommendation in node 17A

**Files:**
- Modify: n8n node `17A Árbitro Final Canónico`
- Test: fresh manual QA product-switch sequence

**Interfaces:**
- Consumes: `estado_anterior.producto_activo`, `resolucion_contextual.producto_objetivo`, `referencia_producto`, `producto_resuelto`, `contexto_actualizado.producto_recomendado`
- Produces: reconciled `contexto_actualizado`, boolean `cambio_producto_explicito`, semantic validation marker

- [ ] **Step 1: Verify RED**

Use execution 3800 and confirm: explicit Armor X13 reference, resolved/active Armor X13, recommended Armor X12 Pro, persisted explicit-switch false.

- [ ] **Step 2: Implement minimal 17A behavior**

Add a general predicate that requires: previous active product exists; current product reference origin is explicit; the explicit reference matches the resolved product; and the resolved product differs from previous active. Set the switch flag. If the existing recommendation differs from the resolved product, set `producto_recomendado` to null and clear only its authoritative ID/model in `contexto_decision`, marking authority as explicit product switch.

- [ ] **Step 3: Validate node and workflow**

Run n8n node validation and workflow validation. Confirm only node 17A changed and production active version is unchanged.

- [ ] **Step 4: Verify GREEN behavior**

Run a fresh recommendation turn followed by `Mejor quiero el Armor X13.` Confirm active Armor X13, conflicting recommendation absent, response about Armor X13, comparison/history preserved, and no third product.

### Task 2: Persist explicit-switch metadata in node 23

**Files:**
- Modify: n8n node `23 Guardar Conversación`
- Test: fresh manual QA product-switch sequence plus Supabase readback

**Interfaces:**
- Consumes: `cambio_producto_explicito` emitted by 17A/current context
- Produces: `p_conversacion.cambio_producto_explicito: boolean`

- [ ] **Step 1: Verify RED after Task 1**

Confirm execution state has the explicit-switch flag but the persisted `ia_conversaciones.cambio_producto_explicito` remains false because node 23 omits the supported field.

- [ ] **Step 2: Implement minimal mapping**

Add `cambio_producto_explicito:Boolean(x.cambio_producto_explicito||ctx.cambio_producto_explicito)` to the existing `conversacion` payload. Do not change the RPC or schema.

- [ ] **Step 3: Validate node and workflow**

Run n8n node and workflow validation. Confirm only node 23 changed relative to the Task 1 draft and production remains unchanged.

- [ ] **Step 4: Verify GREEN persistence**

Run a second fresh two-turn sequence and read back `ia_conversaciones` plus `ia_contexto`. Require explicit-switch true, active Armor X13, no conflicting recommendation, and correct response.

### Task 3: Adjacent regression

**Files:**
- Create: `qa/evidence/P3_PRODUCT_SWITCH_20260817.md`

**Interfaces:**
- Consumes: final QA draft from Tasks 1–2
- Produces: sanitized regression evidence

- [ ] **Step 1: Price after switch**

Ask explicit price; require Armor X13 dynamic price and no stale X12 Pro target.

- [ ] **Step 2: Comparison after switch**

Compare Armor X13 with Armor 22; require only that pair in response and persisted refs.

- [ ] **Step 3: Warranty and purchase after switch**

Ask warranty, then initiate purchase; require Armor X13 continuity and no stale recommendation ownership.

- [ ] **Step 4: Record sanitized evidence**

Document actual execution IDs, customer responses, canonical state, persisted state, and production non-publication.

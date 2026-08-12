# P0 Safe Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir y validar `ia_liberar_turno` para impedir finalizaciones stale o sin ownership válido.

**Architecture:** Mantener el contrato de fencing `session_id + owner + message_id + lease vigente + queue PROCESSING`. La hora se toma después de bloquear y validar lock/queue, inmediatamente antes de finalizar, para evitar usar un timestamp obsoleto si hubo espera por locks.

**Tech Stack:** PostgreSQL 17 / Supabase / PLpgSQL / GitHub.

## Global Constraints

- No modificar `STECH Ventas Consultivas` V45.68 durante esta fase.
- No reemplazar `ia_liberar_turno` hasta que el candidato QA pase las pruebas.
- No tocar `ia_persistir_turno_atomico`.
- No permitir `PENDING → DONE`, `FAILED → DONE`, stale worker → DONE, owner incorrecto → DONE, lease vencido → DONE o message_id incorrecto → DONE.

---

### Task 1: Corregir candidato Safe Release

**Files:**
- Modify: `sql/supabase/migrations/002_p0_safe_release.sql`

- [ ] Mover la medición efectiva de `clock_timestamp()` al punto posterior a los `FOR UPDATE` de lock y queue.
- [ ] Revalidar lease inmediatamente antes de `PROCESSING → DONE`.
- [ ] Mantener update de queue y delete de lock dentro de la misma transacción de función.

### Task 2: Probar función QA aislada

**Interfaces:**
- Candidate: `public.ia_liberar_turno_qa(text,text,text) returns jsonb`

- [ ] Crear temporalmente el candidato QA sin reemplazar la RPC productiva.
- [ ] Verificar: lock inexistente, owner mismatch, message mismatch, queue owner mismatch, PENDING, FAILED, lease expired y release positivo.
- [ ] Verificar que los casos negativos preservan queue y lock.
- [ ] Verificar que el caso positivo deja queue `DONE` y elimina exactamente el lock del owner.

### Task 3: Cierre QA

- [ ] Eliminar datos QA y la función QA temporal.
- [ ] Confirmar 0 residuos QA.
- [ ] Registrar evidencia en GitHub.
- [ ] Solo si todo pasa, dejar Script C como candidato listo para aplicación; no modificar V45.68 todavía.

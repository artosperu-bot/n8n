# CRM Automation Media Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing CRM automation engine with text, automatic product image + text, and custom image URL + text while preserving current scheduling and safety semantics.

**Architecture:** Keep the existing scheduler/worker/repository pipeline. Resolve automatic product media when the job is scheduled, freeze it into job snapshots, execute through the existing WhatsApp client, and fall back to text only for non-ambiguous media failures. Extend the current React automation UI rather than creating a new subsystem.

**Tech Stack:** Node.js 22 TypeScript strip-types runtime, Supabase/Postgres RPCs, SQL Bridge, WhatsApp Cloud API v25, React/Vite/Vitest, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-27-crm-automation-media-design.md`

## Global Constraints

- Preserve one-rule-once-per-conversation idempotency.
- Preserve cancellation on customer reply and non-BOT attention modes.
- Preserve worker live revalidation and 24-hour WhatsApp policy.
- Resolve product media at scheduling time and snapshot it.
- Prefer `caracteristicas_generales`; otherwise first valid HTTPS image.
- Support `SEND_TEXT`, `SEND_IMAGE_PRODUCT_AUTO`, `SEND_IMAGE_CUSTOM_URL`.
- Do not add n8n execution or Supabase Storage in this iteration.
- No production code before a failing test for the behavior.

---

### Task 1: Backend contract and snapshot tests

**Files:**
- Modify: `backend/tests/unit/automation-worker.test.ts`
- Create: `backend/tests/unit/automation-media-scheduler.test.ts`
- Create: `backend/tests/unit/whatsapp-image-send.test.ts`
- Modify: `backend/tests/integration/crm-automation-api.test.ts` if present

**Interfaces:**
- Produces action/media fields on rules/jobs and sender image capability used by later tasks.

- [ ] Write failing tests for action types, custom URL validation, product image preference, snapshot stability, image execution, text fallback and ambiguous failure.
- [ ] Run scoped backend tests and confirm RED failures are caused by missing media functionality.

### Task 2: Supabase additive migration

**Files:**
- Create: `sql/supabase/migrations/008_crm_automation_media.sql`

**Interfaces:**
- Produces rule `media_url`, job media/action snapshot fields and updated schedule/claim RPC result contract.

- [ ] Add columns/check constraints without replacing tables or guards.
- [ ] Extend `crm_schedule_automation_job_once` to accept and persist action/media snapshots.
- [ ] Extend `crm_claim_due_automation_jobs` to return snapshot action/media fields.
- [ ] Preserve grants and service-role-only worker RPC access.

### Task 3: Backend domain/repository/scheduler

**Files:**
- Modify: `backend/src/automation/types.ts`
- Modify: `backend/src/automation/AutomationScheduler.ts`
- Modify: `backend/src/adapters/supabase/SupabaseAutomationRepository.ts`
- Modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Modify: `backend/src/ports/Crm.ts`
- Modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts` only if the scheduler needs extra context
- Modify: `backend/src/bootstrap.ts`

**Interfaces:**
- `AutomationMediaResolver.resolveForSession(sessionId, actionType, mediaUrl)` or equivalent focused resolver.
- `scheduleJob` accepts frozen action/media fields.

- [ ] Implement minimal media-aware rule/job mapping.
- [ ] Read active/resolved product id from CRM.
- [ ] Resolve product images through existing ERP `getProductImages()` and prefer `caracteristicas_generales`.
- [ ] Freeze media in the job at schedule time.
- [ ] Run scheduler/repository scoped tests to GREEN.

### Task 4: WhatsApp image execution

**Files:**
- Modify: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- Modify: `backend/src/automation/ActionExecutor.ts`
- Modify: `backend/src/automation/AutomationWorker.ts`
- Modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

**Interfaces:**
- `sendImageWithCaptionOnce(to, image, caption)` returns provider message id.
- Worker audit contains action/media/fallback metadata.

- [ ] Add Graph image-link payload test.
- [ ] Add WEBP conversion/upload test using injectable converter/preparer seam.
- [ ] Implement image send and media upload with safe diagnostics.
- [ ] Implement non-ambiguous text fallback and preserve ambiguous terminal behavior.
- [ ] Persist automation message metadata.
- [ ] Run scoped backend tests to GREEN.

### Task 5: Backend API

**Files:**
- Modify: `backend/src/server.ts`
- Modify: backend API tests covering automation rules.

- [ ] Write failing create/update tests for the three content types.
- [ ] Validate HTTPS custom URL and normalize action type.
- [ ] Pass action/media fields through repository create/update.
- [ ] Run API tests to GREEN.

### Task 6: Frontend tests first

**Files:**
- Modify: `src/features/automations/AutomationPage.test.tsx`
- Modify: `src/features/automations/automations.repository.test.ts`
- Modify: `src/features/whatsapp/WhatsAppInboxPage.test.tsx`

- [ ] Add failing tests for content selector, custom URL, preview, emojis, type labels, ADMIN editing and ASESOR read-only behavior.
- [ ] Add failing inbox test for pending follow-up content type.
- [ ] Run scoped Vitest and confirm RED.

### Task 7: Frontend implementation

**Files:**
- Modify: `src/features/automations/automations.types.ts`
- Modify: `src/features/automations/automations.repository.ts`
- Modify: `src/features/automations/AutomationPage.tsx`
- Modify: `src/features/automations/automations.css`
- Modify: `src/features/whatsapp/WhatsAppInboxPage.tsx`
- Modify: `src/features/whatsapp/whatsapp.css`

- [ ] Extend types/API payloads.
- [ ] Add selector and custom URL field.
- [ ] Add WhatsApp-style preview and emoji-safe caption rendering.
- [ ] Add content labels to rule/job cards and inbox follow-up chip.
- [ ] Keep ADMIN/ASESOR permissions unchanged.
- [ ] Run scoped tests to GREEN.

### Task 8: Verification and migration application

- [ ] Run backend scoped automation/media tests.
- [ ] Run backend build check.
- [ ] Run frontend automation/inbox tests.
- [ ] Run frontend typecheck/build.
- [ ] Apply migration `008_crm_automation_media.sql` to Supabase using migration tooling.
- [ ] Query schema/RPC signatures to verify applied state.
- [ ] Review diffs against spec and confirm no unrelated behavior changes.

# CRM Automation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent backend-only CRM follow-up engine that safely schedules, cancels and executes WhatsApp automations using the existing STECH backend, Supabase CRM repository and WhatsApp Cloud API sender.

**Architecture:** Scheduling is event-driven from persisted inbound messages; execution is performed by a leased polling worker. Supabase owns durable rules/jobs/execution records and transactional claims; the worker rechecks current CRM state immediately before sending and reuses `WhatsAppCloudApiClient` for delivery.

**Tech Stack:** Node.js 22, TypeScript strip-types runtime, Supabase/PostgreSQL REST/RPC, WhatsApp Cloud API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-25-crm-automation-engine-design.md`

## Global Constraints

- Backend first; do not rebuild frontend.
- No n8n execution path for this subsystem.
- Reuse existing WhatsApp sender, CRM persistence and CRM auth.
- Do not modify SPIN, RAG, ERP or recommendation authority.
- Persist Meta provider timestamp for WhatsApp-window decisions.
- Claim jobs transactionally with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Never blindly retry an ambiguous network send.

---

### Task 1: Domain contracts and policy tests

**Files:**
- Create: `backend/src/automation/types.ts`
- Create: `backend/src/automation/WhatsAppPolicy.ts`
- Test: `backend/tests/unit/automation-policy.test.ts`

**Interfaces:**
- Produces `AutomationRule`, `AutomationJob`, `AutomationJobStatus`, `AutomationEvent`, `AutomationRepository` and `WhatsAppWindowDecision` types.
- Produces `evaluateWhatsAppWindow(latestCustomerAt: string|null, now: Date, windowHours?: number)`.

- [ ] Write tests that assert 23h59m is allowed, >24h is rejected, and missing customer timestamp is rejected.
- [ ] Run the test and confirm it fails because `WhatsAppPolicy.ts` does not exist.
- [ ] Implement the minimal policy and domain types.
- [ ] Run the focused test and full unit suite.
- [ ] Commit `test/feat: add automation domain and WhatsApp policy`.

### Task 2: Scheduler and cancellation engine

**Files:**
- Create: `backend/src/automation/AutomationScheduler.ts`
- Test: `backend/tests/unit/automation-scheduler.test.ts`

**Interfaces:**
- Consumes `AutomationRepository`.
- Produces `AutomationScheduler.onCustomerMessage(input)` where input contains `sessionId`, `messageId`, `recipient`, `sourceSentAt`, `duplicate`.

- [ ] Write failing tests for cancelling old pending jobs, skipping duplicate inbound, and scheduling one job per active rule using provider timestamp.
- [ ] Run focused tests and confirm feature-missing failures.
- [ ] Implement scheduler with cancel-before-schedule semantics and repository idempotency responsibility.
- [ ] Run focused and full unit tests.
- [ ] Commit `feat: add CRM automation scheduler`.

### Task 3: Worker execution and pre-send revalidation

**Files:**
- Create: `backend/src/automation/AutomationWorker.ts`
- Create: `backend/src/automation/ActionExecutor.ts`
- Test: `backend/tests/unit/automation-worker.test.ts`

**Interfaces:**
- Consumes `AutomationRepository`, CRM state reader, and a WhatsApp sender exposing `sendText(to,text)`.
- Produces `AutomationWorker.runOnce()` and start/stop polling lifecycle.

- [ ] Write failing tests for non-BOT cancellation, newer customer reply cancellation, closed 24h window skip, successful send persistence, and ambiguous network failure becoming `AMBIGUOUS` without a second send.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement minimal executor and worker.
- [ ] Run focused and full unit tests.
- [ ] Commit `feat: add leased automation worker`.

### Task 4: Supabase persistence and SQL migration

**Files:**
- Create: `sql/supabase/migrations/004_crm_automation_engine.sql`
- Create: `backend/src/adapters/supabase/SupabaseAutomationRepository.ts`
- Test: `backend/tests/unit/supabase-automation-repository.test.ts`

**Interfaces:**
- Implements `AutomationRepository` using REST and RPC.
- SQL creates `crm_automation_rules`, `crm_automation_jobs`, `crm_automation_executions`, `crm_claim_due_automation_jobs`, and `crm_cancel_pending_automation_jobs`.

- [ ] Write failing repository contract tests around REST/RPC requests and returned job mapping.
- [ ] Run focused tests and confirm missing-adapter failure.
- [ ] Add idempotent migration with indexes, constraints, unique scheduling key, claim RPC using `FOR UPDATE SKIP LOCKED`, and cancel RPC.
- [ ] Implement repository adapter.
- [ ] Run focused/full unit tests and build check.
- [ ] Commit `feat: persist CRM automation rules and jobs`.

### Task 5: Preserve Meta timestamp and wire inbound scheduling

**Files:**
- Modify: `backend/src/ports/Crm.ts`
- Modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Test: `backend/tests/unit/whatsapp-inbound-processor.test.ts` or nearest existing WhatsApp processor test file.

**Interfaces:**
- `recordInbound` accepts `sourceSentAt?: string|null` and stores it in message metadata.
- `WhatsAppInboundProcessor` optionally receives an automation scheduler and invokes it after successful inbound persistence only for text messages.

- [ ] Write failing tests proving Meta timestamp is forwarded and duplicate inbound does not schedule.
- [ ] Run focused tests and confirm failure.
- [ ] Extend CRM port and Supabase persistence metadata.
- [ ] Wire scheduler after persistence without changing bot processing semantics.
- [ ] Run focused/full tests.
- [ ] Commit `feat: trigger automations from WhatsApp inbound`.

### Task 6: Cancel jobs on CRM mode changes

**Files:**
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/crm-automation-http.test.ts`

**Interfaces:**
- Mode-change handlers call automation cancellation only after a successful mode change away from BOT.

- [ ] Write failing integration tests for `take` and closed/waiting-compatible cancellation behavior exposed through an injected automation service.
- [ ] Run focused test and confirm failure.
- [ ] Add minimal mode-change cancellation hook without altering auth/version behavior.
- [ ] Run integration/full tests.
- [ ] Commit `feat: cancel follow-ups on CRM takeover`.

### Task 7: Bootstrap worker and authenticated rule API

**Files:**
- Modify: `backend/src/bootstrap.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/config/config.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/integration/crm-automation-http.test.ts`
- Test: `backend/tests/unit/config.test.ts`

**Interfaces:**
- Runtime exposes `automationRepository`, `automationScheduler`, `automationWorker` when Supabase CRM is configured.
- Authenticated endpoints: list/create/enable/disable rules and list jobs.
- Server starts/stops worker with backend lifecycle.

- [ ] Write failing config/API/lifecycle tests.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add config defaults: poll 5000ms, batch 20, lease 60s, WhatsApp window 24h.
- [ ] Wire repository/scheduler/worker and authenticated rule endpoints.
- [ ] Ensure `server.close()` stops worker before closing HTTP server.
- [ ] Run focused tests, `npm test`, and `npm run build`.
- [ ] Commit `feat: expose and run CRM automation engine`.

### Task 8: Regression and delivery verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] Run `npm test` from `backend`.
- [ ] Run `npm run build` from `backend`.
- [ ] Inspect diff to confirm no SPIN/RAG/ERP behavior changed.
- [ ] Open PR from `feat/crm-automation-engine` so existing `Backend QA` pull-request workflow runs.
- [ ] Inspect GitHub Actions test/build results and fix any failures before declaring completion.
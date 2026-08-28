# CRM Unanswered Follow-up V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule WhatsApp follow-ups only after the BOT has answered and the customer remains silent, while guaranteeing that the same automation rule never runs twice in the same conversation.

**Architecture:** Customer inbound only cancels pending follow-ups. After the existing BOT outbound is successfully sent and persisted, the automation scheduler creates due jobs using that BOT-send moment as the delay origin while keeping the latest customer message id as the reply guard. A database guard table/RPC enforces one `(rule_id, session_id)` execution lifetime-wide, including across restarts and concurrent workers.

**Tech Stack:** Node.js 22+, TypeScript strip-types runtime, Supabase/PostgreSQL, native fetch, WhatsApp Cloud API.

**Spec:** Approved in chat: unanswered means BOT already replied and customer did not answer; human takeover/close/customer reply cancels; same rule never repeats in one conversation.

## Global Constraints

- Preserve existing chatbot/SPIN/RAG/ERP behavior.
- No n8n for this automation subsystem.
- Automatic free-form sends remain subject to the real WhatsApp 24-hour customer-message window.
- At-most-once provider send behavior remains unchanged.
- Existing rules created under the first MVP must migrate to the new BOT-reply trigger semantics.

---

### Task 1: Scheduler semantics

**Files:**
- Modify: `backend/src/automation/types.ts`
- Modify: `backend/src/automation/AutomationScheduler.ts`
- Modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Test: automation scheduler/wiring tests under `backend/tests`

**Interfaces:**
- `onCustomerMessage(...)` cancels pending jobs only.
- `onBotMessage({sessionId, customerMessageId, recipient, botSentAt, attentionMode})` schedules active BOT-reply rules.

- [ ] Add failing tests proving inbound customer messages do not schedule and successful BOT replies do.
- [ ] Add failing test proving delay origin is BOT-send time while `basisMessageId` remains the customer message id.
- [ ] Implement minimal scheduler + WhatsApp wiring.
- [ ] Run automation-specific tests.

### Task 2: Never repeat the same rule in one conversation

**Files:**
- Create: `sql/supabase/migrations/005_crm_automation_rule_session_once.sql`
- Modify: `backend/src/adapters/supabase/SupabaseAutomationRepository.ts`
- Test: Supabase automation repository tests.

**Interfaces:**
- RPC `crm_schedule_automation_job_once(...)` returns zero or one job.
- Database guard is unique on `(rule_id, session_id)` and is prefilled from historical jobs so old sends also block repeats.

- [ ] Add failing repository test for RPC-based once-per-session scheduling.
- [ ] Write migration with guard table, backfill, secure RPC and service-role grants.
- [ ] Update repository to call RPC; conflict/no-row means already used.
- [ ] Run repository tests.

### Task 3: Rule trigger migration and full verification

**Files:**
- Migration from Task 2 also updates existing rule trigger type to `BOT_MESSAGE_SENT` and widens the event-type check safely.
- Modify relevant HTTP/API tests if they assert the old event type.

- [ ] Verify existing rules become BOT-reply rules without being recreated.
- [ ] Run all automation-related tests and backend build.
- [ ] Apply migration to Supabase and run a transaction/rollback smoke test for once-per-session guard.

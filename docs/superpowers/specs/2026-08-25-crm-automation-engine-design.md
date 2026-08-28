# CRM Automation Engine Design

## Objective

Implement a persistent backend-only commercial follow-up engine for WhatsApp CRM. Rules must survive browser closure and backend restarts, execute at-most-once under concurrency, cancel safely when customer or CRM state changes, and reuse the existing Supabase CRM persistence and `WhatsAppCloudApiClient` sender.

## Scope

Backend first. No frontend reconstruction. No n8n execution path for this subsystem. Do not modify SPIN, RAG, recommendation, ERP authority, or existing conversational behavior except for emitting automation events around already-persisted WhatsApp/CRM state changes.

## Authority

Base implementation line: `fix/crm-auth-401`.

Existing authorities reused:
- WhatsApp webhook parsing: `backend/src/adapters/whatsapp/WhatsAppWebhookAdapter.ts`
- inbound persistence/orchestration: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Graph sender: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- CRM persistence: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- CRM auth: `backend/src/adapters/supabase/SupabaseCrmAuth.ts`

## Architecture

The engine is event driven at scheduling time and polling/lease driven at execution time.

1. Customer inbound is persisted first.
2. The backend emits `CUSTOMER_MESSAGE_RECEIVED` after successful persistence.
3. The automation repository atomically cancels incompatible pending jobs for the session and schedules eligible follow-up jobs from active rules.
4. A backend worker periodically claims due jobs through a Supabase RPC implemented with `FOR UPDATE SKIP LOCKED`, marking jobs `PROCESSING` and assigning a lease.
5. Before delivery, the worker re-evaluates live CRM state. A job is cancelled/skipped if the customer replied after the job basis message, the conversation is not in BOT mode, the conversation is closed, the rule is inactive, or the WhatsApp customer-care window is closed.
6. Eligible jobs execute through the existing `WhatsAppCloudApiClient.sendText()`.
7. Successful sends are persisted to `crm_mensajes` as BOT automation messages and recorded in `crm_automation_executions`.
8. Ambiguous network failures are not blindly retried; the job enters `AMBIGUOUS` for manual/reconciliation handling.

## Persistent model

### `crm_automation_rules`
- `id uuid primary key`
- `name text not null`
- `event_type text not null`
- `delay_seconds integer not null check (delay_seconds >= 0)`
- `action_type text not null default 'SEND_TEXT'`
- `message_template text not null`
- `active boolean not null default true`
- `priority integer not null default 100`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `crm_automation_jobs`
- `id uuid primary key`
- `rule_id uuid references crm_automation_rules(id)`
- `session_id text not null`
- `event_type text not null`
- `basis_message_id text null`
- `recipient text not null`
- `execute_at timestamptz not null`
- `status text not null` in `PENDING|PROCESSING|SENT|CANCELLED|SKIPPED|FAILED|AMBIGUOUS`
- `cancel_reason text null`
- `attempt_count integer not null default 0`
- `lease_owner text null`
- `lease_until timestamptz null`
- `last_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique scheduling key: `(rule_id, session_id, basis_message_id)` where `basis_message_id` is not null, preventing duplicate jobs for the same inbound message/rule.

### `crm_automation_executions`
- `id uuid primary key`
- `job_id uuid references crm_automation_jobs(id)`
- `session_id text not null`
- `provider_message_id text null`
- `outcome text not null`
- `detail jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Unique execution key: `(job_id, outcome)` for terminal successful send auditing.

## RPCs

### `crm_claim_due_automation_jobs(worker_id text, batch_size integer, lease_seconds integer)`
Atomically selects due `PENDING` jobs plus expired `PROCESSING` leases, locks them with `FOR UPDATE SKIP LOCKED`, moves them to `PROCESSING`, increments `attempt_count`, assigns `lease_owner`/`lease_until`, and returns the claimed rows.

### `crm_cancel_pending_automation_jobs(session_id text, reason text)`
Moves `PENDING` jobs for the session to `CANCELLED` with the supplied reason.

## Event semantics

Initial event: `CUSTOMER_MESSAGE_RECEIVED`.

On a non-duplicate inbound WhatsApp text message:
- cancel existing `PENDING` follow-ups for the session with reason `CUSTOMER_REPLIED`;
- schedule all active `CUSTOMER_MESSAGE_RECEIVED` rules with `execute_at = source_sent_at + delay_seconds` (fallback `now()` only if provider timestamp is unavailable);
- use Meta's original webhook timestamp as `source_sent_at` and persist it in message metadata.

Mode changes away from BOT cancel pending jobs:
- `HUMANO` => `HUMAN_TAKEOVER`
- `ESPERANDO_ASESOR` => `WAITING_ADVISOR`
- `CERRADO` => `SESSION_CLOSED`

Returning to BOT does not resurrect cancelled jobs.

## WhatsApp policy

The automation engine sends free-form text only if the latest customer inbound source timestamp is within the active WhatsApp customer-care window. The first implementation uses 24 hours as the configured business rule. If outside the window, the job is `SKIPPED` with `WHATSAPP_WINDOW_CLOSED`; template-message support is out of scope for this iteration.

## Delivery semantics

- `2xx` with Graph message id => success.
- Explicit `4xx` non-429 => permanent failure (`FAILED`).
- Explicit `429`/`5xx` before a known provider acceptance can be retried only by the job-level retry policy.
- Transport/network failure after request dispatch is treated as `AMBIGUOUS`; do not blindly resend.
- A successful provider message is persisted via existing CRM persistence with automation metadata.

## Worker lifecycle

`AutomationWorker` is started from backend bootstrap/server lifecycle when Supabase CRM and WhatsApp are configured. Default poll interval: 5 seconds. Default batch size: 20. Default lease: 60 seconds. Worker stop is awaited during server close.

## API surface

Backend management endpoints are minimal and authenticated with existing CRM auth:
- `GET /api/automations/rules`
- `POST /api/automations/rules`
- `POST /api/automations/rules/:id/enable`
- `POST /api/automations/rules/:id/disable`
- `GET /api/automations/jobs?sessionId=...`

Frontend integration is explicitly deferred; these endpoints make the backend ready for the existing CRM UI later.

## Testing

Unit tests cover:
- customer reply cancels older pending jobs;
- duplicate inbound does not schedule a second job;
- due-job worker skips when mode is not BOT;
- due-job worker skips when a newer customer message exists;
- WhatsApp 24-hour policy;
- success records BOT message and execution;
- ambiguous send is terminal `AMBIGUOUS` without automatic resend;
- scheduler uses provider `source_sent_at` when present.

Integration tests cover authenticated rule CRUD, inbound scheduling wiring, and worker claim behavior through fake repositories.

## Non-goals

- No n8n workflow.
- No visual automation builder in this phase.
- No WhatsApp template-message sending outside the 24-hour window.
- No changes to SPIN, RAG, ERP or product authority.
- No automatic resurrection of cancelled jobs.
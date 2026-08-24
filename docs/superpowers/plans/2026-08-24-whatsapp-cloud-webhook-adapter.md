# WhatsApp Cloud Webhook Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WhatsApp Cloud API webhook verification and robust inbound/status reception to the existing STECH backend without creating a second backend or changing commercial behavior.

**Architecture:** Keep `node:http` and `createStechApp()` as the only HTTP server. Add an isolated WhatsApp adapter for Meta webhook parsing plus a reusable Cloud API client, wire configuration through the existing `AppConfig/bootstrap` path, and reuse existing trace redaction. Gate 1 acknowledges and identifies inbound events but does not yet invoke `HybridConversationEngine.processTurn()` automatically.

**Tech Stack:** Node.js >=22.16, TypeScript with `--experimental-strip-types`, `node:http`, native `fetch`, existing STECH adapters/tests.

**Spec:** `docs/superpowers/specs/2026-08-24-whatsapp-cloud-webhook-adapter-design.md`

## Global Constraints

- Do not create a new backend or HTTP framework.
- Preserve `/health`, `/api/chat`, `/api/sessions/:id` behavior.
- Do not duplicate Supabase clients or create DB tables/migrations for Gate 1.
- Do not connect inbound WhatsApp to commercial AI during Gate 1.
- Do not log access tokens, Authorization headers, full `.env`, full phone numbers, or giant raw payloads.
- Valid Meta verification must return the raw `hub.challenge` body, not JSON.
- POST webhook must tolerate status-only and non-message events.
- `.env` remains local; `.env.example` contains only blank/non-secret placeholders.

---

### Task 1: WhatsApp configuration contract

**Files:**
- Modify: `backend/src/config/config.ts`
- Modify: `backend/.env.example`
- Test: `backend/tests/unit/whatsapp-config.test.ts`

**Interfaces:**
- Produces `AppConfig.whatsappVerifyToken?: string`
- Produces `AppConfig.whatsappAccessToken?: string`
- Produces `AppConfig.whatsappPhoneNumberId?: string`
- Produces `AppConfig.whatsappAppId?: string`
- Produces `AppConfig.whatsappGraphApiVersion: string`

- [ ] Write a failing unit test that calls `loadConfig()` with WhatsApp environment values and verifies the five config properties, including default Graph API version `v25.0`.
- [ ] Run `node --experimental-strip-types --test tests/unit/whatsapp-config.test.ts`; expect FAIL because the properties do not exist.
- [ ] Add the five properties to `AppConfig` and `loadConfig()`.
- [ ] Add blank `WHATSAPP_*` entries to `.env.example`; never add a real access token.
- [ ] Re-run the unit test; expect PASS.

### Task 2: Robust WhatsApp webhook parser

**Files:**
- Create: `backend/src/adapters/whatsapp/WhatsAppWebhookAdapter.ts`
- Test: `backend/tests/unit/whatsapp-webhook-parser.test.ts`

**Interfaces:**
- Produces `parseWhatsAppWebhook(payload: unknown): WhatsAppWebhookParseResult`
- Produces `verifyWhatsAppWebhook(query: URLSearchParams, expectedToken: string | undefined): {ok:boolean; challenge?:string}`
- `WhatsAppWebhookParseResult` contains `messages`, `statuses`, and `eventCount`.

- [ ] Write failing tests for valid verification, invalid token, one text message, a status-only payload, missing arrays, and multiple `entry/changes` branches.
- [ ] Run parser tests; expect FAIL because adapter does not exist.
- [ ] Implement query verification with exact token comparison and no secret logging.
- [ ] Implement defensive iteration over `entry[]`, `changes[]`, `value.messages[]`, and `value.statuses[]` without direct `[0]` assumptions.
- [ ] Normalize text messages into provider/direction/waMessageId/waId/phoneNumberId/displayPhoneNumber/type/text/timestamp/contactName.
- [ ] Re-run parser tests; expect PASS.

### Task 3: Safe webhook routes in existing node:http app

**Files:**
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/whatsapp-webhook.test.ts`
- Regression: `backend/tests/integration/http-api.test.ts`

**Interfaces:**
- Adds `GET /webhooks/whatsapp`
- Adds `POST /webhooks/whatsapp`
- Keeps existing `send()` JSON helper unchanged for existing APIs.
- Adds a plain-text response helper used only where raw text is required.

- [ ] Write failing integration tests for GET valid -> `200` + exact body `12345`, GET invalid -> `403`, POST text -> `200`, POST status -> `200`, malformed JSON -> bounded client error, and existing HTTP API regression.
- [ ] Run the two integration test files; expect webhook tests to fail while legacy HTTP test remains green.
- [ ] Add `sendText()` without changing `send()` behavior.
- [ ] Route GET verification before the existing API routes.
- [ ] Route POST to `readJson()` + `parseWhatsAppWebhook()`, return `200` after envelope parsing, and do not invoke `runtime.engine.processTurn()` in Gate 1.
- [ ] Re-run integration tests; expect PASS.

### Task 4: Secure WhatsApp trace events

**Files:**
- Modify: `backend/src/shared/trace.ts`
- Test: `backend/tests/unit/whatsapp-trace-redaction.test.ts`

**Interfaces:**
- Trace event names: `WHATSAPP_VERIFY`, `WHATSAPP_INBOUND`, `WHATSAPP_STATUS`, `WHATSAPP_DUPLICATE`, `WHATSAPP_ERROR`.

- [ ] Write a failing test proving a WhatsApp trace never emits an access token, Authorization value, raw phone number, or full message body.
- [ ] Run the test; expect FAIL until WhatsApp events are supported/sanitized.
- [ ] Add WhatsApp event names to the trace sink allowlist while reusing existing sanitizer/redaction logic.
- [ ] Ensure webhook routing logs only bounded metadata (counts/type), not raw payload.
- [ ] Re-run trace test; expect PASS.

### Task 5: Reusable WhatsApp Cloud API client, not wired to chatbot yet

**Files:**
- Create: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- Modify: `backend/src/bootstrap.ts`
- Test: `backend/tests/unit/whatsapp-cloud-api-client.test.ts`

**Interfaces:**
- Produces `WhatsAppCloudApiClient.sendText(to: string, text: string): Promise<{messageId:string|null}>`
- Client URL: `https://graph.facebook.com/{version}/{phoneNumberId}/messages`
- Runtime exposes optional `whatsapp` client only when required config exists.

- [ ] Write failing tests with a fake fetcher that verify URL, POST body, Bearer header, success parsing, and bounded error text without leaking token.
- [ ] Run client test; expect FAIL because class does not exist.
- [ ] Implement client with native `fetch` and private config fields.
- [ ] Wire an optional instance through `bootstrap.ts`; do not call it from webhook Gate 1.
- [ ] Re-run client test; expect PASS.

### Task 6: Gate verification and regression pack

**Files:**
- Existing tests only.

- [ ] Run focused WhatsApp unit tests.
- [ ] Run `backend/tests/integration/whatsapp-webhook.test.ts` and `backend/tests/integration/http-api.test.ts` together.
- [ ] Run `npm run build`.
- [ ] Run `npm test` if focused tests/build are green; any unrelated existing failures must be reported separately rather than hidden.
- [ ] Confirm no source file contains a real WhatsApp access token.
- [ ] Report exact local commands for `npm start`, local GET challenge, public Cloudflare GET challenge, POST text fixture, and status fixture.

## Gate 1 acceptance

The feature is not declared complete until local execution proves:

```text
GET http://127.0.0.1:3000/webhooks/whatsapp?... -> 12345
GET https://whatsapp.artos.pe/webhooks/whatsapp?... -> 12345
POST message fixture -> HTTP 200
POST status fixture -> HTTP 200
legacy /health + /api/chat + /api/sessions remain working
```

Only after that may Gate 2 wire `wa_id -> sessionId`, `wamid -> messageId`, `text.body -> processTurn()`, persistence channel `whatsapp`, and automatic outbound response.

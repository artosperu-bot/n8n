# STECH Backend — Design v0.2

Date: 2026-08-20

## Goal
Build a standalone modular backend for the STECH AI Sales Agent that progressively takes deterministic conversation ownership away from n8n while retaining n8n as the event/automation integration layer.

## Approved architecture

Client/React/CLI -> HTTP API -> ConversationEngine -> deterministic resolvers -> adapters (SQL Server ERP, persistence, RAG, OpenAI) -> response. The engine emits domain events to n8n webhooks. Dynamic truth (price/stock/availability) comes only from ERP/SQL; Supabase can own persistent context/RAG when enabled; the LLM only interprets/writes from supplied evidence.

## Runtime strategy

The normal runtime is **real-first**:

- `STECH_PROFILE=real`
- `LLM_MODE=openai`
- `ERP_MODE=sqlserver`
- `N8N_MODE=n8n`
- `PERSISTENCE_MODE=memory` initially
- `RAG_MODE=disabled` until Supabase/RAG is connected

Fake adapters exist only behind `STECH_PROFILE=test` for deterministic unit/integration/smoke testing without credentials.

## Backend v0.2 scope

- Node 22 HTTP API with `POST /api/chat`, health and session endpoints.
- `ConversationEngine` with deterministic intent, budget, reference/product switch, NBA and state reduction modules.
- Direct SQL Server adapter using a pooled `mssql` connection and configurable stored procedures; no guessed ERP tables.
- OpenAI Responses API adapter for commercial wording from authoritative evidence.
- n8n `AutomationBus` via webhook, fail-soft by default and strict only when explicitly configured.
- Optional Supabase state/RAG adapters behind configuration.
- Test-only fake adapters.
- CLI chat tester and multi-turn smoke test.
- `node:test` unit/integration regression suite.
- `.env.example` containing placeholders only; secrets are runtime-only.

## Preserved contracts

- Explicit current intent outranks stale state/NBA.
- QUERY TARGET != ACTIVE PRODUCT != EXPLICIT PRODUCT SWITCH.
- BUDGET_CONSTRAINT, PRICE_OBJECTION and SPIN_CONTRIBUTION remain separate.
- UNKNOWN capabilities remain UNKNOWN.
- LLM never invents dynamic commercial truth.
- A functional PASS requires inspecting real response/state, not only execution success.
- No production n8n publish/activate/deactivate/unpublish action.

## n8n boundary

n8n remains the automation/integration layer through domain-event webhooks. Initial event families: `conversation.turn.completed`, `handoff.requested`, `purchase.intent`, `notification.requested`. With `N8N_STRICT=false`, a webhook failure must not erase an already processed/persisted turn.

## Migration strategy

1. Keep current production workflow unchanged.
2. Run the backend independently with real SQL/OpenAI/n8n adapters once runtime secrets and SP names are configured.
3. Execute shadow QA with identical messages through current n8n and backend.
4. Diff canonical state and actual response.
5. Transfer ownership module-by-module only after parity is demonstrated.

## Out of scope for this delivery

- React frontend.
- Publishing or mutating production n8n.
- Guessing SQL stored procedures/columns not evidenced by the ERP.
- Automatic Supabase schema migration.
- Claiming full n8n behavioral parity without shadow QA.

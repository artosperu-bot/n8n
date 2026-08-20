# STECH Backend — Design

Date: 2026-08-20

## Goal
Build a standalone modular backend for the STECH AI Sales Agent that progressively takes deterministic conversation ownership away from n8n while retaining n8n as an event/automation integration layer.

## Approved architecture

Client/React/CLI -> Fastify API -> ConversationEngine -> deterministic resolvers -> adapters (ERP, persistence, RAG, LLM) -> response. The engine emits non-blocking domain events to n8n webhooks. Dynamic truth (price/stock/availability) comes only from ERP/SQL; Supabase owns persistent conversation context/RAG when enabled; the LLM only interprets/writes from supplied evidence.

## Scope for v0.1 backend
- Dependency-free Node 22 TypeScript-strip HTTP API (Fastify can be added later without changing domain ports).
- POST /api/chat, health, session/debug endpoints.
- ConversationEngine with deterministic intent, budget, reference/product switch, NBA and state reduction modules.
- Fake adapters to run without any credentials.
- OpenAI Responses API adapter.
- SQL Server adapter using configurable stored procedure names rather than inventing STECH schema.
- Supabase state adapter with configurable table/column mapping.
- Supabase RAG adapter with configurable RPC.
- n8n AutomationBus using webhook POST and fail-soft behavior by default.
- CLI chat tester.
- Vitest unit and integration regression suite.
- .env.example and Spanish configuration/testing docs.

## Preserved contracts
- Explicit current intent outranks stale state/NBA.
- QUERY TARGET != ACTIVE PRODUCT != EXPLICIT PRODUCT SWITCH.
- BUDGET_CONSTRAINT, PRICE_OBJECTION and SPIN_CONTRIBUTION remain separate.
- UNKNOWN capabilities remain UNKNOWN.
- LLM never invents dynamic commercial truth.
- A functional PASS requires inspecting real response/state, not only execution success.
- No production n8n publish/activate/deactivate/unpublish action.

## n8n boundary
n8n remains mandatory as an integration option through domain-event webhooks. Initial event families: conversation.turn.completed, handoff.requested, purchase.intent, notification.requested. n8n webhook failure is logged and must not erase a successfully persisted conversation turn unless N8N_STRICT=true.

## Migration strategy
Fake-first -> real adapters one at a time -> shadow comparison with n8n -> transfer ownership module by module. The backend must not claim full behavioral parity with the inaccessible live workflow until shadow/regression evidence proves it.

## Out of scope for this delivery
- React frontend.
- Publishing or mutating production n8n.
- Guessing current SQL stored procedures/columns not evidenced by repo.
- Automatic migration of existing Supabase schema.
- Full P3 production certification.

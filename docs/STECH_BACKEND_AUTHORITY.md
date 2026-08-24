# STECH Backend Authority

Updated: 2026-08-23
Branch: `feat/stech-backend`

## Operational objective

The backend is prepared for isolated local CORE conversational QA. Production, production workflows, secrets, and real reservation execution remain untouched.

## Runtime flow

`HTTP → HybridConversationEngine → deterministic intent/reference/state authorities → SQL/RAG evidence → NBA → CommercialResponsePlan → guarded writer → atomic persistence → optional n8n event`

- SQL/ERP owns product identity, price, stock, images, and authorized operational reads.
- Product RAG owns documented specifications and product capabilities.
- Institutional RAG owns warranty, delivery, payment, store, returns, post-sale, and policies.
- Conversation state owns product focus, references, comparison, budget, interest, purchase, and reservation progression.
- `CommercialResponsePlan` owns only the finite communication mode after factual truth/NBA are already resolved. It cannot create facts, change product truth, or create a new NBA.
- The LLM assists semantic interpretation and wording; it is not factual authority.

## Commercial response composition authority

- `CommercialWriteContract` remains the bounded canonical writer input and continues to project the already-known customer/commercial context.
- `FullRagAnswerKernel` remains the immutable factual core for supported FULL RAG routes.
- `CommercialResponsePlan` selects one finite response mode: factual direct, SPIN discovery, contextual value/FAB, guided choice, objection handling, soft close, purchase progression, or handoff.
- Isolated factual FULL RAG answers may bypass the LLM entirely.
- Contextual FULL RAG answers may use the existing OpenAI writer through the already-existing `PLAN_DE_RESPUESTA` channel; no second writer or second memory was introduced.
- The plan instruction is written as bounded human guidance and does not expose raw internal NBA labels to the writer.
- The exact executable NBA remains the only commercial action authority.
- The immutable direct answer does not include a soft-close CTA; continuation is executed by the commercial/NBA layer, preventing duplicate questions.
- Fabricated scarcity, urgency, or social proof produced during FULL RAG composition is rejected and falls back to the immutable factual core.
- Writer/LLM failure continues to prefer deterministic grounded fallback over an ungrounded retry.
- No Supabase schema, SQL/RAG route, embedding, reservation, concurrency, or n8n production change is required by this composition layer.

## Current persistence contract

- `ia_conversaciones` is turn history and audit.
- `ia_contexto` is current operational state.
- `ia_sesiones` is session lifecycle and isolation.
- Canonical internal fields are the English `ConversationState` fields such as `activeProduct`, `queryTarget`, `lastIntent`, and `contextVersion`.
- Spanish nested objects such as `producto_activo`, `producto_objetivo_turno`, `cliente`, `venta`, and `conversacion` are compatibility mirrors.
- Read precedence is canonical field first, legacy mirror only when the canonical value is absent.
- Legacy mirrors are removed from the internal state after hydration and regenerated on write.
- The `ia_contexto.context_version` column is authoritative over a JSON copy.
- `spin_aporte` persists only canonical values: `SITUACION`, `PROBLEMA`, `IMPLICACION`, or `NECESIDAD_SOLUCION`.
- Atomic turn persistence remains the normal Supabase path.

## Closed behavioral contracts

- Trace: raw STECH event is sanitized once before console and JSONL; one event writes at most one JSONL row; non-STECH console calls are unchanged.
- Reservation ownership: a pending stage owns only compatible field input or an explicit reservation operation. Other valid intents return to the normal pipeline and preserve the pending stage unless the user explicitly abandons it.
- Budget: an explicit parsed budget remains deterministic authority over incompatible planner classifications.
- Recommendation: no differentiating evidence means no winner. Neutral alternatives and one useful criterion are allowed; catalog order is not authority and price is not a tie-breaker unless the customer expressed price/budget preference.
- Conditional interest: “si está disponible me interesa” records interest but does not confirm purchase or start reservation.
- Reference stress: a current second-product mention becomes the turn target and comparison candidate without silently switching the active product; later “los dos” resolves the stored pair.
- Unknown product: an unresolved model remains a query attempt, never a valid selection; later explicit known-product requests recover normally.
- Personal purchase: one unit begins local reservation data collection; two or more units use assisted handoff.

## Integration behavior

- Token telemetry writes are idempotent against `(message_id, nodo)` duplicates.
- Telemetry failure is fail-soft and observable.
- n8n delivery is secondary and fail-soft by default. HTTP 500 is an integration `YELLOW`, not a conversational `RED`.
- No n8n workflow was modified or published.
- Normal replies target roughly 150–450 characters; comparisons may use roughly 350–750 when evidence needs it.
- GPT-5 writer requests low verbosity without hard truncation.
- Planner context contains structured current state, the current message, and at most two recent complete turns. Legacy last-message mirrors are not duplicated into LLM context.

## Local QA artifacts

Each artifact-enabled run clears and recreates `backend/qa-results/latest/`:

- `summary.json`
- `failures.json`
- `trace.jsonl`
- `conversation-report.txt`

Historical run JSON and Markdown remain under `backend/qa-results/`. Artifacts are Git-ignored and redact secrets plus common personal identifiers. For server traces, set `STECH_TRACE_FILE` to the absolute `backend/qa-results/latest/trace.jsonl` path before starting the backend.

## Safety gates

- `dbo.sp_IA_RegistrarReserva24h_Idempotente` remains blocked.
- Do not infer its signature, execute a real reservation, or simulate success.
- SQL authority, price/stock normalization, RAG separation, reference contracts, switch/no-switch, concurrency, and production are unchanged.
- Supabase inspection for this recovery was read-only; no schema change was required.

## Validation policy

- Production changes follow RED → expected failure → minimal general fix → GREEN → adjacent regression → diff review.
- Technical tests and build run locally.
- Conversational QA runs locally through the HTTP boundary with isolated session/message IDs.
- CORE is the next suite. Golden100 is intentionally deferred.
- A failed optional integration is reported separately from conversational correctness.

# STECH Backend Authority

Updated: 2026-08-24
Branch: `feat/stech-backend`

## Operational objective

The backend is prepared for isolated local commercial conversational QA. Production, production workflows, secrets, and real reservation execution remain untouched.

## Runtime flow

`HTTP → HybridConversationEngine → deterministic intent/reference/state authorities → SQL/RAG evidence → SPIN readiness → executable N+1 → CommercialResponsePlan → guarded writer → atomic persistence → optional n8n event`

- SQL/ERP owns product identity, price, stock, images, and authorized operational reads.
- Product RAG owns documented specifications and product capabilities.
- Institutional RAG owns warranty, delivery, payment, store, returns, post-sale, and policies.
- Conversation state owns product focus, references, comparison, budget, interest, purchase, and reservation progression.
- SPIN readiness owns only which customer fact is already known and, when useful, which single discovery fact is missing next.
- N+1 owns the single executable continuation after the current request is answered. It may authorize one SPIN question while discovery is incomplete, or a different commercial action once context is sufficient; it may not authorize two independent continuations in one turn.
- `CommercialResponsePlan` owns only the finite communication mode after factual truth/N+1 are already resolved. It cannot create facts, change product truth, or create a new N+1.
- The LLM assists semantic interpretation and wording; it is not factual or purchase authority.

## SPIN and N+1 authority

- SPIN and N+1 are separate contracts.
- SPIN is flexible rather than a rigid questionnaire. It reuses facts the customer already supplied and asks at most one useful question per turn.
- When discovery is needed, the preferred progression is `SITUATION → PROBLEM → IMPLICATION → NEED_PAYOFF`, but already-declared needs may skip redundant intermediate questions.
- Generic budget discovery is not a SPIN stage. Budget is requested only when budget/objection handling makes it the exact decision-changing fact.
- Broad product information may answer briefly and then ask the one SPIN fact that is missing.
- Focused factual questions such as NFC, 5G, battery, weight, price, or stock do not create customer priorities/problems and do not restart discovery.
- A declarative customer statement such as “se me cae seguido”, “pierdo tiempo cuando pasa”, or “lo más importante es que aguante golpes” is treated as discovery context, not as a new technical query.
- Interest is not purchase. Planner semantics cannot start reservation unless current deterministic purchase evidence is present.
- The current message outranks stale comparison history: a new use case or explicit budget recommendation can move the turn out of comparison mode.
- Neutral `OTHER` turns cannot write planner-created SPIN memory unless the conversation is explicitly answering a pending SPIN question.
- Once grounded fit is sufficient, N+1 may progress to recommendation/comparison/availability/closing according to capability and state. A soft close is one brief availability question, not a bundle of stock + reservation + payment + color + shipping CTAs.

## Commercial response composition authority

- `CommercialWriteContract` remains the bounded canonical writer input and continues to project the already-known customer/commercial context.
- `FullRagAnswerKernel` remains the immutable factual core for supported FULL RAG routes.
- `CommercialResponsePlan` selects one finite response mode: factual direct, SPIN discovery, contextual value/FAB, guided choice, objection handling, soft close, purchase progression, or handoff.
- Isolated factual FULL RAG answers may bypass the LLM entirely.
- Contextual FULL RAG answers may use the existing OpenAI writer through the already-existing `PLAN_DE_RESPUESTA` channel; no second writer or second memory was introduced.
- The plan instruction is written as bounded human guidance and does not expose raw internal NBA labels to the writer.
- The exact executable N+1 remains the only commercial action authority.
- The immutable direct answer does not include a soft-close CTA; continuation is executed by the commercial/N+1 layer, preventing duplicate questions.
- Fabricated scarcity, urgency, social proof, unsupported trade-offs, or unsupported operational promises are rejected or routed back to grounded fallback.
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
- Persistence validity is semantic as well as structural: correct row counts/context version do not certify a session if factual questions polluted priorities/SPIN or interest was persisted as purchase.
- Atomic turn persistence remains the normal Supabase path.

## Closed behavioral contracts

- Trace: raw STECH event is sanitized once before console and JSONL; one event writes at most one JSONL row; non-STECH console calls are unchanged.
- Reservation ownership: a pending stage owns only compatible field input or an explicit reservation operation. Other valid intents return to the normal pipeline and preserve the pending stage unless the user explicitly abandons it.
- Budget: an explicit parsed budget remains deterministic authority over incompatible planner classifications.
- Recommendation: no differentiating evidence means no winner. Neutral alternatives and one useful criterion are allowed; catalog order is not authority and price is not a tie-breaker unless the customer expressed price/budget preference.
- Conditional interest: “si está disponible me interesa” records interest but does not confirm purchase or start reservation.
- Reference stress: a current second-product mention becomes the turn target and comparison candidate without silently switching the active product; later “los dos” resolves the stored pair.
- Unknown product: an unresolved model remains a query attempt, never a valid selection; later explicit known-product requests recover normally.
- Personal purchase: one unit begins local reservation data collection only after explicit purchase authority; two or more units use assisted handoff.

## Integration behavior

- Token telemetry writes are idempotent against `(message_id, nodo)` duplicates.
- Telemetry failure is fail-soft and observable.
- n8n delivery is secondary and fail-soft by default. HTTP 500 is an integration `YELLOW`, not a conversational `RED`.
- No n8n workflow was modified or published.
- Normal replies target roughly 150–450 characters; comparisons may use roughly 350–750 when evidence needs it.
- GPT-5 writer requests low verbosity without hard truncation.
- Planner context contains structured current state, the current message, and at most two recent complete turns. Legacy last-message mirrors are not duplicated into LLM context.

## Local QA artifacts

Each artifact-enabled run clears and recreates its `latest/` directory under `backend/qa-results/` and may emit:

- `summary.json`
- `failures.json`
- `trace.jsonl`
- `conversation-report.txt`
- suite-specific semantic/persistence summaries

Historical run JSON and Markdown remain under `backend/qa-results/`. Artifacts are Git-ignored and redact secrets plus common personal identifiers. For server traces, set `STECH_TRACE_FILE` to the absolute trace path before starting the backend.

## Safety gates

- `dbo.sp_IA_RegistrarReserva24h_Idempotente` remains blocked.
- Do not infer its signature, execute a real reservation, or simulate success.
- SQL authority, price/stock normalization, RAG separation, reference contracts, switch/no-switch, concurrency, and production are unchanged.
- Supabase inspection for conversational QA is read-only; no schema change is required.

## Validation policy

- Production changes follow RED → expected failure → minimal general fix → GREEN → adjacent regression → diff review.
- Technical tests and build run locally.
- Conversational QA runs locally through the HTTP boundary with isolated session/message IDs; GitHub Actions is not a conversational acceptance environment.
- `qa:commercial-smoke` is the first commercial gate and must certify response behavior plus semantic state in `ia_conversaciones`/`ia_contexto`.
- Only after the smoke is clean should `qa:commercial50` be used for the broader multi-turn matrix.
- FULL RAG suites remain separate retrieval/factual gates and are not substitutes for commercial conversational QA.
- A failed optional integration is reported separately from conversational correctness.

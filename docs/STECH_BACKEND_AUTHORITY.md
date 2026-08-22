# STECH Backend Authority

Updated: 2026-08-21
Branch: `feat/stech-backend`

## Objective

Leave the STECH conversational sales backend correct, useful, observable, regression-protected, and ready for local conversational certification without touching production.

## Current architecture

`HTTP → HybridConversationEngine → deterministic intent/reference/state authorities → SQL/RAG evidence → NBA → guarded writer → atomic conversation/state persistence → optional n8n events`

- Node.js backend owns current conversational decisions and compact state.
- SQL Server/ERP supplies catalog identity, price, stock, images, and authorized operational reads.
- Supabase persists sessions, turns, compact context, RAG, telemetry, and concurrency state.
- LLM interprets and writes; it is never factual authority.

## Data authorities

- SQL/ERP: commercial product identity, price, stock.
- Product RAG: specifications and documented product capabilities.
- Institutional RAG: warranty, delivery, payment, store, returns, post-sale, policies.
- Conversation state: active/selected/recommended product, intent context, references, comparison and purchase progression.
- LLM: classification assistance and natural commercial language only.

## Invariants

- Deterministic authority beats contradictory LLM output.
- Price/stock cannot originate from memory, RAG, LLM, history, or hardcoded values.
- Product and institutional RAG never cross domains.
- Product focus changes only through an authorized recommendation focus or explicit customer selection/switch.
- A reservation is never confirmed before the authorized idempotent operation succeeds.
- `STECH_TRACE_FILE` is UTF-8 JSONL, append-only, fail-soft, one row maximum per event, and contains no messages, PII, credentials, or secrets.
- Production, production workflows, secrets, and real data are immutable during this work.

## Closed/frozen dimensions

- P0 concurrency and atomic persistence fencing.
- SQL authority and price/stock normalization.
- Product/institutional RAG separation and exact institutional subcategory fallback.
- Reference resolution, comparison pair, explicit switch/no-switch, and recommendation focus alignment covered by current regressions.
- Personal one-unit purchase enters data collection; two or more units use assisted handoff.
- Trace privacy/uniqueness root closed in code by `207c014`; targeted tests 6/6 PASS.
- Reservation turn ownership closed in code: only compatible field data or explicit reservation operations own the turn; interruptions preserve pending state and abandonment clears local capture without claiming external cancellation.
- Deterministic budget authority closed in code: explicit parsed budget remains primary over incompatible semantic planner intents while compatible capability criteria remain available.

Do not reopen a closed dimension without fresh contradictory evidence.

## Open issues, ordered

1. P1 recommendation sufficiency: zero-evidence/tied candidates can become an arbitrary first-row winner.
2. P1 conditional stock interest: current behavior must be reproduced before any implementation.
3. External gate: exact signature and result contract for `dbo.sp_IA_RegistrarReserva24h_Idempotente` are not confirmed; execution remains blocked.
4. Live conversational certification remains pending after code fixes.

## Latest verified evidence

- Baseline HEAD before remediation: `0018bc6`.
- Baseline technical suite: 236/236 PASS.
- Baseline build: PASS.
- Supabase project `iipamvqbipbolchlozoj` inspected read-only; no schema change is required for current roots.
- Trace RED reproduced unsafe console output, credential leakage, and duplicate append.
- Trace GREEN: `trace-writer` plus adjacent metadata tests 6/6 PASS.
- Reservation RED reproduced warranty/human/switch/abandonment capture before intent.
- Reservation GREEN: ownership, switch, abandonment, document, name and address plus adjacent suites 22/22 PASS.
- Budget RED reproduced active-product `CAPABILITY` override; GREEN plus adjacent authority suites 33/33 PASS.
- Production/Supabase mutations: none.
- Preexisting untracked `backend/package-lock.json`: preserved and excluded.

## QA rules

- Each production change follows RED → expected failure → minimal general fix → GREEN → adjacent regression → diff review.
- Tests protect authority, state, factuality, progression, safety, fallback, observability, or integration contracts.
- Technical QA runs locally in the repository.
- Conversational/Golden100 QA runs locally, never through GitHub Actions.
- Live QA uses isolated session/message IDs and safe JSONL tracing.
- PASS requires persisted final response/state, not internal flags alone.

## Definition of Done

- Full technical suite and build pass after all root fixes.
- Authorities and closed reference/state contracts remain preserved.
- Reservation interruptions and cancellation are safe.
- Budget cannot be degraded by semantic planner output.
- No arbitrary recommendation winner without differentiating evidence.
- Conditional interest is useful without false purchase/reservation.
- Trace privacy and uniqueness remain green.
- Local conversational QA runner and command are ready.
- Real reservation execution stays explicitly blocked until its authoritative SQL contract is available.
- Production remains untouched and diff is reviewed.

## NEXT ACTION

Write and run no-winner RED regressions for zero-evidence/tied recommendation candidates.

# STECH Ventas Consultivas

> **CURRENT STATUS — 2026-08-17**
>
> - **P0 — Concurrency:** CLOSED / FROZEN
> - **P1 — Product/context foundation:** FOUNDATION CLOSED
> - **P2.1 — Conversational/commercial correctness:** FUNCTIONALLY CLOSED
> - **P3 — Commercial QA / readiness:** FUNCTIONALLY READY WITH NON-BLOCKING WEAKNESSES
> - **Current QA draft:** `feebd18e-7147-48c7-8d81-bf7af325aaf6`
> - **Production active version:** `ff0135de-a3ed-4757-83a1-80794b78bb2f` (unchanged)
> - **30-case matrix:** 21 PASS / 9 WEAK / 0 overall FAIL
> - **Production publication:** NO
> - **Production readiness:** NOT READY — credential/tunnel/execution-log security blockers
> - **Next:** operator provisions scoped SQL-bridge credentials and stable endpoint, then security smoke test and promotion review

## Purpose

This repository is the durable engineering memory for the **STECH / S&T Store AI Sales Agent**. It must preserve architecture, contracts, fixes, QA evidence, incidents, security findings, workflow metadata and the exact continuation point of the project.

The goal is not merely that n8n executes successfully. A customer-facing turn is only healthy when it is technically correct, contextually correct, commercially useful, coherent, produces an appropriate N+1 / next-best-action, and the **actual persisted response** is correct.

## Runtime architecture

- **n8n** — orchestration, deterministic routing, conversation flow, SQL/RAG integration, state reduction and final output.
- **SQL Server / ERP** — dynamic commercial truth such as product lookup, price, stock, availability and order/customer operational data.
- **Supabase / PostgreSQL** — session state, context, persistence, concurrency primitives, capability records, RAG documents and QA state.
- **RAG** — product documentation, policies and other non-dynamic evidence.
- **LLM** — interpretation and conversational/commercial wording; never authoritative for dynamic price, stock or unsupported product capabilities.

## Production workflow

- Name: `STECH Ventas Consultivas`
- Workflow ID: `c661Gw0xoqZBsNtf`
- Historical baseline: `V45.68`
- Historical baseline version ID: `dd01b10a-60e6-4412-903b-b21c7f3e577a`
- Hardened P0 production line: `V45.70`

## Engineering rule

### NO ARREGLAR A ROMPIENDO B

Required sequence:

`FAIL → reproduce → first broken boundary → first responsible owner → exact root cause → smallest general fix → fresh regression → adjacent regression → close`

Forbidden:

- speculative fixes;
- phrase-specific patches;
- broad refactors for local failures;
- changing frozen modules without evidence;
- declaring PASS from internal flags alone;
- publishing unverified QA work to production.

## Frozen / protected areas

- P0 concurrency is closed and frozen unless an actual P0 regression is demonstrated.
- `06B Rehidratar Contexto Comparación` is frozen absent demonstrated regression.
- Recommendation authority belongs to `17A`.
- Capability truth belongs to `17B` and uses `SUPPORTED / NOT_SUPPORTED / UNKNOWN`.
- `UNKNOWN` must never be collapsed to false.
- Current explicit user intent outranks stale historical context or stale N+1.

## Current P2.1 blocker

Historical T6 showed that `17 Validar y Reducir Estado` could correctly build a price answer and later replace it with a stale comparison answer because historical `COMPARAR` survived. The destructive writer is confirmed; the upstream origin of the stale comparison is **not yet proven**.

A first node-17-only draft exists. A separate earlier comparison block inside node 17 remains an **UNVERIFIED risk** and must only be edited if fresh T6 demonstrates that it is still destructive.

Execution `3777` was initiated in fresh session `P2_1_FASTTRACK_T6_20260816_2312`, but its canonical output/state has not yet been recovered sufficiently to certify T6. Therefore T6 is not PASS, P2.1 is not closed, and P3 has not formally started.

## Project map

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Current state: [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)
- Data authority: [`docs/DATA_AUTHORITY.md`](docs/DATA_AUTHORITY.md)
- Commercial contract: [`docs/COMMERCIAL_CONTRACT.md`](docs/COMMERCIAL_CONTRACT.md)
- QA strategy: [`docs/QA_STRATEGY.md`](docs/QA_STRATEGY.md)
- Security: [`docs/SECURITY.md`](docs/SECURITY.md)
- Runbook: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Engineering changelog: [`docs/CHANGELOG_ENGINEERING.md`](docs/CHANGELOG_ENGINEERING.md)
- Architecture decisions: [`docs/decisions/`](docs/decisions/)
- QA evidence: [`qa/evidence/`](qa/evidence/)
- Regression contracts: [`qa/regression/`](qa/regression/)
- Workflow metadata/snapshots: [`workflows/`](workflows/)
- Historical P0 evidence: existing `docs/status-P0-2026-08-12.md`, `docs/qa/`, `docs/test-results/`, `tests/concurrency/` and `sql/supabase/`.

## Security

**GitHub must contain no production secrets.** Never commit `.env`, raw n8n credentials, Supabase service-role keys, Authorization headers, OpenAI keys, SQL passwords, Cloudflare tokens, raw cookies/session tokens, personal customer data or execution dumps containing credentials.

Quick Cloudflare Tunnel hostnames are temporary infrastructure and are not production-grade configuration. DNS/endpoint failures must be classified as infrastructure before chatbot logic is changed.

## Continuation rule

A new senior engineer or AI agent should be able to continue from this repository without reconstructing the entire chat history. Preserve confirmed evidence, explicitly label historical/observed/unverified/deferred claims, and never turn a hypothesis into project truth.

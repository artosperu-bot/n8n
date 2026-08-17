# RUNBOOK — STECH Ventas Consultivas

## 1. Before changing anything

Confirm:

- repository: `artosperu-bot/n8n`;
- branch: `p0-concurrency-hardening`;
- workflow ID: `c661Gw0xoqZBsNtf`;
- P0: CLOSED / FROZEN;
- P2.1: FUNCTIONALLY CLOSED;
- P3 QA candidate: `feebd18e-7147-48c7-8d81-bf7af325aaf6`;
- production active version: `ff0135de-a3ed-4757-83a1-80794b78bb2f`;
- production publication: NO;
- production readiness: NOT READY because SQL-bridge credential/tunnel and execution-inspection security work requires an authorized operator.

Read `CURRENT_STATE.md`, `ROADMAP.md`, `QA_STRATEGY.md`, `COMMERCIAL_CONTRACT.md`, `SECURITY.md`, `P3_SECURITY_MIGRATION_DESIGN.md`, and the latest P3 evidence before editing.

## 2. Current continuation sequence

1. Do not publish the P3 draft.
2. Operator provisions separate QA and production SQL-bridge credentials.
3. Operator provisions a named stable tunnel/endpoint and per-environment non-secret base URL.
4. Apply the four-node QA credential/URL migration described in `P3_SECURITY_MIGRATION_DESIGN.md`.
5. Run unauthorized, timeout, catalog, product SQL, image SQL, purchase and reservation smoke tests.
6. Confirm routine execution inspection no longer exposes Authorization material.
7. Re-run `qa/regression/P3_CERTIFICATION_20260817.md` on the security-migrated candidate.
8. Address only blocking regressions; keep the nine commercial WEAK items on the roadmap.
9. Request explicit promotion review.
10. Publish only after approval; retain the previous active version for rollback.

## 3. Root-cause procedure

For every failure:

`FAIL → reproduce → first broken boundary → first responsible owner → exact root cause → smallest general fix → fresh regression → adjacent regression → close`

Never patch multiple nodes merely because they are nearby in the flow.

## 4. SQL bridge troubleshooting

Flow:

`09 Ejecutar SQL → external SQL bridge → stored procedure`

Example stored procedure: `sp_BuscarProductosVenta`.

If DNS/endpoint resolution fails (`ENOTFOUND` or equivalent):

1. classify as infrastructure;
2. validate the configured bridge endpoint;
3. validate tunnel/service reachability;
4. validate bridge authentication without exposing credentials;
5. retry SQL transport;
6. only when transport is healthy inspect stored-procedure/product logic.

Do not patch RAG or commercial nodes for an infrastructure outage.

## 5. Stateful QA discipline

- Use fresh sessions for certification.
- Preserve session_id, message_id, request_id and execution_id.
- Capture the user message and actual persisted assistant response.
- Capture active product, comparison refs, recommendation, criterion, pending state, price/stock flags, availability, purchaseReady and NBA.
- Mark uncertain observations as UNVERIFIED.

## 6. Production protection

Do not publish the current T6 draft until the fresh closure path has passed and publication is explicitly authorized.

Do not reopen P0 for P2 commercial bugs unless a concurrency regression is demonstrated.

## 7. Security before commit/export

Sanitize workflow metadata/snapshots and remove:

- Authorization headers;
- API keys;
- service-role keys;
- SQL bridge secrets;
- Cloudflare credentials;
- OpenAI keys;
- webhook secrets;
- credential values/IDs where security-sensitive;
- PII.

Never commit a raw execution dump for convenience.

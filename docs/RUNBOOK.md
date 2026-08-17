# RUNBOOK — STECH Ventas Consultivas

## 1. Before changing anything

Confirm:

- repository: `artosperu-bot/n8n`;
- branch: `p0-concurrency-hardening`;
- production workflow ID: `c661Gw0xoqZBsNtf`;
- current P0 status: CLOSED / FROZEN;
- current P2.1 status: ACTIVE / NOT CLOSED;
- current QA draft: `6a20e2c8-7905-402d-8345-1f763bd4b688`;
- production publication of current T6 fix: NO.

Read `CURRENT_STATE.md`, `ROADMAP.md`, `QA_STRATEGY.md`, `COMMERCIAL_CONTRACT.md` and relevant evidence before editing workflow behavior.

## 2. Current continuation sequence

1. Recover canonical output/state for fresh execution `3777` in session `P2_1_FASTTRACK_T6_20260816_2312`.
2. Determine whether fresh T6 actually passes current-intent priority.
3. Inspect the real persisted assistant response, not only internal flags.
4. If the earlier node17 comparison block is proven destructive, apply the smallest node17-only fix.
5. If it is not proven destructive, do not edit it.
6. Rerun fresh T6 after any functional edit.
7. Continue to R7 stock/availability.
8. Continue to R8 purchase.
9. Continue to R9 warranty.
10. Run negative confirmation.
11. Verify no third-product contamination.
12. Close P2.1 only when all closure dimensions pass.
13. Only then formally start P3.

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

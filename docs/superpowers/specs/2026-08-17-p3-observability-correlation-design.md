# P3 QA observability correlation design

## Objective

Correlate a persisted commercial turn with its n8n execution without enlarging logs or persisting sensitive transport data.

## Selected approach

Node 23 already builds the atomic conversation snapshot and can read `$execution.id`. Before serializing the existing payload it will add a compact `observabilidad` object to canonical context with:
- session, message, request, and execution IDs;
- canonical actions;
- active/recommended product IDs and comparison references;
- pending question/action types;
- current price/stock evidence and purchase-ready boolean;
- selected NBA summary;
- compact authority names for resolution, decision, capability truth, and persistence.

The object is stored only inside the already-persisted context snapshot. No schema or RPC change is required.

## Limits

The payload records the persistence owner and attempt correlation, not a post-commit outcome, because the snapshot is created before the RPC returns. Final outcome still requires the n8n execution or database readback. P3 observability therefore remains PARTIAL, but execution correlation becomes direct.

## Safety

No headers, URLs, credentials, prompts, raw node outputs, customer documents, or transport objects are copied. Production remains unpublished.

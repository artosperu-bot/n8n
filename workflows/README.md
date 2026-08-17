# Workflows — sanitized engineering snapshots

This directory stores safe workflow metadata and sanitized snapshots used for engineering continuity.

## Rules

- Production runtime remains n8n; GitHub is engineering memory and versioned evidence.
- Never commit raw credentials, Authorization headers, API keys, service-role keys, SQL bridge secrets, Cloudflare tokens, OpenAI keys, webhook secrets, cookies/session tokens or customer PII.
- Prefer sanitized metadata when a full workflow export cannot be proven safe.
- A snapshot must state workflow/draft identity, relationship to production/QA, relevant node names, changed nodes, reason, QA status and production publication status.
- An unverified draft must never be described as production or PASS.

## Current indexed artifacts

- `snapshots/production-current-metadata.md` — safe metadata for the main production workflow.
- `qa/P2.1-QA-parent-7fdfb2e4-f777-44ed-9cd6-74eca1f5119a.md` — P2.1 QA parent metadata.
- `qa/P2.1-T6-draft-6a20e2c8-7905-402d-8345-1f763bd4b688.md` — current T6 draft metadata.

Existing historical workflow files in this repository remain evidence and should not be silently rewritten.

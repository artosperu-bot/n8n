# Security

Security documentation for STECH Ventas Consultivas.

## Critical principle

Repository completeness never justifies committing live credentials or customer data.

Read:

- `../docs/SECURITY.md` — architecture/security findings and remediation.
- `credential-redaction-checklist.md` — mandatory pre-commit/export checklist.

## Known engineering concerns

- Authentication material has appeared in execution/workflow observability contexts; treat proven exposure as CRITICAL and rotate/revoke affected credentials.
- Quick Cloudflare Tunnel endpoints are temporary infrastructure and must not be treated as stable production configuration.
- DNS/`ENOTFOUND` SQL bridge failures are infrastructure failures first; do not patch chatbot logic to compensate.

## Repository rule

Only sanitized evidence and metadata belong here. Raw execution dumps, workflow exports with credential material, `.env`, service-role keys, Authorization headers, SQL passwords, API keys, Cloudflare tokens, cookies and PII are prohibited.

# SECURITY — STECH Ventas Consultivas

## Severity

A known security finding exists: workflow/execution observability has exposed authentication/credential material in debug/inspection contexts.

**Classification: CRITICAL**

Do not copy any exposed value into this repository.

## Mandatory remediation

- rotate/revoke any credential proven exposed;
- migrate hardcoded secrets to n8n credentials, environment variables or controlled configuration;
- redact Authorization material from debug/execution outputs;
- audit Supabase service-role exposure;
- audit SQL bridge authentication;
- audit QA/production separation;
- audit execution retention;
- audit PII logging;
- ensure sanitized workflow exports contain no active credentials.

## SQL bridge / Cloudflare tunnel risk

`09 Ejecutar SQL → external SQL bridge → stored procedure`

The SQL bridge has depended on Quick Cloudflare Tunnel endpoints. Quick Tunnel hostnames are ephemeral and are not production-grade configuration.

Known infrastructure error classification:

`SQL_BRIDGE_ENDPOINT_EXPIRED_OR_UNREACHABLE`

A previous occurrence produced DNS resolution / `ENOTFOUND` behavior.

### Rule

Do not confuse transport/infrastructure failure with chatbot logic failure.

If SQL bridge DNS/endpoint resolution fails:

1. classify infrastructure first;
2. restore/validate transport and configuration;
3. only then evaluate SQL resolution or chatbot logic;
4. do not patch RAG/product/conversation logic to compensate for an unreachable SQL bridge.

Recommended future architecture: move SQL bridge endpoint/configuration out of hardcoded workflow expressions into controlled environment/credential/configuration. Do not make that production change automatically without authorization and regression.

## Absolutely prohibited in Git

- `.env` values;
- raw n8n credentials;
- Supabase service-role keys;
- API Authorization headers;
- OpenAI API keys;
- SQL passwords;
- Cloudflare tokens;
- webhook secrets;
- raw cookies/session tokens;
- personal customer data;
- raw execution dumps containing secrets;
- unsanitized workflow exports.

## Secret scan

Before committing or promoting content, inspect staged/changed files for actual credential values around terms such as:

- `Bearer`
- `Authorization`
- `apikey`
- `api_key`
- `service_role`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `password`
- `passwd`
- `secret`
- `token`
- `credential`

Documentation may legitimately contain these words. The security check is for actual sensitive values, not the vocabulary itself.

If a secret was historically committed, deleting it from the latest tree does not resolve the exposure. Credential rotation and Git history remediation may be required.

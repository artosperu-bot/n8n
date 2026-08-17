# Credential redaction checklist

Run this checklist before committing workflow snapshots, QA evidence, logs or operational documentation.

- [ ] No `.env` values.
- [ ] No raw n8n credentials.
- [ ] No `Authorization: Bearer <value>` material.
- [ ] No API keys or tokens.
- [ ] No Supabase anon/service-role secret values.
- [ ] No OpenAI API keys.
- [ ] No SQL usernames/passwords or connection secrets.
- [ ] No SQL bridge authentication secrets.
- [ ] No Cloudflare tokens/credentials.
- [ ] No webhook secrets.
- [ ] No raw cookies or session tokens.
- [ ] No credential IDs where their disclosure is security-sensitive.
- [ ] No personal customer data or PII.
- [ ] No raw execution dump containing hidden credential material.
- [ ] Any workflow export has been manually reviewed after automated redaction.
- [ ] Documentation terms such as `Authorization`, `token`, `password` or `service_role` were inspected for actual values rather than blindly treated as leaks.
- [ ] If historical exposure is known, credential rotation/history remediation is tracked separately; deleting the current copy alone is not considered remediation.

## Suggested search terms

Search changed/staged content for: `Bearer`, `Authorization`, `apikey`, `api_key`, `service_role`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `password`, `passwd`, `secret`, `token`, `credential`, `trycloudflare`.

Never paste a discovered secret into an issue, commit message, QA report or chat response.

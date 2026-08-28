# CRM Automation Multi-Image + Safe Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every active product image in order for automatic follow-ups, preserve successful WhatsApp sends as SENT even if audit persistence fails, allow admins to safely delete automation rules without losing history, and render automation media in the CRM Inbox.

**Architecture:** Keep the existing rule/job/worker architecture and extend the immutable job snapshot with an ordered `mediaUrls` list while retaining `mediaUrl` for backward compatibility. Provider acceptance is authoritative for delivery status: once WhatsApp returns a message id, the job must finish as SENT; audit failures become warnings only. Rule deletion is a soft delete (`deleted_at`) plus cancellation of pending jobs, preserving jobs/executions. Frontend reads media metadata already attached to CRM messages and renders the sent images.

**Tech Stack:** Node.js 22+, TypeScript, native fetch, WhatsApp Cloud API, Supabase/PostgreSQL, SQL Bridge/SQL Server, React 19, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-crm-automation-multi-image-delete-design.md`

## Global Constraints

- Preserve existing `SEND_TEXT`, `SEND_IMAGE_PRODUCT_AUTO`, and `SEND_IMAGE_CUSTOM_URL` behavior.
- Automatic media must use every valid active image returned for the resolved product, preserve ERP order, de-duplicate URLs, and cap at 20 images.
- Keep `mediaUrl` as the first/primary image for backward compatibility; add `mediaUrls` as the ordered snapshot.
- Existing scheduled jobs keep their original snapshot after rule edits or image changes.
- First-image preparation/provider rejection may fall back to text; ambiguous first-image network result remains AMBIGUOUS and must not send fallback text.
- After at least one provider-accepted image, failures on later images must not trigger duplicate retries; finish SENT with warning metadata.
- Once WhatsApp has returned a provider message id, post-send audit failures must never convert the job to FAILED.
- Rule deletion is ADMIN-only, soft deletes the rule, cancels PENDING jobs for that rule, and preserves historical jobs/executions.
- Inbox should display automation images from message metadata when present and remain compatible with old messages that only contain text or one media URL.
- No new n8n workflow.
- Use additive Supabase migration only.

---

### Task 1: Extend immutable media snapshots and safe-delete persistence

**Files:**
- Modify: `backend/src/automation/types.ts`
- Modify: `backend/src/adapters/supabase/SupabaseAutomationRepository.ts`
- Create: `sql/supabase/migrations/012_crm_automation_multi_image_safe_delete.sql`
- Test: `backend/tests/unit/automation-multi-image-delete.test.ts`

**Interfaces:**
- Produces: `AutomationMediaSnapshot.mediaUrls: string[]`
- Produces: `AutomationJob.mediaUrls: string[]`
- Produces: `AutomationRepository.deleteRule(id: string, reason: string): Promise<AutomationRule>`
- Produces RPC: `crm_soft_delete_automation_rule(p_rule_id uuid, p_reason text)`

- [ ] **Step 1: Write failing persistence/contract tests**

Add tests asserting that a scheduled job maps `media_urls_snapshot` to `mediaUrls`, an old row with no array falls back to `[mediaUrl]`, deleted rules are excluded from list/active-list queries, and `deleteRule()` invokes the soft-delete RPC.

```ts
assert.deepEqual(job.mediaUrls, ['https://cdn.test/1.webp','https://cdn.test/2.webp']);
assert.deepEqual(oldJob.mediaUrls, ['https://cdn.test/legacy.webp']);
await repository.deleteRule('rule-1','DELETED_FROM_CRM');
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/automation-multi-image-delete.test.ts
```
Expected: FAIL because `mediaUrls` and `deleteRule` do not exist.

- [ ] **Step 3: Extend TypeScript contracts**

In `backend/src/automation/types.ts`, add:
```ts
export type AutomationMediaSnapshot={
  mediaUrl:string|null;
  mediaUrls:string[];
  mediaType:string|null;
  mediaProductId:string|null;
  mediaSource:string|null;
};
```
Add `mediaUrls:string[]` to `AutomationJob` and `ScheduleAutomationJobInput`, and `deleteRule(id:string,reason:string):Promise<AutomationRule>` to `AutomationRepository`.

- [ ] **Step 4: Add migration 012**

Migration must:
```sql
alter table public.crm_automation_rules add column if not exists deleted_at timestamptz null;
alter table public.crm_automation_jobs add column if not exists media_urls_snapshot jsonb not null default '[]'::jsonb;
```
Backfill existing jobs from `media_url_snapshot`, add a check that `media_urls_snapshot` is a JSON array, replace the current 11-argument schedule RPC with a 12-argument version accepting `p_media_urls jsonb`, retain compatibility wrappers for existing signatures, extend `crm_claim_due_automation_jobs` to return `media_urls_snapshot`, and create `crm_soft_delete_automation_rule` that locks the rule, sets `active=false`, sets `deleted_at=now()`, cancels only PENDING jobs for that rule, and returns the updated rule row. Do not delete jobs/executions.

- [ ] **Step 5: Map arrays and soft delete in Supabase repository**

Use a helper that accepts a JSON array or legacy primary URL:
```ts
function mediaUrls(row:any):string[]{
  const raw=Array.isArray(row.media_urls_snapshot)?row.media_urls_snapshot:[];
  const urls=raw.map(String).filter(value=>/^https:\/\//i.test(value));
  if(urls.length)return [...new Set(urls)].slice(0,20);
  const primary=nullable(row.media_url_snapshot??row.media_url);
  return primary&&/^https:\/\//i.test(primary)?[primary]:[];
}
```
Filter rule reads with `deleted_at=is.null`; `deleteRule()` must call the RPC and return the updated rule.

- [ ] **Step 6: Run targeted tests and build check**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/automation-multi-image-delete.test.ts
npm run build
```
Expected: targeted test PASS; build exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/automation/types.ts backend/src/adapters/supabase/SupabaseAutomationRepository.ts backend/tests/unit/automation-multi-image-delete.test.ts sql/supabase/migrations/012_crm_automation_multi_image_safe_delete.sql
git commit -m "feat: snapshot multiple automation images safely"
```

---

### Task 2: Resolve and send all ordered product images without duplicate retries

**Files:**
- Modify: `backend/src/automation/AutomationMediaResolver.ts`
- Modify: `backend/src/automation/AutomationScheduler.ts`
- Modify: `backend/src/automation/ActionExecutor.ts`
- Modify: `backend/src/adapters/sqlbridge/SqlBridgeErpRepository.ts`
- Modify: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- Test: `backend/tests/unit/automation-media.test.ts`
- Test: `backend/tests/unit/whatsapp-cloud-api-client.test.ts`

**Interfaces:**
- Consumes: `AutomationMediaSnapshot.mediaUrls`
- Produces executor result fields `providerMessageIds:string[]`, `mediaSentCount:number`, and optional `warning:string|null`

- [ ] **Step 1: Add failing resolver/executor tests**

Cover: all valid unique image URLs remain in ERP order; max 20; first URL remains `mediaUrl`; first image carries caption; remaining images send with empty caption; later explicit/ambiguous failure after one accepted image returns SENT with a warning and never resends already accepted media.

```ts
assert.deepEqual(snapshot.mediaUrls,[url1,url2,url3]);
assert.equal(snapshot.mediaUrl,url1);
assert.deepEqual(sender.calls,[
  [recipient,url1,'caption'],
  [recipient,url2,''],
  [recipient,url3,''],
]);
```

- [ ] **Step 2: Run tests and verify RED**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/automation-media.test.ts tests/unit/whatsapp-cloud-api-client.test.ts
```
Expected: FAIL because the current executor sends one image only.

- [ ] **Step 3: Preserve ERP image order and expose up to 20 images**

In `SqlBridgeErpRepository.getProductImages`, keep stored-procedure row order, de-duplicate by URL, skip non-http(s) URLs, and return at most 20 rows. In `AutomationMediaResolver`, convert valid HTTPS rows to an ordered de-duplicated list and return:
```ts
return {
  mediaUrl: urls[0]??null,
  mediaUrls: urls,
  mediaType: selected?.type??null,
  mediaProductId: ref.productId??candidate,
  mediaSource: selected?.source??'SQL_BRIDGE',
};
```
Do not reorder by image type anymore; ERP `orden` is authoritative.

- [ ] **Step 4: Snapshot all URLs in scheduler**

`EMPTY_MEDIA` becomes `{mediaUrl:null,mediaUrls:[],mediaType:null,mediaProductId:null,mediaSource:null}`. Custom-image rules snapshot `[rule.mediaUrl]` when valid. Text snapshots `[]`.

- [ ] **Step 5: Send image sequence in ActionExecutor**

For `SEND_IMAGE_PRODUCT_AUTO`, use `mediaUrls.length ? mediaUrls : mediaUrl ? [mediaUrl] : []`. Send first image with caption, remaining images with empty caption. If no image is available, send text fallback. If first image is explicitly rejected/preparation fails, send text fallback. If first send is ambiguous, return AMBIGUOUS with no fallback. If an additional image fails after at least one accepted image, stop and return SENT with `warning='PARTIAL_MEDIA_SEND'`; never retry the accepted images.

- [ ] **Step 6: Run targeted tests**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/automation-media.test.ts tests/unit/whatsapp-cloud-api-client.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/automation/AutomationMediaResolver.ts backend/src/automation/AutomationScheduler.ts backend/src/automation/ActionExecutor.ts backend/src/adapters/sqlbridge/SqlBridgeErpRepository.ts backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts backend/tests/unit/automation-media.test.ts backend/tests/unit/whatsapp-cloud-api-client.test.ts
git commit -m "feat: send ordered product image sequences"
```

---

### Task 3: Make provider acceptance authoritative and downgrade audit failures to warnings

**Files:**
- Modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Modify: `backend/src/automation/AutomationWorker.ts`
- Test: `backend/tests/unit/supabase-crm-automation-media.test.ts`
- Test: `backend/tests/unit/automation-media.test.ts`

**Interfaces:**
- Consumes executor provider acceptance (`providerMessageId` / `providerMessageIds`)
- Produces terminal `SENT` after provider acceptance even if CRM/audit persistence fails

- [ ] **Step 1: Write failing regressions for the real bug**

Add a Supabase CRM test where a successful 201 response has an empty body and assert `recordAutomationMessage` resolves instead of throwing `Unexpected end of JSON input`. Add a worker test where provider send succeeds but `recordAutomationMessage` throws; assert `markTerminal(job,'SENT',...)` and no FAILED execution is created.

- [ ] **Step 2: Run tests and verify RED**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/supabase-crm-automation-media.test.ts tests/unit/automation-media.test.ts
```
Expected: FAIL on empty successful response and SENT->FAILED transition.

- [ ] **Step 3: Make Supabase JSON parsing tolerate successful empty responses**

Replace unconditional `response.json()` with text-first parsing:
```ts
const body=await response.text();
if(!body.trim())return null;
return JSON.parse(body);
```
Keep non-2xx error handling unchanged.

- [ ] **Step 4: Change worker terminal ordering after provider acceptance**

After executor returns SENT, mark the job SENT first. Then attempt CRM message persistence and execution audit independently. Audit failures are recorded best-effort as SENT detail with `auditWarning`, not FAILED. Include `mediaUrls`, `providerMessageIds`, `mediaSentCount`, and any partial-media warning in metadata/detail.

- [ ] **Step 5: Run regression tests and build**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/supabase-crm-automation-media.test.ts tests/unit/automation-media.test.ts
npm run build
```
Expected: PASS and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/adapters/supabase/SupabaseCrmRepository.ts backend/src/automation/AutomationWorker.ts backend/tests/unit/supabase-crm-automation-media.test.ts backend/tests/unit/automation-media.test.ts
git commit -m "fix: keep accepted automation sends as sent"
```

---

### Task 4: Add ADMIN-only safe rule deletion API and frontend control

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/integration/crm-automation-http.test.ts`
- Modify: `src/features/automations/automations.types.ts` in `artosperu-bot/crm-frontend`
- Modify: `src/features/automations/automations.repository.ts` in `artosperu-bot/crm-frontend`
- Modify: `src/features/automations/AutomationPage.tsx` in `artosperu-bot/crm-frontend`
- Modify: `src/features/automations/AutomationPage.test.tsx` in `artosperu-bot/crm-frontend`

**Interfaces:**
- Backend route: `DELETE /api/automations/rules/:id`
- Frontend method: `deleteRule(ruleId:string):Promise<AutomationRule>`

- [ ] **Step 1: Add failing backend authorization/deletion tests**

Assert ADMIN can delete, ASESOR gets 403, and backend calls repository `deleteRule(id,'DELETED_FROM_CRM')`.

- [ ] **Step 2: Implement DELETE endpoint**

In `backend/src/app.ts`, reuse `actor(req)` and `requireAdmin(who)`, decode rule id, call repository soft delete, and return `{rule}` with HTTP 200.

- [ ] **Step 3: Run backend integration test**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/integration/crm-automation-http.test.ts
```
Expected: PASS.

- [ ] **Step 4: Add failing frontend delete tests**

Test that ADMIN sees `Eliminar`, confirmation calls `api.deleteRule(rule.id)`, the list invalidates, and ASESOR has no delete control.

- [ ] **Step 5: Implement frontend repository and UI**

Add `deleteRule()` using HTTP DELETE. Extend `AutomationApi` test doubles. Add an ADMIN-only destructive button to rule cards using `window.confirm('¿Eliminar esta automatización? Los envíos históricos se conservarán.')`; on success show toast and invalidate rules/jobs.

- [ ] **Step 6: Run frontend tests/typecheck**

Run:
```bash
npm test -- src/features/automations/AutomationPage.test.tsx src/features/automations/automations.repository.test.ts
npm run lint:type
```
Expected: PASS.

- [ ] **Step 7: Commit backend and frontend separately**

Backend:
```bash
git add backend/src/app.ts backend/tests/integration/crm-automation-http.test.ts
git commit -m "feat: safely delete automation rules"
```
Frontend:
```bash
git add src/features/automations/automations.types.ts src/features/automations/automations.repository.ts src/features/automations/AutomationPage.tsx src/features/automations/AutomationPage.test.tsx
git commit -m "feat: add automation delete control"
```

---

### Task 5: Render automation media in the WhatsApp Inbox

**Files:**
- Modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Modify: `src/features/whatsapp/whatsapp.types.ts` in `artosperu-bot/crm-frontend`
- Modify: `src/features/whatsapp/WhatsAppInboxPage.tsx` in `artosperu-bot/crm-frontend`
- Modify: `src/features/whatsapp/WhatsAppInboxPage.test.tsx` in `artosperu-bot/crm-frontend`
- Modify: `src/features/whatsapp/whatsapp.css` in `artosperu-bot/crm-frontend`

**Interfaces:**
- CRM message metadata fields: `automation_media_urls`, `automation_media_url`, `automation_provider_message_ids`, `automation_media_sent_count`, `automation_warning`

- [ ] **Step 1: Persist full media metadata**

When recording automation messages, write both legacy `automation_media_url` and ordered `automation_media_urls`. Include provider ids/count/warning so the UI can explain partial sends without inventing status.

- [ ] **Step 2: Add failing Inbox render test**

Provide a BOT message fixture with:
```ts
metadata:{
  source:'crm_automation',
  automation_media_urls:['https://cdn.test/1.webp','https://cdn.test/2.webp'],
}
```
Assert two images render and the text remains visible.

- [ ] **Step 3: Extend WhatsApp message metadata typing**

Allow `metadata?: Record<string,unknown>|null` on message types if not already present. Add a helper that validates HTTPS URLs and falls back from `automation_media_urls` to legacy `automation_media_url`.

- [ ] **Step 4: Render images before the message text**

For automation BOT messages only, render an image strip/grid inside the existing bubble. Use normal `<img loading="lazy">`; invalid/non-HTTPS values are ignored. Old text-only messages render unchanged.

- [ ] **Step 5: Add minimal responsive CSS**

Use a single-image full-width presentation and a compact grid for 2+ images without changing the existing chat layout.

- [ ] **Step 6: Run frontend tests/typecheck/build**

Run:
```bash
npm test -- src/features/whatsapp/WhatsAppInboxPage.test.tsx
npm run lint:type
npm run build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/whatsapp/whatsapp.types.ts src/features/whatsapp/WhatsAppInboxPage.tsx src/features/whatsapp/WhatsAppInboxPage.test.tsx src/features/whatsapp/whatsapp.css
git commit -m "feat: render automation images in inbox"
```

---

### Task 6: Apply migration and run end-to-end verification

**Files:**
- Migration: `sql/supabase/migrations/012_crm_automation_multi_image_safe_delete.sql`
- No new application files unless verification reveals a regression.

**Interfaces:**
- Live Supabase project must expose the new snapshot column and safe-delete RPC before the new backend is deployed.

- [ ] **Step 1: Apply migration 012 to Supabase**

Apply only the committed migration through the migration API, not ad-hoc DDL.

- [ ] **Step 2: Verify live schema read-only**

Query `information_schema.columns` for `deleted_at` and `media_urls_snapshot`, and `pg_proc` for `crm_soft_delete_automation_rule` and the new schedule signature.

- [ ] **Step 3: Run backend targeted automation suite**

Run:
```bash
cd backend
node --experimental-strip-types --test tests/unit/automation-media.test.ts tests/unit/automation-multi-image-delete.test.ts tests/unit/supabase-crm-automation-media.test.ts tests/integration/crm-automation-http.test.ts
npm run build
```
Expected: all targeted automation tests PASS and build exit 0.

- [ ] **Step 4: Run frontend full verification**

Run:
```bash
npm test
npm run lint:type
npm run build
```
Expected: all frontend tests PASS, typecheck exit 0, build exit 0.

- [ ] **Step 5: Perform one real WhatsApp smoke test**

Create a one-minute `SEND_IMAGE_PRODUCT_AUTO` rule, let a BOT conversation schedule it, verify the job snapshot contains multiple ordered media URLs, verify WhatsApp receives the first captioned image plus remaining images, verify job status is SENT, and verify Inbox shows the sent images. Then reply before another scheduled follow-up and verify cancellation still works.

- [ ] **Step 6: Verify safe delete**

Delete a test automation from the CRM, verify it disappears from active/list results, its pending jobs become CANCELLED with `DELETED_FROM_CRM`, and historical SENT jobs/executions remain queryable.

- [ ] **Step 7: Final commit only if verification generated necessary fixes**

Any verification-only fix must have its own focused commit and rerun the affected test plus full build before completion.

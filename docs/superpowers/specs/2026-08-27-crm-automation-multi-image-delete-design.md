# CRM Automation Multi-Image, Safe Delete, and Audit-State Design

Date: 2026-08-27

## Goal

Extend the existing CRM automation engine without breaking the verified WhatsApp flow so that automatic product follow-ups can send all valid active product images in order, automation rules can be safely removed from the CRM, successful WhatsApp sends are never shown as failed merely because a later audit write failed, and the Inbox can render automation media actually sent.

## Existing constraints preserved

- ADMIN can create/edit/manage automation rules; ASESOR remains read-only.
- Worker remains persistent in backend and independent from the frontend.
- One rule may execute at most once per conversation.
- Pending follow-ups are cancelled when the customer replies, a human takes over, the conversation waits for an advisor, or the chat is closed.
- WhatsApp 24-hour policy is revalidated immediately before send.
- Existing SEND_TEXT and SEND_IMAGE_CUSTOM_URL behavior remains compatible.
- Product authority remains SQL Server through the existing ERP bridge and `dbo.sp_BuscarImagenesProductoVenta`.
- Media is snapshotted when the job is scheduled; later rule/catalog edits do not mutate already-scheduled jobs.
- At-most-once semantics are preserved: ambiguous provider/network results are not retried blindly.

## 1. Automatic product images

### Source

For `SEND_IMAGE_PRODUCT_AUTO`, resolve the active product for the session as today, then call the ERP image port once for that product with a maximum of 20 results.

The ERP result order is authoritative. The backend must preserve the order returned by `sp_BuscarImagenesProductoVenta`; it must not re-rank after retrieval. Duplicate URLs and invalid/non-HTTPS URLs are removed while preserving first occurrence.

### Snapshot

Jobs gain a backward-compatible `media_urls_snapshot` JSONB array containing every frozen image URL. Existing `media_url_snapshot` remains populated with the first URL for compatibility with old code and old jobs.

The in-memory automation media snapshot gains `mediaUrls: string[]`. For legacy jobs where the array is absent, `mediaUrls` is synthesized from `mediaUrl`.

No product images are duplicated into Supabase storage; only source URLs are snapshotted.

## 2. WhatsApp send sequence

For an automatic multi-image job:

1. Send the first image with the automation message as its caption.
2. Send each remaining image immediately after it without duplicating the caption.
3. Keep a list of provider message IDs for successfully accepted sends.

If the first image cannot be prepared or is explicitly rejected before provider acceptance, send the existing text fallback once.

If a send becomes ambiguous after a provider request may have been accepted, do not send fallback text and do not retry blindly; mark the job `AMBIGUOUS` unless at least one prior media item was already confirmed accepted.

If one or more media items were already accepted and a later image fails explicitly or ambiguously, the job is terminal `SENT` with `partial_media_failure=true` in execution detail. This prevents duplicate customer contact while accurately recording the incomplete gallery.

A completely successful gallery is `SENT` and records all provider message IDs and all media URLs.

## 3. Correct post-send audit semantics

Provider acceptance is the source of truth for delivery-attempt status.

Once WhatsApp returns a provider message ID for the customer-facing send, a later CRM/audit persistence failure must never downgrade the job from `SENT` to `FAILED`.

The Supabase response parser must accept successful empty-body responses instead of calling `response.json()` unconditionally. This directly fixes the observed `Unexpected end of JSON input` after successful sends.

After provider acceptance:

- job status becomes/remains `SENT`;
- audit persistence errors are recorded as warning detail where possible (`audit_warning`, `audit_error`);
- no second contradictory `FAILED` execution is created for the same successful customer send.

## 4. Safe automation deletion

Physical deletion is not used because `crm_automation_jobs.rule_id` currently cascades on delete and would destroy historical jobs/executions.

Add soft-delete fields to rules:

- `deleted_at timestamptz null`
- `deleted_by text null`

A deleted rule is automatically inactive and excluded from normal `listRules` and `listActiveRules` results.

Delete flow for ADMIN:

1. API `DELETE /api/automations/rules/:id`.
2. Backend validates ADMIN.
3. Repository soft-deletes the rule and marks it inactive.
4. All currently PENDING jobs for that rule are cancelled with reason `RULE_DELETED`.
5. Historical SENT/FAILED/CANCELLED/AMBIGUOUS jobs and executions remain untouched.

Frontend adds an `Eliminar` action with explicit confirmation. ASESOR does not receive delete controls.

## 5. Inbox media rendering

Automation message metadata gains:

- `automation_media_urls: string[]`
- `automation_provider_message_ids: string[]`
- existing single-value media fields remain for compatibility.

The WhatsApp Inbox renders automation media above the text bubble when metadata contains one or more HTTPS media URLs.

For legacy messages with only `automation_media_url`, render that one image.

If an image fails to load in the browser, the text bubble remains visible and the image placeholder is hidden or marked unavailable; the conversation itself must not fail to render.

## 6. Database migration

Create additive migration `012_crm_automation_multi_media_safe_delete.sql`:

- add `deleted_at`, `deleted_by` to `crm_automation_rules`;
- add `media_urls_snapshot jsonb not null default '[]'::jsonb` to jobs;
- backfill `media_urls_snapshot` from existing `media_url_snapshot` where present;
- extend scheduling RPC with optional media URL array while retaining the existing compatible signature/wrapper;
- extend claim RPC return projection with `media_urls_snapshot`;
- add an RPC or repository-safe update path to soft-delete rule plus cancel its PENDING jobs atomically.

Migration is additive and safe for existing data.

## 7. Backend components touched

- `automation/types.ts`: multi-media snapshot, delete repository method, richer send result metadata.
- `AutomationMediaResolver.ts`: resolve ordered list instead of one selected image.
- `AutomationScheduler.ts`: freeze all resolved URLs.
- `ActionExecutor.ts`: send ordered gallery, caption only first item, preserve at-most-once/partial-send semantics.
- `AutomationWorker.ts`: provider acceptance remains SENT even if audit persistence later fails.
- `WhatsAppCloudApiClient.ts`: reuse existing single-image primitive; no duplicate retry policy.
- `SupabaseAutomationRepository.ts`: multi-media mapping, empty successful response handling, soft delete.
- `SupabaseCrmRepository.ts`: persist media arrays/provider IDs and tolerate empty success responses.
- `app.ts`: ADMIN delete endpoint.

## 8. Frontend components touched

- automation repository/types: delete API contract and multi-media job shape.
- Automation page: delete action + confirmation; existing editor remains intact.
- WhatsApp Inbox: render one or many automation media URLs from message metadata.

## 9. Tests

Backend tests must cover:

- automatic resolver preserves all valid ordered URLs and deduplicates;
- scheduler freezes all images in the job;
- first image gets caption, later images do not;
- all images success -> SENT;
- first-image explicit reject -> one text fallback;
- ambiguous first send -> AMBIGUOUS and no fallback;
- later-image failure after at least one success -> SENT with partial-media warning;
- successful provider send + empty Supabase response -> SENT, not FAILED;
- audit persistence exception after provider success -> SENT with warning semantics;
- soft delete hides rule, disables it, cancels pending jobs, preserves historical jobs;
- ADMIN-only delete endpoint.

Frontend tests must cover:

- ADMIN sees delete, ASESOR does not;
- delete confirmation invokes backend and removes rule after refresh;
- Inbox renders one and multiple automation images;
- legacy single-media metadata still renders;
- existing automation media editor and pending-job labels continue passing.

## Acceptance criteria

The change is complete only when:

1. A real product session can schedule a gallery containing all valid product images returned by SQL in order.
2. WhatsApp receives the first image with text and subsequent images without duplicated text.
3. A confirmed WhatsApp send cannot appear as `Fallido` solely because audit persistence failed.
4. ADMIN can remove an automation from the UI without erasing its execution history.
5. The Inbox displays automation images that were actually associated with the outbound message.
6. Existing text-only, custom-image, cancellation, human-takeover, 24-hour, and once-per-conversation behaviors remain intact.

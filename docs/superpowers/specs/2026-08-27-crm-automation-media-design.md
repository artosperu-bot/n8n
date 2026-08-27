# CRM Automation Media Follow-ups Design

## Objective

Extend the existing persistent WhatsApp CRM automation engine so a follow-up rule can send text only, product image + caption, or custom image URL + caption without changing the current scheduling, cancellation, attention-mode, once-per-conversation, 24-hour-window, or at-most-once semantics.

## Existing authorities reused

- Scheduler: `backend/src/automation/AutomationScheduler.ts`
- Worker: `backend/src/automation/AutomationWorker.ts`
- Execution: `backend/src/automation/ActionExecutor.ts`
- WhatsApp Graph client: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- CRM state: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Product image authority: `SqlBridgeErpRepository.getProductImages()` -> `dbo.sp_BuscarImagenesProductoVenta`
- Persistence/idempotency: `crm_automation_rules`, `crm_automation_jobs`, `crm_automation_rule_session_guard`, `crm_automation_executions`

## Rule model

`action_type` supports:

- `SEND_TEXT`
- `SEND_IMAGE_PRODUCT_AUTO`
- `SEND_IMAGE_CUSTOM_URL`

Rules add nullable `media_url`. `SEND_IMAGE_CUSTOM_URL` requires an HTTPS URL. `SEND_IMAGE_PRODUCT_AUTO` does not store a rule URL because the media is resolved from the active product when the job is scheduled.

## Job snapshots

Existing jobs keep `message_template_snapshot` and `priority_snapshot`. Add:

- `action_type_snapshot text`
- `media_url_snapshot text`
- `media_type_snapshot text`
- `media_product_id_snapshot text`
- `media_source_snapshot text`

The scheduler resolves media before calling the schedule RPC. The RPC stores all snapshot fields atomically with the job. Editing a rule only affects jobs scheduled later.

## Automatic product image resolution

After the BOT reply is persisted, the scheduler asks CRM for the current product reference from `ia_contexto.producto_activo_id` with fallback to the latest resolved product id from `ia_conversaciones`. If a product is available it uses the existing ERP image lookup. Selection order:

1. first valid URL whose type contains `caracteristicas_generales`;
2. otherwise the first valid HTTPS image URL;
3. otherwise no image snapshot and the job remains eligible for text fallback at execution time.

The product id, URL, media type and source are frozen in the job.

## WhatsApp delivery

The existing text sender remains unchanged for text rules. Image rules execute through a new `sendImageWithCaptionOnce` capability.

- JPEG/PNG public URL: Graph `image.link` with caption.
- WEBP: download in backend, convert to JPEG, upload JPEG to the WhatsApp media endpoint, then send `image.id` with caption.
- Conversion uses `sharp` because WhatsApp image messages accept JPEG/PNG while WebP is not a normal image-message format.
- If media preparation or an explicit provider rejection occurs before an ambiguous send, fall back to the text caption.
- If transport failure is ambiguous after dispatch, mark the job `AMBIGUOUS` and do not send a second text message.

## Audit

Automation messages continue to be persisted in `crm_mensajes`. Metadata additionally records action type, media URL/product/source when present. `crm_automation_executions.detail` records the same delivery metadata and whether text fallback was used.

## API

Existing authenticated endpoints are preserved. Create/update rule payloads add:

- `actionType`
- `mediaUrl`

Validation remains backend-authoritative. ADMIN can create/edit/toggle rules. ASESOR remains read-only except existing per-conversation cancellation permissions.

## Frontend

Extend the existing Automations screen only. Add content type selector:

- Solo texto
- Imagen del producto + texto
- Imagen personalizada + texto

For custom image rules show a URL field. Show a WhatsApp-style preview with image/placeholder, caption and emoji support. Rule cards and job rows display the content type. The WhatsApp inbox follow-up chip displays the pending job type.

No upload/storage infrastructure is introduced in this iteration because the Supabase project currently has no Storage bucket configured; custom URL is the supported custom-image path.

## Safety invariants preserved

- one rule once per conversation through `crm_automation_rule_session_guard`;
- customer reply cancels pending jobs;
- HUMAN/WAITING/CLOSED cancels or blocks delivery;
- worker revalidates live CRM state immediately before send;
- 24-hour customer-care window remains mandatory;
- no n8n execution path;
- no change to SPIN, RAG, ERP product authority or normal bot conversation behavior;
- no recursive automation scheduling from automation messages.

## Tests

Backend tests cover rule validation, snapshots, product image selection, Graph image payload, WebP conversion path, text fallback, ambiguous send, audit metadata and preserved cancellation/idempotency behavior.

Frontend tests cover ADMIN create/edit for all three content types, custom URL validation, preview/emojis, read-only ASESOR behavior, type labels and pending-follow-up type in inbox.

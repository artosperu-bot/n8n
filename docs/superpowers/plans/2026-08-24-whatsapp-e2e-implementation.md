# WhatsApp E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar WhatsApp Cloud API completamente operativo en STECH usando el backend existente, sin duplicar la lógica del chatbot y reutilizando la persistencia/CRM ya existente.

**Architecture:** WhatsApp será únicamente un nuevo transporte sobre el backend actual: Meta → Cloudflare → `POST /webhooks/whatsapp` → parser/ACK → persistencia/idempotencia → `HybridConversationEngine` → `WhatsAppCloudApiClient` → Meta. El CRM humano reutilizará las tablas/RPC existentes y los endpoints HTTP ya añadidos, con JWT de Supabase y control de versión.

**Tech Stack:** Node.js 22, TypeScript, `node:http`, Supabase/PostgREST/RPC, WhatsApp Cloud API Graph v25.0, Cloudflare Tunnel.

**Spec:** `docs/superpowers/specs/2026-08-24-whatsapp-backend-adapter-design.md`

## Global Constraints

- No crear otro backend.
- No duplicar SPIN/FAB/RAG/SQL/LLM en WhatsApp.
- No modificar tablas Supabase salvo evidencia concreta que lo exija.
- `wamid` es la clave idempotente del mensaje WhatsApp.
- `sessionId = whatsapp:<wa_id>`.
- El webhook debe responder HTTP 200 antes de trabajo pesado.
- El Access Token de WhatsApp nunca llega al frontend.
- Si `modo_atencion != BOT`, la IA no envía respuesta automática.
- Mantener `/health`, `/api/chat` y `/api/sessions/:id` sin regresiones.

---

### Task 1: Cerrar transporte público de WhatsApp

**Files:**
- Verify: `backend/src/app.ts`
- Verify: `backend/src/adapters/whatsapp/WhatsAppWebhookAdapter.ts`
- Test: `backend/tests/integration/whatsapp-webhook.test.ts`

**Interfaces:**
- Consumes: `POST /webhooks/whatsapp`
- Produces: ACK `{ "received": true }` y trazas de frontera.

- [ ] Ejecutar POST sintético local contra `http://127.0.0.1:3000/webhooks/whatsapp`.
- [ ] Confirmar HTTP 200 + `{"received":true}` + `[WHATSAPP][HTTP_IN]` + `[WHATSAPP][PAYLOAD_ACCEPTED]`.
- [ ] Ejecutar el mismo POST contra `https://whatsapp.artos.pe/webhooks/whatsapp`.
- [ ] Confirmar exactamente los mismos logs en Node.
- [ ] Ejecutar Meta Developer Tools → `whatsapp_business_account/messages`.
- [ ] Confirmar que Meta genera `[WHATSAPP][HTTP_IN]` en Node.
- [ ] Ejecutar un mensaje WhatsApp real hacia el número conectado.
- [ ] Gate: no avanzar si el POST público o Meta no alcanzan Node.

### Task 2: Validar parser y ACK con envelopes reales

**Files:**
- Modify only if failing: `backend/src/adapters/whatsapp/WhatsAppWebhookAdapter.ts`
- Test: `backend/tests/unit/whatsapp-webhook-parser.test.ts`
- Test: `backend/tests/integration/whatsapp-webhook.test.ts`

**Interfaces:**
- Consumes: Meta envelope `entry[]/changes[]`.
- Produces: `messages[]`, `statuses[]`, `changeCount`.

- [ ] Probar envelope con `messages[]`.
- [ ] Probar envelope con `statuses[]`.
- [ ] Probar un `change` sin `messages` ni `statuses`.
- [ ] Confirmar que ninguno provoca 500.
- [ ] Confirmar que ACK ocurre antes de Supabase/IA.
- [ ] Gate: parser PASS y POST siempre ACK 200 para payload válido.

### Task 3: Persistir inbound WhatsApp e idempotencia

**Files:**
- Verify/modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Verify/modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Test: `backend/tests/unit/supabase-crm-repository.test.ts`
- Test: `backend/tests/unit/whatsapp-inbound-processor.test.ts`

**Interfaces:**
- Consumes: `{waMessageId, waId, text, contactName}`.
- Produces: `sessionId=whatsapp:<wa_id>`, `messageId=wamid`, mensaje en CRM y adquisición del turno existente.

- [ ] Guardar mensaje inbound en `crm_mensajes` con `canal=whatsapp`.
- [ ] Mantener `ia_sesiones.canal=whatsapp` y `ia_contexto.canal=whatsapp`.
- [ ] Reutilizar `ia_adquirir_turno` / UNIQUE existente para idempotencia.
- [ ] Reenviar exactamente el mismo `wamid` dos veces.
- [ ] Confirmar una sola ejecución efectiva del engine y cero respuestas duplicadas.
- [ ] Gate: duplicate delivery no produce segundo reply.

### Task 4: Conectar WhatsApp al motor conversacional existente

**Files:**
- Verify/modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- No modificar salvo bug comprobado: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/tests/unit/whatsapp-inbound-processor.test.ts`

**Interfaces:**
- Consumes: inbound text WhatsApp.
- Calls: `engine.processTurn({sessionId,message,messageId})`.
- Produces: `answer` del mismo chatbot usado por `/api/chat`.

- [ ] Para `modo_atencion=BOT`, llamar al mismo `HybridConversationEngine`.
- [ ] Pasar `wamid` como `messageId`.
- [ ] No crear un prompt o lógica WhatsApp paralela.
- [ ] Confirmar que precio, stock, RAG, memoria y cierre son iguales a `/api/chat`.
- [ ] Gate: un mismo input relevante produce comportamiento comercial equivalente entre pruebas IA y WhatsApp.

### Task 5: Enviar respuesta del BOT por Meta

**Files:**
- Verify/modify: `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- Verify/modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Test: `backend/tests/unit/whatsapp-cloud-api-client.test.ts`

**Interfaces:**
- Consumes: `{to: wa_id, text: answer}`.
- Produces: `wamid` saliente de Meta.

- [ ] Enviar `POST /{PHONE_NUMBER_ID}/messages` desde backend.
- [ ] Confirmar `Authorization: Bearer ...` solo backend.
- [ ] Persistir respuesta BOT en `crm_mensajes` con el `wamid` saliente.
- [ ] Probar error 4xx/5xx de Graph sin filtrar token ni teléfono en logs.
- [ ] Gate: mensaje real de cliente recibe una respuesta real de STECH en WhatsApp.

### Task 6: Handoff BOT ↔ asesor sin respuestas dobles

**Files:**
- Verify/modify: `backend/src/adapters/whatsapp/WhatsAppInboundProcessor.ts`
- Verify/modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Test: `backend/tests/unit/whatsapp-inbound-processor.test.ts`
- Test: `backend/tests/integration/crm-whatsapp-http.test.ts`

**Interfaces:**
- Consumes: `modo_atencion` y `version`.
- Produces: supresión automática cuando `HUMANO/ESPERANDO_ASESOR/CERRADO`.

- [ ] Confirmar que `HUMANO`, `ESPERANDO_ASESOR` y `CERRADO` guardan inbound pero no llaman al bot.
- [ ] Reconsultar modo antes de enviar la respuesta automática.
- [ ] Simular takeover mientras la IA está procesando.
- [ ] Confirmar que la respuesta BOT queda cancelada.
- [ ] Gate: nunca hay respuesta simultánea asesor + bot.

### Task 7: API CRM para frontend WhatsApp

**Files:**
- Verify/modify: `backend/src/app.ts`
- Verify/modify: `backend/src/adapters/supabase/SupabaseCrmAuth.ts`
- Verify/modify: `backend/src/adapters/supabase/SupabaseCrmRepository.ts`
- Test: `backend/tests/integration/crm-whatsapp-http.test.ts`

**Interfaces:**
- `GET /api/whatsapp/status`
- `GET /api/whatsapp/conversations`
- `GET /api/whatsapp/conversations/:id`
- `GET /api/whatsapp/conversations/:id/messages`
- `POST /api/whatsapp/conversations/:id/take`
- `POST /api/whatsapp/conversations/:id/return-bot`
- `POST /api/whatsapp/conversations/:id/messages`

- [ ] Exigir JWT Supabase para toda ruta CRM WhatsApp.
- [ ] Validar usuario activo en `crm_usuarios`.
- [ ] Listar solo conversaciones WhatsApp.
- [ ] Devolver historial, contexto comercial e insight.
- [ ] Exigir `version` en take/return/send-human.
- [ ] Resolver `VERSION_CONFLICT` como HTTP 409.
- [ ] Enviar mensaje humano a Meta desde backend y persistir su `wamid`.
- [ ] Gate: frontend nunca necesita Service Role ni WhatsApp Access Token.

### Task 8: CORS y seguridad HTTP

**Files:**
- Verify/modify: `backend/src/app.ts`
- Verify: `backend/src/shared/trace.ts`
- Verify: `backend/.env.example`
- Test: `backend/tests/integration/crm-whatsapp-http.test.ts`
- Test: `backend/tests/unit/whatsapp-trace-redaction.test.ts`

**Interfaces:**
- Allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`.

- [ ] OPTIONS devuelve 204.
- [ ] CORS devuelve solo el origin permitido, nunca `*` con auth.
- [ ] Errores HTTP devuelven códigos públicos, no mensajes internos.
- [ ] Logs no contienen tokens, autorización, teléfonos ni payload completo.
- [ ] Gate: secret scanner + tests de redacción PASS.

### Task 9: Vista WhatsApp en frontend

**Files:**
- Auditar primero el frontend real y reutilizar router/layout/API client existentes.
- Crear solo componentes de UI necesarios para Inbox / Thread / Context / Composer.

**Interfaces:**
- Consumes: endpoints `/api/whatsapp/*`.
- Auth: JWT Supabase del usuario CRM.

- [ ] Inbox con filtros `BOT/HUMANO/ESPERANDO_ASESOR/CERRADO`.
- [ ] Thread con historial real.
- [ ] Panel derecho con `context` + `insight` real.
- [ ] Botón tomar conversación usando `version` actual.
- [ ] Botón devolver a BOT usando `version` actualizada.
- [ ] Composer humano solo habilitado en modo HUMANO.
- [ ] Refrescar detalle/version después de cada mutación.
- [ ] Mostrar `/api/whatsapp/status` separado de `/health`.
- [ ] Gate: ningún secreto existe en bundle/localStorage/network payload.

### Task 10: Vista Pruebas IA sin regresión

**Files:**
- Reutilizar frontend existente.
- Backend unchanged unless regression found.

**Interfaces:**
- `GET /health`
- `POST /api/chat`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`

- [ ] Crear sesión de prueba.
- [ ] Enviar `sessionId`, `message`, `messageId`.
- [ ] Mostrar `answer`, `state`, `debug`.
- [ ] Resetear sesión.
- [ ] Confirmar que WhatsApp y pruebas IA comparten motor pero no transporte.
- [ ] Gate: test HTTP legado PASS.

### Task 11: Certificación E2E final

- [ ] GET verify local = PASS.
- [ ] GET verify público = PASS.
- [ ] POST sintético local = PASS.
- [ ] POST sintético público = PASS.
- [ ] Meta test webhook = PASS.
- [ ] Mensaje real cliente → BOT = PASS.
- [ ] Segundo envío mismo `wamid` = no duplicate reply.
- [ ] Takeover humano = bot silenciado.
- [ ] Mensaje asesor → Meta = PASS.
- [ ] Return to BOT = siguiente mensaje vuelve a IA.
- [ ] Inbox/detalle/contexto = PASS.
- [ ] CORS/auth/secret redaction = PASS.
- [ ] `/api/chat` y QA existente = PASS.

## Definition of Done

WhatsApp queda terminado solo cuando el flujo real sea:

```text
Cliente WhatsApp
→ Meta
→ whatsapp.artos.pe
→ POST /webhooks/whatsapp (ACK 200)
→ wamid idempotente
→ crm_mensajes / sesión whatsapp
→ modo BOT
→ HybridConversationEngine existente
→ SQL + RAG + memoria + LLM existentes
→ WhatsAppCloudApiClient
→ Meta
→ cliente recibe respuesta
```

Y el flujo humano sea:

```text
CRM frontend
→ JWT Supabase
→ take(version)
→ HUMANO
→ inbound sigue guardándose pero BOT no responde
→ asesor envía por backend
→ Meta
→ return-bot(version)
→ BOT vuelve a responder
```

No se considera completo si solo funciona el GET de verificación o un POST sintético; debe pasar un mensaje real de extremo a extremo y el handoff humano sin respuestas duplicadas.

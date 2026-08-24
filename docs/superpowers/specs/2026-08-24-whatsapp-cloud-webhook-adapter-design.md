# STECH — WhatsApp Cloud API webhook adapter design

Date: 2026-08-24
Branch authority: `fix/data-contract-v46`

## Goal

Acoplar recepción de WhatsApp Cloud API al backend STECH existente, sin crear un backend nuevo, sin duplicar la lógica de IA y sin romper `/health`, `/api/chat` ni `/api/sessions/:id`.

El primer gate cubre transporte y recepción robusta. La conexión completa con el motor conversacional y el envío automático de respuestas queda preparada pero no se habilita hasta demostrar el gate de transporte.

## Existing architecture

El backend usa `node:http` directamente. `src/server.ts` llama `createStechApp()` y `src/app.ts` concentra el routing HTTP. `bootstrap.ts` construye adapters para Supabase, ERP, RAG, LLM y n8n. La persistencia conversacional usa `ConversationRepository`; en modo Supabase se implementa con `SupabaseConversationRepository`.

`HybridConversationEngine.processTurn()` ya recibe `{ sessionId, message, messageId }`. `messageId` participa en el contrato de concurrencia/idempotencia mediante `beginTurn()` / `completeTurn()` y RPC `ia_adquirir_turno`.

## WhatsApp placement

WhatsApp será un adapter de transporte dentro del backend existente:

```text
Cloudflare Tunnel
  -> https://whatsapp.artos.pe
  -> node:http existente
  -> GET/POST /webhooks/whatsapp
  -> WhatsAppWebhookAdapter
       -> VERIFY
       -> MESSAGE
       -> STATUS
```

No se crea Express/Fastify ni otro servidor.

## Gate 1 scope

### GET verification

`GET /webhooks/whatsapp` debe leer:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Si `hub.mode === "subscribe"` y el token coincide con `config.whatsappVerifyToken`, devuelve HTTP 200 con el challenge como `text/plain`, sin JSON. Token incorrecto devuelve 403.

### POST receiver

`POST /webhooks/whatsapp` debe:

1. parsear JSON de forma segura;
2. recorrer `entry[] -> changes[] -> value` sin asumir índices;
3. reconocer `messages[]` y `statuses[]` de forma independiente;
4. extraer de mensajes, cuando existan:
   - `id`
   - `from`
   - `timestamp`
   - `type`
   - `text.body`
   - `metadata.phone_number_id`
   - `metadata.display_phone_number`
   - datos básicos de `contacts[]` cuando estén presentes;
5. no convertir statuses en mensajes inbound;
6. responder HTTP 200 rápidamente después de validar/parsear el envelope, sin esperar IA, SQL, RAG ni servicios pesados.

El gate 1 no llama todavía a `runtime.engine.processTurn()` automáticamente.

## Internal event model

El adapter puede producir un modelo interno en memoria, sin migración de BD:

```ts
{
  provider: 'whatsapp',
  direction: 'inbound',
  waMessageId: string,
  waId: string,
  phoneNumberId: string | null,
  displayPhoneNumber: string | null,
  type: string,
  text: string | null,
  timestamp: string | null,
  contactName: string | null,
}
```

No se persiste `raw_event` completo en tablas productivas durante Gate 1.

## Idempotency

No crear tabla ni columna adicional.

El esquema existente ya tiene protección usable:

- `ia_turn_queue.message_id` UNIQUE;
- `ia_conversaciones.message_id` UNIQUE;
- `ia_conversaciones(session_id, message_id)` UNIQUE;
- RPC `ia_adquirir_turno` reconoce `ALREADY_PROCESSING` y `ALREADY_DONE`.

En Gate 2, el mapping será:

```text
sessionId = whatsapp:<wa_id>
messageId = <wamid>
message   = <text.body>
```

Gate 1 solo debe reconocer el `wamid` y dejar una utilidad para detectar duplicados cuando se active procesamiento.

## Channel handling

Cuando se conecte Gate 2, una sesión `whatsapp:<wa_id>` debe persistirse con `canal = whatsapp`, no `backend`. Esto reutiliza columnas existentes; no requiere migración.

## Configuration

Agregar a `AppConfig` y `.env.example`:

```text
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_ID=
WHATSAPP_GRAPH_API_VERSION=v25.0
```

`WHATSAPP_BUSINESS_ACCOUNT_ID` no es necesario para Gate 1 y no se agregará salvo necesidad demostrada.

`.env` ya está ignorado y no se modifica `.gitignore`.

## Logging

Reutilizar el sistema de redacción existente. Nunca imprimir `WHATSAPP_ACCESS_TOKEN`, Authorization, payload completo, teléfono completo ni `.env`.

Eventos permitidos:

```text
WHATSAPP_VERIFY
WHATSAPP_INBOUND
WHATSAPP_STATUS
WHATSAPP_DUPLICATE
WHATSAPP_ERROR
```

Los logs deben contener solo metadatos acotados: tipo de evento, sufijo/identificador redacted cuando corresponda, tipo de mensaje y conteos.

## Cloud API client

Crear un cliente reusable y aislado para envío futuro:

```text
POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
Authorization: Bearer <token>
```

En Gate 1 se construye/testea el cliente de forma aislada, pero no se conecta al webhook inbound ni al chatbot automático.

## Files

Modificar:

- `backend/src/app.ts`
- `backend/src/config/config.ts`
- `backend/src/bootstrap.ts`
- `backend/src/shared/trace.ts`
- `backend/.env.example`

Crear:

- `backend/src/adapters/whatsapp/WhatsAppWebhookAdapter.ts`
- `backend/src/adapters/whatsapp/WhatsAppCloudApiClient.ts`
- `backend/tests/unit/whatsapp-webhook-parser.test.ts`
- `backend/tests/integration/whatsapp-webhook.test.ts`

No modificar lógica comercial, RAG, ERP, SPIN/FAB ni endpoints QA.

## Tests

1. GET verify correcto -> 200 + body exacto `12345`.
2. GET verify incorrecto -> 403.
3. POST message text -> 200 + mensaje reconocido.
4. POST status sin messages -> 200 y no mensaje falso.
5. Payload con múltiples `entry/changes` -> parser robusto.
6. Regresión de `/health`, `/api/chat`, `/api/sessions/:id`.
7. Config no expone secrets en logs.
8. Cliente Cloud API construye URL/headers sin loguear token.

## Success gate

No declarar terminado por compilar. Gate 1 se considera demostrado cuando el usuario ejecute localmente:

- GET local -> `12345`;
- GET por `https://whatsapp.artos.pe/webhooks/whatsapp` -> `12345`;
- POST fixture -> 200;
- status fixture -> 200;
- rutas existentes siguen pasando.

Solo después se habilita Gate 2 para `processTurn()` + respuesta por WhatsApp Cloud API.

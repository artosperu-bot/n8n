# STECH — Backend Event Gateway v1

Workflow n8n dedicado al backend STECH. **No reemplaza ni modifica `RSVEmajGYTi8f8HJ`**.

## Qué recibe

`POST /stech-backend-events`

Autenticación: **Bearer Auth**. El backend ya envía `Authorization: Bearer <N8N_WEBHOOK_TOKEN>`.

Tipos aceptados:

- `conversation.turn.completed`
- `purchase.intent`
- `handoff.requested`
- `notification.requested`

Respuesta aceptada:

```json
{
  "ok": true,
  "accepted": true,
  "statusCode": 202,
  "route": "conversation.turn.completed",
  "handledBy": "04A Conversation Turn Completed"
}
```

## 1. Importar

En n8n: **Workflows > Import from File** y selecciona `STECH_Backend_Event_Gateway_v1.json`.

El workflow queda INACTIVO por diseño.

## 2. Crear el token

En PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$token = [Convert]::ToHexString($bytes).ToLower()
$token
```

Guarda ese valor. No lo subas a GitHub.

## 3. Crear credential en n8n

1. Credentials > New Credential.
2. Busca **Bearer Auth**.
3. Nombre: `STECH Backend Webhook Bearer`.
4. En **Bearer Token** pega SOLO el token, sin escribir `Bearer `.
5. Guarda.
6. Abre `01 Webhook Backend Events` y selecciona esa credential.

n8n validará automáticamente `Authorization: Bearer <token>` antes de ejecutar el workflow.

## 4. Probar con Test URL

1. Abre `01 Webhook Backend Events`.
2. Pulsa **Listen for Test Event**.
3. Copia la Test URL. Normalmente termina en:

```text
/webhook-test/stech-backend-events
```

4. En `backend/.env`:

```env
N8N_MODE=n8n
N8N_WEBHOOK_URL=PEGA_AQUI_LA_TEST_URL
N8N_WEBHOOK_TOKEN=PEGA_AQUI_EL_MISMO_TOKEN
N8N_STRICT=false
```

5. Desde `backend/` ejecuta:

```powershell
npm run test:n8n
```

Esperado:

```text
HTTP 202
accepted=true
PASS: backend -> n8n gateway respondió 202 accepted=true
```

## 5. Probar el backend conversando

Con OpenAI/SQL ya configurados:

```powershell
npm run chat
```

Después de un turno revisa `debug.automation`. Debe mostrar:

```json
{ "delivered": true }
```

## 6. Pasar a Production URL

Cuando la prueba sea correcta:

1. Publica/activa SOLO este workflow gateway.
2. Copia la Production URL, normalmente:

```text
/webhook/stech-backend-events
```

3. Reemplaza `N8N_WEBHOOK_URL` en `.env`.
4. Reinicia el backend.

## Seguridad

- No hay token dentro del JSON exportado.
- El secreto vive en n8n Credentials y en el `.env` del backend.
- El workflow guarda errores, pero no guarda ejecuciones exitosas por defecto (`saveDataSuccessExecution=none`).
- `N8N_STRICT=false` evita que una caída de n8n destruya un turno ya procesado por el backend.

# Conexiones reales — STECH Backend

El backend trabaja real-first. Los adapters fake existen únicamente para `STECH_PROFILE=test` y pruebas automatizadas.

## 1. OpenAI / LLM

```env
LLM_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

El backend usa `POST /v1/responses`. Precio, stock y demás datos dinámicos provienen de evidencia determinística; el LLM redacta y no es autoridad de esos datos.

## 2. ERP / SQL por bridge n8n

Para el entorno actual de STECH se reutiliza el bridge SQL que ya funciona con la credencial Microsoft SQL configurada en n8n:

```env
ERP_MODE=sql-bridge
SQL_BRIDGE_URL=https://.../webhook/stech-sql-bridge-v2
SQL_BRIDGE_TOKEN=...
SQL_CATALOG_PROCEDURE=dbo.sp_BuscarProductosVenta
```

El backend envía `EXEC dbo.sp_BuscarProductosVenta ...` al bridge. No necesita credenciales SQL Server directas cuando `ERP_MODE=sql-bridge`.

## 3. Persistencia Supabase real

```env
PERSISTENCE_MODE=supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_SESSION_TABLE=ia_sesiones
SUPABASE_CONTEXT_TABLE=ia_contexto
SUPABASE_CONVERSATION_TABLE=ia_conversaciones
```

Contrato real utilizado:

- `ia_sesiones`: garantiza que exista la sesión antes de escribir datos relacionados.
- `ia_contexto.contexto`: memoria canónica JSONB del backend; también proyecta `ultima_intencion` y `presupuesto_activo`.
- `ia_conversaciones`: cada turno comienza insertando `mensaje_cliente` con `respuesta_bot=NULL`; al terminar el procesamiento se actualiza la misma fila con `respuesta_bot`, `intencion`, `producto_detectado`, `presupuesto_detectado` y `cambio_producto_explicito`.

Esto preserva el mensaje del cliente incluso si OpenAI o una dependencia posterior falla antes de producir respuesta.

## 4. RAG

Por ahora mantener:

```env
RAG_MODE=disabled
```

El RAG existente de Supabase usa embeddings y RPCs con un contrato distinto al adapter inicial. Se habilitará después de adaptar ese contrato; no debe encenderse todavía solo cambiando el `.env`.

## 5. n8n Event Gateway

Este webhook es independiente del SQL Bridge:

```env
N8N_MODE=n8n
N8N_WEBHOOK_URL=https://.../webhook/stech-backend-events
N8N_WEBHOOK_TOKEN=...
N8N_STRICT=false
```

Con `N8N_STRICT=false`, un fallo temporal del gateway de eventos no invalida un turno que ya fue procesado y persistido.

## 6. Verificación

```powershell
npm install
npm test
npm run build
npm start
```

El arranque esperado para la configuración actual es:

```text
Modes: LLM=openai ERP=sql-bridge Persistence=supabase n8n=n8n
```

Prueba de turno:

```powershell
$body = @{ sessionId='qa-supabase-001'; message='¿Cuánto cuesta el Armor X13?' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/chat -ContentType 'application/json' -Body $body
```

Luego verificar `qa-supabase-001` en `ia_sesiones`, `ia_contexto` e `ia_conversaciones`.

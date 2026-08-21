# Conexiones reales — STECH Backend

El backend trabaja real-first. Los adapters fake existen únicamente para `STECH_PROFILE=test` y pruebas automatizadas.

## 1. OpenAI / LLM

```env
LLM_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

El backend usa `POST /v1/responses`. Precio, stock y demás datos dinámicos provienen de evidencia determinística; el LLM redacta y no es autoridad de esos datos.

La respuesta interna del adapter conserva el modelo real, tokens de entrada/salida/total, tokens cacheados cuando OpenAI los informa y duración de la llamada. No se guardan API keys, cabeceras Authorization ni prompts ocultos en la telemetría.

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
SUPABASE_TOKEN_METRICS_TABLE=ia_metricas_tokens
```

Contrato real utilizado:

- `ia_sesiones`: garantiza que exista la sesión antes de escribir datos relacionados. Las sesiones `qa-*` usan `canal='qa_live'`.
- `ia_contexto.contexto`: memoria canónica JSONB del backend; también proyecta `ultima_intencion` y `presupuesto_activo`.
- `ia_conversaciones`: cada turno comienza insertando `mensaje_cliente` con `respuesta_bot=NULL`; al terminar se actualiza la misma fila con respuesta, intención, producto, presupuesto y modelo LLM. Las pruebas QA guardan `message_id`, `request_id` y `tipo_conversacion='QA_LIVE'`.
- `ia_metricas_tokens`: una fila por llamada LLM con sesión, turno, ruta/intención, modelo, tokens y duración.

`ia_conversaciones.request_id` es globalmente UNIQUE. Por eso Live QA usa el `messageId` completo de cada turno como `request_id`; el `runId` agrupa la corrida en el reporte, pero nunca se reutiliza como `request_id` entre turnos.

Esto preserva el mensaje del cliente incluso si una dependencia posterior falla antes de producir respuesta. La telemetría es **best-effort**: si falla únicamente la escritura en `ia_metricas_tokens`, el turno comercial continúa, queda observable en `debug.telemetry` y Live QA lo clasifica como YELLOW; medir tokens nunca debe bloquear una venta.

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

Con `N8N_STRICT=false`, un fallo temporal del gateway de eventos no invalida un turno ya procesado y persistido. Live QA lo reporta como YELLOW para no confundir una falla de integración con una respuesta comercial/factual incorrecta.

## 6. Live QA en dos terminales

Terminal 1 mantiene el backend real:

```powershell
npm start
```

Terminal 2 ejecuta por defecto **journeys conversacionales reales** de 6–10 turnos por sesión:

```powershell
npm run qa:live
```

Suites disponibles:

```powershell
npm run qa:live          # journeys largos de ventas (suite principal)
npm run qa:live:core     # micro-regresiones técnicas rápidas
npm run qa:live:all      # journeys + core
```

Los journeys principales incluyen: trabajador de construcción, comparación Armor X13 vs Armor 22, compra personal con presupuesto/objeción, compra institucional para un equipo, políticas previas a compra, estrés de referencias y seguridad ante producto no reconocido.

Configuración opcional:

```env
QA_BASE_URL=http://127.0.0.1:3000
QA_STRICT=false
```

`QA_STRICT=false` ejecuta todos los escenarios aunque encuentre RED. `QA_STRICT=true` conserva la ejecución completa pero devuelve exit code 1 cuando existen escenarios RED.

Cada corrida genera un `runId` `qa-YYYYMMDD-HHmmss-xxxx`; cada journey tiene una sesión distinta y cada turno un `messageId/request_id` determinístico y único. Los reportes locales quedan en `backend/qa-results/<runId>.json` y `.md`; esa carpeta está ignorada por git.

El runner evalúa por separado:

- hard gates: HTTP, intent, referencia, producto activo, switch, presupuesto y consistencia de precio/stock contra la evidencia ERP recibida;
- commercial gates: exceso de preguntas, longitud, lenguaje robótico/meta, empatía ante objeción, ausencia de NBA, contexto del cliente, persistencia de telemetría y delivery n8n;
- telemetría: tokens y latencia por turno y agregados por corrida.

Los YELLOW/RED son evidencia para buscar causa raíz; el runner no modifica automáticamente la lógica del bot.

## 7. Verificación y trazabilidad

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

Con el backend corriendo, en otra terminal:

```powershell
npm run qa:live
```

Para localizar una sesión QA en Supabase, usa el `sessionId` mostrado en la tabla del runner:

```sql
select session_id, canal, estado, fecha_inicio
from ia_sesiones
where session_id = 'PEGA_SESSION_ID_QA';

select session_id, ultima_intencion, presupuesto_activo, contexto, updated_by, updated_at
from ia_contexto
where session_id = 'PEGA_SESSION_ID_QA';

select session_id, message_id, request_id, mensaje_cliente, respuesta_bot,
       intencion, producto_detectado, presupuesto_detectado, modelo, fecha
from ia_conversaciones
where session_id = 'PEGA_SESSION_ID_QA'
order by fecha;

select session_id, turno, nodo, ruta, modelo,
       tokens_entrada, tokens_salida, tokens_cacheados, duracion_ms, message_id, creado_en
from ia_metricas_tokens
where session_id = 'PEGA_SESSION_ID_QA'
order by creado_en;
```

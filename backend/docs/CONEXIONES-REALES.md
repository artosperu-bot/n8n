# Conexiones reales — STECH Backend

El arranque normal de v0.2 es **real-first**. Los adapters fake existen únicamente para `STECH_PROFILE=test` y pruebas automatizadas.

## 1. OpenAI / LLM

Configurar en `.env`:

```env
LLM_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

El backend usa `POST /v1/responses` de OpenAI. La evidencia determinística (precio/stock/etc.) se entrega al redactor y el LLM no es autoridad de datos dinámicos.

**No pegar la API key en GitHub, issues, commits ni chats.** Guardarla en `.env` local o en el secret manager del servidor donde se despliegue.

## 2. SQL Server directo

Configurar:

```env
ERP_MODE=sqlserver
SQL_SERVER_HOST=PC020
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=DB_ST
SQL_SERVER_USER=...
SQL_SERVER_PASSWORD=...
SQL_SERVER_ENCRYPT=false
SQL_SERVER_TRUST_CERT=true
SQL_CATALOG_PROCEDURE=dbo.sp_BuscarProductosVenta
```

El backend usa un pool `mssql`/Tedious y reutiliza el procedimiento autoritativo que ya usa STECH:

```sql
EXEC dbo.sp_BuscarProductosVenta
  @TextoBusqueda = ...,
  @CategoriaCodigo = NULL,
  @SubcategoriaCodigo = NULL,
  @SoloConStock = 0,
  @MaxResultados = ...;
```

Para una cotización/producto, `@TextoBusqueda` recibe el producto o código resuelto y `@MaxResultados=20`.

Para una consulta por presupuesto, se reutiliza el mismo SP con `@TextoBusqueda=NULL` y `@MaxResultados=100`; después el backend filtra únicamente filas con precio autoritativo `precio <= presupuesto`. No existe ni se requiere `@maxBudget` en SQL Server.

### Contrato de salida aceptado

El mapper acepta estos aliases:

- producto: `product`, `producto`, `nombre` o `nombre_corto`
- código: `productCode`, `producto_codigo` o `codigo`
- precio: `price` o `precio`
- stock: `stock`
- moneda: `currency` o `moneda` (si falta, PEN)

## 3. n8n como capa de eventos

Configurar:

```env
N8N_MODE=n8n
N8N_WEBHOOK_URL=https://.../webhook/stech-backend-events
N8N_WEBHOOK_TOKEN=...
N8N_STRICT=false
```

Eventos actuales:

- `conversation.turn.completed`
- `purchase.intent`
- `handoff.requested`
- `notification.requested`

Con `N8N_STRICT=false`, una caída temporal de n8n no destruye el turno ya procesado por el backend. El resultado del delivery queda observable en `debug.automation`.

## 4. Información que falta para conexión real

No enviar contraseñas al repositorio. Solo faltan en el runtime:

1. SQL Server host/IP y puerto.
2. Base de datos.
3. Usuario SQL de aplicación con permisos mínimos.
4. Password como secreto de runtime.
5. OpenAI API key como secreto de runtime.
6. Modelo OpenAI habilitado.
7. URL/token del webhook n8n dedicado al backend.

El procedimiento SQL ya está definido: `dbo.sp_BuscarProductosVenta`.

## 5. Verificación

```powershell
Copy-Item .env.example .env
# editar .env con los secretos solo en tu máquina/servidor
npm install
npm test
npm run build
npm start
```

Luego:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Y un turno:

```powershell
$body = @{ sessionId='real-001'; message='¿Cuánto cuesta el Armor 22?' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/chat -ContentType 'application/json' -Body $body
```

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
```

El adapter usa un pool de `mssql`/Tedious. Además necesita dos procedimientos almacenados (o wrappers) porque el backend no debe inventar el esquema de tu ERP:

```env
SQL_QUOTE_PROCEDURE=dbo.<procedimiento_cotizacion>
SQL_BUDGET_PROCEDURE=dbo.<procedimiento_presupuesto>
SQL_PRODUCT_PARAMETER=product
SQL_BUDGET_PARAMETER=maxBudget
```

### Contrato de salida esperado

Cotización: una fila. Presupuesto: cero o más filas.

El mapper acepta estos aliases:

- producto: `product`, `producto` o `nombre`
- código: `productCode`, `producto_codigo` o `codigo`
- precio: `price` o `precio`
- stock: `stock`
- moneda: `currency` o `moneda` (si falta, PEN)

## 3. n8n obligatorio como capa de eventos

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

## 4. Qué información falta para conectar el entorno real

No necesito que envíes contraseñas al repositorio. Para completar la conexión necesitamos definir en el servidor donde correrá el backend:

1. SQL Server host/IP y puerto.
2. Base de datos.
3. Usuario SQL de aplicación con permisos mínimos necesarios.
4. Password como secreto de runtime.
5. Nombre real de SP de cotización y parámetro.
6. Nombre real de SP de filtro por presupuesto y parámetro.
7. OpenAI API key como secreto de runtime.
8. Modelo OpenAI habilitado para la cuenta.
9. URL/token del webhook n8n dedicado al backend.

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

# Configuración STECH Backend v0.2

La configuración normal ya NO es fake. `.env.example` arranca en perfil `real` y exige conexiones reales.

## 1. OpenAI

```env
STECH_PROFILE=real
LLM_MODE=openai
OPENAI_API_KEY=REEMPLAZAR_OPENAI_API_KEY
OPENAI_MODEL=REEMPLAZAR_MODELO_OPENAI
```

Owner: `src/adapters/openai/OpenAIProvider.ts`.

Usa OpenAI Responses API. El LLM redacta desde evidencia; no es autoridad de precio/stock.

## 2. SQL Server directo

```env
ERP_MODE=sqlserver
SQL_SERVER_HOST=REEMPLAZAR_HOST_O_IP_SQLSERVER
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=REEMPLAZAR_BASE_DATOS
SQL_SERVER_USER=REEMPLAZAR_USUARIO_SQL
SQL_SERVER_PASSWORD=REEMPLAZAR_PASSWORD_SQL
SQL_SERVER_ENCRYPT=false
SQL_SERVER_TRUST_CERT=true
SQL_QUOTE_PROCEDURE=REEMPLAZAR_PROCEDIMIENTO_COTIZACION
SQL_BUDGET_PROCEDURE=REEMPLAZAR_PROCEDIMIENTO_PRESUPUESTO
SQL_PRODUCT_PARAMETER=product
SQL_BUDGET_PARAMETER=maxBudget
```

Owner: `src/adapters/sqlserver/SqlServerErpRepository.ts`.

No se inventan tablas. Los SP deben devolver aliases documentados en `CONEXIONES-REALES.md`.

## 3. n8n webhook

```env
N8N_MODE=n8n
N8N_WEBHOOK_URL=REEMPLAZAR_WEBHOOK_N8N
N8N_WEBHOOK_TOKEN=REEMPLAZAR_TOKEN_WEBHOOK_N8N
N8N_STRICT=false
```

Owner: `src/adapters/n8n/N8nAutomationBus.ts`.

## 4. Estado/RAG por ahora

```env
PERSISTENCE_MODE=memory
RAG_MODE=disabled
```

Supabase puede activarse después sin cambiar ConversationEngine.

## 5. QA local

Los fakes están reservados al perfil de test:

```env
STECH_PROFILE=test
```

No uses `STECH_PROFILE=test` como configuración productiva.

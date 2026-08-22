# STECH Backend v0.2

> **REAL-FIRST:** el arranque normal usa OpenAI + SQL Server directo + webhook n8n. Los adapters fake quedan reservados a `STECH_PROFILE=test`. Ver `docs/CONEXIONES-REALES.md`.

Backend modular para migrar gradualmente lógica determinística del agente STECH desde n8n hacia código, manteniendo n8n como capa de eventos, automatizaciones e integraciones.

## Runtime normal

```text
Cliente / React / WhatsApp
          |
          v
     STECH Backend
      /    |    \
     v     v     v
 OpenAI  SQL   n8n webhook
          |
          v
       ERP truth
```

- `LLM_MODE=openai`
- `ERP_MODE=sqlserver`
- `N8N_MODE=n8n`
- `PERSISTENCE_MODE=memory` en esta etapa
- `RAG_MODE=disabled` hasta conectar Supabase/RAG

## Qué funciona

- `POST /api/chat`.
- Sesiones y estado conversacional.
- Presupuesto separado de objeción de precio y SPIN.
- Resolución inicial de producto/referente y explicit switch.
- SQL Server directo mediante pool `mssql` y procedimientos configurables.
- OpenAI Responses API para redacción.
- Webhook n8n fail-soft/strict.
- Persistencia memory o Supabase configurable.
- RAG disabled/fake(test)/Supabase configurable.
- Chat CLI, smoke test y regresiones automáticas.

## Requisitos

- Node.js 22.16 o superior.
- `npm install` para instalar `mssql`.

## Inicio real

```powershell
Copy-Item .env.example .env
# Edita .env con SQL, OpenAI y n8n. No subas .env.
npm install
npm test
npm run build
npm start
```

## QA local sin credenciales

Los fakes ya no son el default. Para QA:

```powershell
$env:STECH_PROFILE='test'
npm test
npm run smoke
```

O usa `.env.test.example`.

## Seguridad

Nunca committear `.env`, OpenAI keys, passwords SQL, service-role keys, tokens n8n ni datos de clientes.

## Paridad

Esta rama no afirma paridad 1:1 con el workflow live hasta ejecutar shadow QA backend vs n8n con las mismas entradas, estado persistido y respuesta real.

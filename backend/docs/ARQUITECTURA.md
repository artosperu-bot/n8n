# Arquitectura Backend STECH v0.2

```text
React / WhatsApp / CLI
         |
         v
+--------------------------+
|      STECH BACKEND       |
|  Node HTTP API           |
|  ConversationEngine      |
+----+----------+-----------+
     |          |              \
     v          v               v
 Persistence  SQL Server      OpenAI
 memory/      directo         Responses API
 Supabase       |
                v
              ERP truth

     +-------------------------------+
                                     |
                                     v
                              AutomationBus
                                     |
                                     v
                                    n8n
                         webhooks / alerts / jobs
```

## Owners

- Backend: lógica determinística y estado canónico migrado.
- SQL/ERP: precio, stock, disponibilidad y verdad operativa.
- OpenAI: interpretación/redacción desde evidencia, no verdad dinámica.
- Supabase: persistencia/RAG cuando se active.
- n8n: eventos, notificaciones, integraciones y automatizaciones.

El perfil normal es real-first. Fake adapters solo existen para QA aislado con `STECH_PROFILE=test`.

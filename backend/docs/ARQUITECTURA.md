# Arquitectura Backend STECH v0.2

> Runtime authority: `HybridConversationEngine`. `ConversationEngine.ts` is legacy compatibility code and is not the engine built by `bootstrap.ts` for `/api/chat`.

```text
React / WhatsApp / CLI
         |
         v
+-----------------------------+
|       STECH BACKEND         |
|  Node HTTP API              |
|  HybridConversationEngine   |
+----+-----------+-------------+
     |           |               \
     v           v                v
 Persistence  SQL Server        OpenAI
 memory/      directo           Responses API
 Supabase        |
                 v
               ERP truth

     +--------------------------------+
                                      |
                                      v
                               AutomationBus
                                      |
                                      v
                                     n8n
                          webhooks / alerts / jobs
```

## Owners

- Backend / `HybridConversationEngine`: orquestación determinística, estado canónico y decisión comercial final validada.
- SQL/ERP: precio, stock, catálogo, identidad operativa e imágenes.
- Product RAG: hechos técnicos de producto aislados por `productRagId` y sección.
- Institutional RAG: políticas, garantía, envío, pagos y tienda.
- OpenAI: interpretación y redacción desde evidencia/contratos; no verdad dinámica ni autoridad factual.
- Supabase: persistencia y RAG; `ia_contexto` es estado vigente y `ia_conversaciones` historia por turno.
- n8n: eventos, notificaciones, integraciones y automatizaciones fail-soft; no decide la respuesta comercial.

## Jerarquía documental

1. `STECH_CONVERSATION_COMMERCIAL_CONTRACT.md` — autoridad funcional comercial.
2. `STECH_BACKEND_AUTHORITY.md` — autoridad factual, integración y seguridad.
3. `CONVERSATION-CODE-AUTHORITY-MAP.md` — mapa del código real y conflictos.
4. `SPIN-FAB-N1-POLITICA-COMERCIAL.md` — complemento solo donde no contradiga el contrato principal.
5. Planes, auditorías y reportes LIVE-QA — evidencia histórica; no redefinen el contrato por sí solos.

El perfil normal es real-first. Fake adapters solo existen para QA aislado con `STECH_PROFILE=test`.

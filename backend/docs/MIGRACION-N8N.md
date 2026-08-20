# Migración gradual desde n8n

## Mapeo inicial

| n8n conceptual | Backend |
|---|---|
| 04 Preparar Turno | `ConversationEngine` |
| 06 Resolver Turno y Estado | `IntentResolver` + `BudgetResolver` |
| 06B Contexto comparación | `ReferenceResolver` |
| 09 Ejecutar SQL | `ErpRepository` |
| 10 Normalizar SQL/Producto | adapter ERP |
| 12 RAG | `RagRepository` |
| 16 Redactor | `LlmProvider` |
| 17 Reducir Estado | `StateReducer` |
| 17A recomendación | evolucionará a `RecommendationEngine` |
| 23 persistencia | `ConversationRepository` |
| 25 salida | HTTP API |

## Qué se queda en n8n

- Webhooks externos.
- Notificaciones.
- Jobs programados.
- Integraciones SaaS.
- Handoff y alertas.
- Campañas/procesos administrativos.

## Shadow mode recomendado

Para cada mensaje QA:

```text
                 mensaje
                   |
        +----------+----------+
        v                     v
      n8n actual          backend nuevo
        |                     |
        +----------+----------+
                   v
                 DIFF
```

Comparar como mínimo: `activeProduct`, `queryTarget`, `explicitSwitch`, `budget`, `intent`, `recommendedProduct`, `NBA`, estado persistido y respuesta real.

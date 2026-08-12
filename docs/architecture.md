# Arquitectura — STECH Chatbot

## Separación de responsabilidades

GitHub es control de ingeniería, no runtime.

El runtime productivo se distribuye entre:

1. **n8n** — orquestación del turno, routing, integración SQL/RAG/LLM y persistencia.
2. **Supabase** — estado conversacional, CRM, RAG y primitivas de concurrencia.
3. **SQL/ERP** — precio, stock, imágenes, reservas y catálogo operacional.
4. **LLM/RAG** — interpretación y redacción bajo evidencia autorizada.

## Política de cambios

Todo cambio de producción debe tener, antes de aplicarse:

- baseline identificable;
- snapshot sanitizado;
- migración versionada;
- rollback versionado;
- pruebas definidas;
- secret scan;
- changelog;
- evidencia de ejecución.

Los secretos se mantienen fuera del repositorio. Los snapshots preservan estructura y expresiones, pero sustituyen valores sensibles por placeholders explícitos.

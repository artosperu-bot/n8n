# STECH Chatbot Engineering

Este repositorio versiona la ingeniería del chatbot STECH.

## Runtime

- n8n
- Supabase
- SQL/ERP
- LLM/RAG

## GitHub / control de ingeniería

Este repositorio está destinado a contener:

- snapshots **sanitizados** de workflows;
- migraciones SQL y rollback;
- pruebas y matrices de regresión;
- documentación de arquitectura, ownership e incidentes;
- changelog técnico.

**GitHub no contiene secretos de producción.**

Los archivos SQL bajo `sql/supabase/migrations/` son cambios preparados. No deben aplicarse a producción hasta revisión, captura del DDL baseline correspondiente y aprobación explícita.

## Baseline protegido

- Workflow: `STECH Ventas Consultivas`
- Workflow ID: `c661Gw0xoqZBsNtf`
- Baseline: `V45.68`
- Version ID: `dd01b10a-60e6-4412-903b-b21c7f3e577a`

Durante la fase de preparación de infraestructura, el workflow productivo y las RPC productivas permanecen sin cambios.

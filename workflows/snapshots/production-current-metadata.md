# Production workflow — sanitized metadata

## Identity

- Name: `STECH Ventas Consultivas`
- Workflow ID: `c661Gw0xoqZBsNtf`
- Historical baseline: `V45.68`
- Historical baseline version ID: `dd01b10a-60e6-4412-903b-b21c7f3e577a`
- P0 hardened production line documented as: `V45.70`

## Current engineering status — 2026-08-17

- P0 concurrency: CLOSED / FROZEN
- P1 foundation: CLOSED
- P2.1: ACTIVE / NOT CLOSED
- Current T6 fix draft published to production: **NO**

## Known important nodes

`04 Preparar Turno`, `04J`, `06 Resolver Turno y Estado`, `06B Rehidratar Contexto Comparación`, `06C Consumir Criterio Pendiente`, `09 Ejecutar SQL`, `10 Normalizar SQL y Producto`, `12 RAG Producto`, `12A Leer Capacidades Producto`, `15C Acumular Evidencia Comercial`, `15D Consolidar Evidencia Base`, `16 Redactor Comercial Final`, `17 Validar y Reducir Estado`, `17A`, `17B`, `21`, `22C1 Verificar Renew — Pre Persist`, `23 Guardar Conversación`, `25 Salida Final`, `QA TRACE — POST DECISION`.

## Protection

This file intentionally contains metadata only. It is not a raw n8n export and must not be used to reconstruct credentials. Production behavior must not be modified from this snapshot.

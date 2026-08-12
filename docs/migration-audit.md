# Supabase migration audit

## Objetivo

Determinar si existe infraestructura de migraciones antes de crear mecanismos propios para P0.

## Estado verificado

**INFRAESTRUCTURA EXISTENTE CONFIRMADA.**

La inspección read-only identificó, entre otras, las siguientes tablas de migración propias de subsistemas Supabase:

- `auth.schema_migrations`
- `realtime.schema_migrations`
- `storage.migrations`
- `supabase_migrations.schema_migrations`

Para cambios administrados por el tooling de Supabase, `supabase_migrations.schema_migrations` es la infraestructura relevante observada. Sus columnas inspeccionadas incluyen:

- `version`
- `statements[]`
- `name`
- `created_by`
- `idempotency_key`
- `rollback[]`

## Decisión

- **No crear `ia_schema_migrations` ahora.**
- No reutilizar las tablas de `auth`, `realtime` o `storage` para cambios del chatbot.
- No insertar manualmente filas en `supabase_migrations.schema_migrations` desde SQL Editor como parte del P0 sin diseñar explícitamente ese procedimiento.
- Mantener las migraciones y rollback versionados en Git como fuente de ingeniería mientras se define el flujo formal de despliegue.

## Nota de introspección

En la consulta de candidatos aparecieron también objetos índice con nombres como `*_pkey` / `*_key`. Son índices/constraints asociados y no deben interpretarse como tablas de migración independientes.

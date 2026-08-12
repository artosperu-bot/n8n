# Supabase migration audit

## Objetivo

Determinar si ya existe una infraestructura que registre como mínimo:

- migration version / migration name;
- change id o identificador equivalente;
- applied_at;
- rollback/status;
- checksum o integridad equivalente.

## Estado de verificación

**BLOCKED por alcance de acceso actual.**

La credencial Supabase accesible desde n8n permite operaciones del workflow, pero en esta fase no se dispone de introspección SQL/DDL directa para enumerar tablas internas y funciones de migración con garantías suficientes. No se infiere ausencia a partir de que el chatbot no las use.

## Política

No crear `ia_schema_migrations` hasta comprobar de forma explícita que no existe un equivalente.

Si no existe equivalente tras la inspección, la propuesta mínima es una única tabla aislada con:

- `id` / migration id;
- `migration_name`;
- `checksum`;
- `applied_at`;
- `applied_by`;
- `status`;
- `notes`.

No debe enlazarse con tablas de negocio ni modificar `ia_contexto`, `ia_conversaciones`, `ia_sesiones`, RAG, catálogo, CRM o métricas comerciales.

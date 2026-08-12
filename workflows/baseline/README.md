# Baseline workflow snapshots

Baseline protegido:

- Workflow: `STECH Ventas Consultivas`
- Workflow ID: `c661Gw0xoqZBsNtf`
- Version: `V45.68`
- Version ID: `dd01b10a-60e6-4412-903b-b21c7f3e577a`

## Estado del snapshot completo

**BLOCKED en esta preparación local.**

El conector n8n disponible permite leer la versión completa, pero no expone una operación que materialice/exporte esa respuesta como archivo. El export leído contiene autenticación sensible embebida, por lo que tampoco es aceptable guardar una copia bruta.

No se reconstruye manualmente el JSON porque eso podría omitir expresiones o parámetros y producir un falso snapshot.

## Procedimiento obligatorio cuando exista export materializable

1. Exportar exactamente la versión `dd01b10a-60e6-4412-903b-b21c7f3e577a`.
2. Guardar temporalmente fuera de Git.
3. Ejecutar `tests/security/secret_scan.py` sobre el export bruto.
4. Reemplazar secretos conservando el campo, por ejemplo `__SECRET_SQL_BRIDGE__`.
5. Repetir el secret scan sobre el archivo sanitizado.
6. Comparar estructura: número/nombre/id/tipo de nodos y conexiones no deben cambiar por la sanitización.
7. Solo entonces guardar como:
   `STECH_Ventas_Consultivas_V45.68.sanitized.json`.
8. Borrar de forma segura el export bruto local.

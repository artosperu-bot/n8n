# Sanitization map — V45.68

No contiene valores secretos; documenta únicamente dónde deben reemplazarse.

| Ubicación | Tipo | Placeholder recomendado | Acción |
|---|---|---|---|
| `09 Ejecutar SQL` → header `Authorization` | bearer / SQL bridge token | `Bearer __SECRET_SQL_BRIDGE__` | reemplazar valor sensible |
| `04G Catálogo para Saludo` → header `Authorization` | bearer / SQL bridge token | `Bearer __SECRET_SQL_BRIDGE__` | reemplazar valor sensible |
| `10B Ejecutar SQL Imágenes` → header `Authorization` | bearer / SQL bridge token | `Bearer __SECRET_SQL_BRIDGE__` | reemplazar valor sensible |
| `20 Registrar Reserva 24h` → header `Authorization` | bearer / SQL bridge token | `Bearer __SECRET_SQL_BRIDGE__` | reemplazar valor sensible |
| credenciales n8n referenciadas por nodos | credential reference, no secret material | conservar referencia si el export no incluye material secreto | verificar |
| webhook IDs / URLs operativas | identificador interno / endpoint | conservar solo si política interna lo permite | revisar antes de push |

Regla: nunca imprimir ni commitear el valor original detectado.

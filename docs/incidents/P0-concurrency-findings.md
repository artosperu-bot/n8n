# P0 — Hallazgos de concurrencia

Estado: **Safe Renew instalado y con permisos verificados; comportamiento pendiente de QA. Safe Release aún no aplicado.**

## Hallazgos confirmados

- TTL productivo actual: aproximadamente 120 s.
- Existen ejecuciones reales capaces de superar 120 s e incluso 180 s.
- `ia_persistir_turno_atomico` ya contiene fencing útil: valida lock, owner y lease vigente; debe preservarse.
- La función histórica `fn_ia_renovar_session_lock` **sí comprueba que el lease siga vigente**, por lo que no resucita directamente un lease ya expirado.
- Aun así, la renovación histórica es insuficiente para P0 porque puede acortar un lease y no valida `message_id`, owner de queue ni estado `PROCESSING`.
- `ia_liberar_turno` tiene un defecto crítico: puede permitir que una fila de `ia_turn_queue` pase de `PENDING` a `DONE` aunque el worker no haya adquirido/liberado correctamente el lock; un worker stale también podría intentar finalizar estados que no le corresponden.
- Los estados reales permitidos en `ia_turn_queue` son `PENDING`, `PROCESSING`, `DONE` y `FAILED`; no existe `QUEUED` como estado real.

## Decisión

No conectar la renovación histórica a producción. Usar la nueva RPC `ia_renovar_turno`, ya instalada y restringida a `postgres`/`service_role`, y someterla primero a QA conductual. No aplicar todavía el cambio de Safe Release ni modificar V45.68.

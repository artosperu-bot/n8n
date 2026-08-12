# P0 — Hallazgos de concurrencia

Estado: **documentado; fix no aplicado**.

## Hallazgos reproducidos en QA

- TTL productivo actual: 120 s.
- Existen ejecuciones capaces de superar ese TTL.
- `ia_persistir_turno_atomico` rechaza al owner stale y debe preservarse.
- La función histórica de renovación puede renovar después de expirar el lease; por tanto puede resucitar un owner vencido.
- La función histórica de renovación también puede acortar un lease si se invoca con una duración menor.
- `ia_liberar_turno` protege el lock de otro owner (`released=false`), pero se observó que puede marcar `DONE` la fila de cola del caller incluso cuando este nunca adquirió ownership.
- Un test QA mantuvo el mismo owner durante más de 180 s mediante renovaciones periódicas; esto demuestra la viabilidad del heartbeat, no la seguridad de la función histórica.

## Decisión

No reutilizar la renovación histórica. Preparar un contrato nuevo y corregir release antes de modificar el workflow productivo.

# State ownership y lease de sesión

## Autoridad de escritura

Una sesión solo puede tener un owner válido a la vez. El owner válido es la ejecución que posee un lease no vencido y cuya fila de cola correspondiente está en `PROCESSING`.

## Invariantes P0

- El lease vencido nunca puede revivirse mediante renovación.
- Un owner stale no puede persistir estado canónico.
- Un owner stale no puede liberar el lock vigente de otro owner.
- Una fila `PENDING` nunca puede pasar a `DONE` sin haber adquirido ownership.
- Una fila `FAILED` nunca puede volver a `DONE` por un worker stale.
- La renovación no puede acortar un lease todavía vigente.
- FIFO se valida por sesión y `message_id`.

## Componentes protegidos

`ia_persistir_turno_atomico` ya demostró fencing útil en QA y no debe reescribirse para esta corrección.

## Contrato futuro

La corrección P0 se limita a:

1. una RPC nueva `ia_renovar_turno` con fencing, validación de queue y no-resurrección;
2. una implementación atómica segura de `ia_liberar_turno`;
3. heartbeats en n8n solo después de aprobar y aplicar las RPC.

Estados reales confirmados de `ia_turn_queue`: `PENDING`, `PROCESSING`, `DONE`, `FAILED`.

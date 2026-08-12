# P0 Concurrency Test Matrix

No estado debe marcarse PASS hasta ejecutarse contra el candidato real aprobado.

| ID | Caso | Preparación | Resultado esperado | Estado |
|---|---|---|---|---|
| P0-01 | normal | N en head, sin lock previo | acquire → PROCESSING → persist → release → DONE | NOT RUN |
| P0-02 | >120 s | N mantiene trabajo >120 s y renueva antes del vencimiento | mismo owner; persist/release válidos | NOT RUN |
| P0-03 | >180 s | N mantiene trabajo >180 s con renovaciones periódicas | mismo owner; sin takeover | NOT RUN |
| P0-04 | N+1 | N posee lease; llega N+1 | N+1 permanece QUEUED/ocupado; no DONE | NOT RUN |
| P0-05 | N+2 | N posee lease; llegan N+1/N+2 | orden de cola preservado | NOT RUN |
| P0-06 | simultáneos | dos requests concurrentes misma sesión | un solo owner efectivo | NOT RUN |
| P0-07 | duplicate message_id | reenvío mismo message_id | idempotencia; no doble turno/escritura | NOT RUN |
| P0-08 | worker muerto | N deja de renovar | lease vence; siguiente head puede recuperar | NOT RUN |
| P0-09 | expired owner renew | owner intenta renovar después de vencer | `renewed=false`, `LEASE_EXPIRED`; no revive | NOT RUN |
| P0-10 | stale persist | B tomó ownership; A intenta persistir | A rechazado; estado B intacto | NOT RUN |
| P0-11 | stale release | B tomó ownership; A intenta release | `released=false`; lock/queue B intactos | NOT RUN |
| P0-12 | release sin acquire | N+1 nunca adquirió y llama release | `released=false`; N+1 sigue QUEUED, nunca DONE | NOT RUN |
| P0-13 | FAILED/LOCK_EXPIRED stale release | turno previo ya falló/expiró | no transición a DONE | NOT RUN |
| P0-14 | renew no acorta | lease actual vence después de now()+ttl solicitado | locked_until no disminuye | NOT RUN |
| P0-15 | owner mismatch renew | owner distinto intenta renovar | `renewed=false`, owner actual intacto | NOT RUN |
| P0-16 | queue owner mismatch | lock owner coincide pero queue owner no | renovación/liberación rechazadas | NOT RUN |
| P0-17 | queue status != PROCESSING | QUEUED/DONE/FAILED | renovación/liberación rechazadas | NOT RUN |
| P0-18 | recovery FIFO | N expira; N+1 toma; luego N+2 | N+1 antes que N+2; sin saltos | NOT RUN |

## Evidencia mínima por ejecución

Registrar sin secretos:

- session_id QA;
- message_id;
- owner lógico;
- estado queue antes/después;
- locked_until antes/después;
- attempts / started_at / finished_at;
- resultado RPC (`reason` incluido);
- execution IDs de n8n;
- timestamp UTC.

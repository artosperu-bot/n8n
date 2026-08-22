# Cómo probar el bot desde el backend

## Opción A — Chat interactivo

```powershell
npm run chat
```

Prueba esta secuencia:

1. `Hola, estoy viendo el Armor 22`
2. `¿Cuánto cuesta?`
3. `Podría gastar hasta S/ 1,500.`
4. `¿Cuál entra en mi presupuesto?`
5. `Me quedo con ese, quiero comprarlo.`
6. `/state`
7. `/exit`

El CLI muestra respuesta y debug: intent, query target, budget, explicit switch y entrega n8n.

## Opción B — Smoke automático con webhook n8n simulado

```powershell
npm run smoke
```

Levanta internamente un receptor HTTP que simula n8n, ejecuta 5 turnos y exige que los 5 eventos lleguen. El último debe ser `purchase.intent`.

## Opción C — Servidor API

```powershell
npm run start
```

POST:

```json
{
  "sessionId": "qa-001",
  "message": "¿Cuánto cuesta?"
}
```

Endpoint: `POST /api/chat`.

Consulta sesión: `GET /api/sessions/qa-001`.

Reinicia sesión: `DELETE /api/sessions/qa-001`.

## Qué NO significa un PASS local

Un PASS local demuestra que el backend ejecuta sus contratos y adapters. No certifica paridad total con n8n productivo. Para eso se necesita shadow QA con las mismas entradas y comparación de estado/respuesta final.

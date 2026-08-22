# STECH Backend Authority — estado operativo

Actualizado: 2026-08-22

## Alcance

Este documento describe el contrato operativo actual del backend. No sustituye migraciones, contratos SQL ni configuración segura del entorno.

## Jerarquía documental

1. `STECH_CONVERSATION_COMMERCIAL_CONTRACT.md` — autoridad funcional comercial aprobada.
2. `STECH_BACKEND_AUTHORITY.md` — autoridad factual, integración y seguridad.
3. `CONVERSATION-CODE-AUTHORITY-MAP.md` — implementación real, ownership y conflictos.
4. `SPIN-FAB-N1-POLITICA-COMERCIAL.md` — complemento únicamente donde no contradiga el contrato comercial principal.
5. Planes, auditorías y reportes LIVE-QA — evidencia histórica; no redefinen por sí solos el contrato vigente.

Cuando dos documentos se contradigan, prevalece el de mayor nivel en esta jerarquía.

## Runtime

- `/api/chat` usa `HybridConversationEngine` construido por `bootstrap.ts`.
- `ConversationEngine.ts` es código legacy/compatibilidad y no es autoridad de comportamiento del runtime actual.

## Autoridades

- Precio, stock, catálogo e imágenes: SQL Server mediante procedimientos permitidos.
- Identidad técnica de producto: `productRagId` proveniente de SQL.
- Hechos técnicos: RAG de producto, aislado por `productRagId` y sección.
- Políticas, garantía, envío, pagos y tienda: RAG institucional.
- Estado conversacional: repositorio configurado (`memory` o Supabase).
- Planner y writer: orientan interpretación/redacción; no crean hechos ni cambian autoridades.
- n8n: automatización posterior, fail-soft; no decide la respuesta comercial.

## Identidad y referencias

- Una mención canónica del mensaje actual gana sobre referencias y recomendaciones anteriores.
- Mencionar otro producto no cambia por sí solo `activeProduct` ni `selectedProduct`.
- Una segunda mención puede crear `comparisonProducts` y usar ese producto como `queryTarget` del turno.
- Una preferencia o selección explícita puede cambiar el producto activo/seleccionado.
- `el otro` se resuelve dentro del par de comparación conservado.
- Un producto desconocido nunca se vuelve producto autoritativo ni selección implícita.
- Una recuperación explícita hacia un producto válido restablece `queryTarget` y `activeProduct` con la identidad SQL actual.

## Recomendaciones

- Presupuesto máximo se persiste y filtra candidatos antes del ranking técnico.
- Precio solo participa como criterio cuando el cliente expresó presupuesto o preferencia por precio.
- Un ganador requiere evidencia diferenciadora suficiente.
- Sin ganador pueden presentarse alternativas neutrales y pedirse un criterio útil.
- El orden de catálogo no desempata ni cambia silenciosamente `activeProduct`.
- `winner`, `winnerReason`, candidatos y criterios quedan en el trace de decisión.
- Catálogo existente, disponibilidad, elegibilidad y ranking son conceptos distintos: un producto sin stock puede existir en catálogo aunque no sea elegible como ganador inmediato.

## Compra y reserva

- Interés condicional (`si está disponible me interesa`) registra interés, no compra confirmada.
- Compra explícita de una unidad inicia captura local segura de documento, nombre y dirección.
- Una etapa de reserva solo posee el turno si el mensaje es compatible con el campo esperado o ejecuta una operación explícita de reserva.
- Una intención válida ajena a la captura vuelve al pipeline normal y conserva la etapa pendiente, salvo abandono/cancelación explícita.
- Solicitud humana o compra de varias unidades usa handoff asistido.
- `dbo.sp_IA_RegistrarReserva24h_Idempotente` permanece bloqueado: no se inventa firma, no se ejecuta y no se simula éxito.

## Respuestas y evidencia

- Precio/stock usan respuestas deterministas basadas en SQL.
- Stock al cliente se expresa como disponibilidad, sin cantidad cruda.
- Evidencia interna y texto mostrable son capas distintas: un bloque RAG crudo, metadata de documento o envelope de indexación nunca es una respuesta lista para cliente.
- El writer solo puede usar productos y hechos permitidos.
- Cifras técnicas con unidad deben coincidir exactamente con evidencia autoritativa; no se redondean.
- Montos institucionales respaldados, como umbrales de envío, no se clasifican como precio de producto.
- Las listas de chat se normalizan a máximo tres viñetas simples.

## N+1 comercial

Contrato vigente:

```text
N = resolver correctamente la pregunta/intención actual
+1 = exactamente una continuación relacionada, útil y ejecutable
```

- `LOW` usa N+1 ligero; no implica pregunta ni intención de compra.
- `MEDIUM` usa continuación consultiva.
- `HIGH` usa progresión comercial más fuerte.
- Compra explícita usa el siguiente paso real de compra/reserva.
- `ANSWER_ONLY` es excepcional cuando no existe una continuación segura/útil, cuando avanzar exigiría fabricar datos/capacidades, ante una denegación de capability, estado terminal o cuando avanzar sería engañoso.
- `ASK_MISSING_FACT` solo puede llegar al cliente cuando `UNKNOWN && DECISION_IMPACT && CAN_CONSUME_ANSWER`.
- N+1 nunca puede omitir, sustituir o distorsionar N.
- Un enum interno no acredita por sí solo que el N+1 fue entregado: la continuación debe ser visible cuando corresponde.
- No se repite discovery ya conocido ni se regresa a SPIN durante compra.

## Observabilidad

- Eventos `STECH_*`: evento crudo, sanitización única, consola segura y máximo una fila JSONL.
- Llamadas de consola que no son `STECH_*` permanecen sin cambios.
- Métricas Supabase distinguen `SemanticPlanner` y `CommercialWriter` por `(message_id, nodo)`.
- Reintentos de métricas conservan `resolution=ignore-duplicates`.
- Fallos de telemetría y n8n son YELLOW/fail-soft y no convierten una respuesta correcta en RED.

## Estado de integraciones locales

- Supabase: contrato e índice de telemetría validados en modo read-only; no se aplicaron cambios de esquema.
- n8n: webhook configurado con Bearer Auth; `N8N_WEBHOOK_TOKEN` debe existir localmente para ejecutar el smoke.
- Producción y workflows n8n no se modifican desde este repositorio durante QA local.

## QA

- Tests unitarios e integración protegen referencia, estado, reserva, evidencia, N+1, telemetría y estilo.
- `npm run qa:golden100` no se ejecuta automáticamente.
- La certificación final usa QA CORE conversacional local ejecutado externamente por el usuario y revisión de la respuesta visible, además de estado/debug.
- GitHub Actions no es autoridad para QA conversacional live.

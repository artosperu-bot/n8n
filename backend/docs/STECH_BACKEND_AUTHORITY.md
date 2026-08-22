# STECH Backend Authority — estado operativo

Actualizado: 2026-08-22

## Alcance

Este documento describe el contrato operativo actual del backend. No sustituye migraciones, contratos SQL ni configuración segura del entorno.

## Autoridades

- Precio, stock, catálogo e imágenes: SQL Server mediante procedimientos permitidos.
- Identidad técnica de producto: `productRagId` proveniente de SQL.
- Hechos técnicos: RAG de producto, aislado por `productRagId` y sección.
- Políticas, garantía, envío, pagos y tienda: RAG institucional.
- Estado conversacional: repositorio configurado (`memory` o Supabase).
- Planner y writer: orientan intención y redacción; no crean hechos ni cambian autoridades.
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
- El writer solo puede usar productos y hechos permitidos.
- Cifras técnicas con unidad deben coincidir exactamente con evidencia autoritativa; no se redondean.
- Montos institucionales respaldados, como umbrales de envío, no se clasifican como precio de producto.
- Las listas de chat se normalizan a máximo tres viñetas simples.

## N+1 comercial

- QA separa decisión, entrega visible y progresión comercial.
- Un enum interno no acredita por sí solo que el N+1 fue entregado.
- `ASK_MISSING_FACT`, `SOFT_CLOSE`, recomendación, comparación, reserva y handoff deben ser visibles en la respuesta cuando corresponden.
- `ANSWER_ONLY` sigue siendo válido para hechos exactos, políticas naturales o aclaraciones específicas.
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
- La certificación final usa QA CORE conversacional local y revisión de la respuesta visible, además de estado/debug.

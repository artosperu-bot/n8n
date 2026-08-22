# STECH Backend — Plan P0–P8: RAG, recomendación comercial y N+1

Fecha: 2026-08-21  
Rama: `feat/stech-backend`  
Estado: **DISEÑO APROBADO / IMPLEMENTACIÓN PENDIENTE**

## 1. Objetivo

Corregir las causas raíz observadas en `STECH Live QA qa-20260821-172842-d546` sin parches por producto ni respuestas hardcodeadas.

El resultado esperado es un agente que:

- entienda lenguaje natural y typos de WhatsApp;
- distinga necesidad, producto, atributo, referencia y señal de compra;
- use SQL como autoridad de catálogo/precio/stock;
- use RAG para recuperar evidencia técnica e institucional;
- compare candidatos con criterios objetivos y explicables;
- convierta especificaciones en beneficios comerciales sin inventar;
- aplique N+1 de forma contextual, no como pregunta obligatoria;
- avance a reserva/asesor según la etapa real;
- preserve memoria, referencias, persistencia y contratos que ya funcionan.

## 2. Contratos que NO se deben romper

### Autoridades

- SQL Server: precio, stock, catálogo, imágenes, pedido y operaciones transaccionales autorizadas.
- Product RAG: hechos técnicos del producto.
- Institutional RAG: políticas, ubicación, horario, pagos, garantía, postventa, privacidad y envíos.
- Supabase: memoria, conversaciones, telemetría y conocimiento RAG.
- n8n: automatización/orquestación, no autoridad factual.

### SP autorizados

Se mantiene la whitelist de `backend/docs/SP-AUTORIZADOS-CHATBOT.md`:

1. `dbo.sp_BuscarImagenesProductoVenta`
2. `dbo.sp_BuscarProductosVenta`
3. `dbo.sp_ConsultarPedido`
4. `dbo.sp_IA_RegistrarReserva24h_Idempotente`
5. `dbo.sp_ListarCatalogoVenta`
6. `dbo.sp_ListarCategoriasVenta`
7. `dbo.sp_ListarSubcategoriasVenta`
8. `dbo.sp_ResolverContextoCatalogoVenta`

No incorporar otros SP sin aprobación explícita.

### Reserva 1 unidad

Flujo contractual:

`compra clara → producto resuelto → DNI/CE → nombres y apellidos → dirección → reserva idempotente → confirmar resultado real`

- No preguntar producto si ya está resuelto.
- No preguntar cantidad en el flujo estándar de 1 unidad.
- Si el cliente expresa 2 o más unidades: handoff a asesor con contexto preservado.
- Teléfono/WhatsApp se omite en QA/local y se prevé obtener del canal en producción.
- Nunca afirmar reserva creada antes del éxito autoritativo del SP.

## 3. Hallazgos raíz ya verificados

### 3.1 El backend actual no usa embeddings en el RAG

`SupabaseRagRepository` carga `documents` y `rag_institucional` por REST y calcula relevancia mediante coincidencia de tokens/palabras. El campo `embedding` no participa hoy en la recuperación.

En Supabase ya existe infraestructura vectorial:

- `documents`: 69 registros, 69 con embedding, dimensión 1536.
- `rag_institucional`: 71 registros, 71 con embedding, dimensión 1536.
- índices HNSW con cosine distance.
- RPCs vectoriales disponibles, entre ellas:
  - `buscar_rag_producto_documents_v37`
  - `buscar_rag_institucional_v37`
  - `match_documents`

### 3.2 Embedding ≠ recomendación

La similitud vectorial se utilizará para **recuperar evidencia relevante**, nunca para decidir automáticamente qué producto es “mejor”.

Regla:

`embedding → recuperación de evidencia`

NO:

`embedding más alto → mejor producto`

La recomendación debe salir de atributos comparables + restricciones comerciales + necesidad del cliente.

### 3.3 El ranking actual confunde relevancia RAG con calidad del producto

La lógica actual suma `evidence.score` y ordena candidatos por ese valor. Esto puede seleccionar el documento más parecido semánticamente y convertirlo erróneamente en la “mejor opción”.

Debe reemplazarse por una política de recomendación explicable.

### 3.4 Señales determinísticas fuertes pueden degradarse a `OTHER`

Se observaron casos donde el presupuesto fue detectado correctamente, pero el turno terminó como `OTHER`/`GENERAL_COMMERCIAL`.

Las señales fuertes no deben poder degradarse por una salida débil del planner.

### 3.5 Necesidad y producto se están mezclando

Frases como “celular para delivery” o “algo para construcción” son necesidades, no modelos desconocidos. No deben activar el flujo `UNKNOWN_TO_ALTERNATIVES` como si se hubiera solicitado un producto inexistente.

### 3.6 Comparación sostenida no siempre recupera evidencia de ambos productos

Si la conversación mantiene un par `[A,B]`, preguntas posteriores como “¿cuál tiene mejor batería?” o “¿y cámara?” deben recuperar la misma sección para ambos productos.

### 3.7 N+1 válido no significa N+1 correcto

El catálogo acotado de N+1 es correcto, pero el validador debe impedir combinaciones semánticamente incorrectas, por ejemplo `PRICE → ASSISTED_HANDOFF` sin señal de compra/humano/cotización.

### 3.8 Golden 100 / Oracle contiene falsos RED potenciales

Antes de usar el score como juez final se deben corregir al menos:

- alias histórico `OFFER_ALTERNATIVES` vs contrato actual `OFFER_ALTERNATIVE`;
- comparación literal de números negados (ej. “no es 5G”);
- truncamiento de evidencia RAG a 320 caracteres antes de construir hechos permitidos;
- escenarios de compra personal que aún esperan handoff en vez del nuevo flujo de reserva.

## 4. Uso de `text-embedding-3-small`

### Decisión

Modelo objetivo para query embeddings:

`text-embedding-3-small`

Uso autorizado:

- búsqueda semántica de evidencia de producto;
- búsqueda semántica institucional;
- mejora de recall ante lenguaje coloquial, sinónimos y frases no idénticas a las fichas.

No usarlo para:

- decidir cuál producto es mejor;
- reemplazar filtros SQL de precio/stock;
- reemplazar resolución de producto/referente;
- generar claims comerciales sin evidencia.

### Compatibilidad / seguridad

Los vectores actuales son `vector(1536)`, compatibles dimensionalmente con `text-embedding-3-small`, pero la tabla `documents` no registra de forma suficiente el nombre del modelo que generó cada vector.

Antes de activar la recuperación vectorial en producción se deberá hacer una de estas dos cosas:

1. verificar de forma confiable el modelo de origen de los vectores existentes; o
2. regenerar de forma controlada los embeddings con `text-embedding-3-small` y registrar metadatos de versión/modelo.

No mezclar vectores de espacios/modelos desconocidos.

Metadatos deseados a futuro:

- `embedding_model`
- `embedding_version`
- `embedding_updated_at`
- `embedding_status/error` cuando aplique

## 5. Arquitectura objetivo

Flujo general:

`mensaje`
→ `Semantic Authority Gate`
→ `Product/Reference Resolver`
→ `Need & Criteria Resolver`
→ `SQL Candidate Filter`
→ `Vector RAG por producto/sección`
→ `Structured Recommendation Policy`
→ `N+1 Compatibility Policy`
→ `Commercial Writer`
→ `Persistence/Telemetry`

Principio:

**Entender → resolver → recuperar evidencia → comparar → decidir → explicar beneficio → avanzar un solo paso.**

## 6. P0 — Semantic Authority Gate

### Objetivo

Evitar que señales determinísticas claras sean degradadas por el LLM.

### Casos obligatorios

- presupuesto explícito → `BUDGET_CONSTRAINT` / `RECOMMEND_WITHIN_BUDGET` según contexto;
- precio → PRICE;
- stock → STOCK;
- imágenes solicitadas → IMAGE;
- política/garantía → POLICY/WARRANTY;
- señal fuerte de compra → PURCHASE;
- atributos técnicos → CAPABILITY/ATTRIBUTE;
- comparación explícita → COMPARE;
- referencias conocidas → conservar destino correcto.

### Distinciones obligatorias

- “tomar fotos / fotos para redes” → CAMARA/EVALUATE_USE;
- “mándame foto / foto ps” → IMAGE;
- “celular para delivery/construcción/campo” → necesidad, no producto inexistente;
- “ya el 22 quiero” con Armor 22 en contexto → PURCHASE + Armor 22;
- `armro x13` → intentar resolver Armor X13 antes de UNKNOWN.

### Gate

Tests unitarios RED→GREEN para cada familia + regresión completa existente.

## 7. P1 — Product & Reference Resolver

### Objetivo

Resolver productos y referentes antes de consultar RAG.

Orden propuesto:

1. producto explícito exacto/canónico;
2. contexto activo/recomendado/seleccionado/comparison pair;
3. `sp_ResolverContextoCatalogoVenta` / búsqueda catálogo autorizada;
4. fuzzy/normalización controlada para typos;
5. solo entonces `UNKNOWN_PRODUCT` si no hay resolución suficiente.

### Reglas

- una mención a otro producto no implica selección;
- “prefiero X / ya X quiero” sí puede producir switch/selection;
- “el otro” debe resolver determinísticamente el opuesto dentro del comparison pair;
- evitar fuzzy demasiado permisivo: no convertir cualquier número/palabra en modelo.

## 8. P2 — RAG vectorial real

### Objetivo

Usar embeddings para recuperar la evidencia correcta, manteniendo filtros estructurales.

### Componentes

- `EmbeddingProvider` desacoplado.
- Implementación OpenAI con `text-embedding-3-small`.
- configuración explícita de modelo.
- `SupabaseRagRepository` usando RPC vectorial.

### Product RAG

Siempre filtrar por `producto_id` primero.

Cuando existan secciones técnicas, filtrar/acotar por sección antes o durante la recuperación:

- BATERIA
- RESISTENCIA
- CAMARA
- MEMORIA
- RENDIMIENTO
- PANTALLA
- CONECTIVIDAD
- REDES
- SIM
- SEGURIDAD
- FISICO
- SENSORES
- POSICIONAMIENTO
- etc.

No permitir contaminación de evidencia entre productos.

### Institutional RAG

Mantener topic resolver/categoría como filtro fuerte y usar vector search como recall/ranking secundario.

### Fallback

Si el servicio de embedding falla:

- no inventar;
- usar recuperación estructurada/lexical segura si existe;
- registrar degradación en debug/telemetría.

## 9. P3 — Structured Recommendation Policy

### Objetivo

Separar `retrieval relevance` de `commercial recommendation`.

### Regla

Primero SQL limita candidatos por restricciones duras:

- catálogo real;
- estado permitido;
- stock cuando aplique;
- precio <= presupuesto cuando exista presupuesto.

Después se comparan atributos de forma simétrica.

### Ejemplos de criterios generales

#### RESISTENCIA

- certificaciones IP;
- MIL-STD cuando exista;
- profundidad/tiempo de inmersión;
- altura de caída certificada;
- otras métricas de resistencia verificadas.

#### BATERIA

- capacidad;
- autonomía verificable;
- potencia de carga;
- trade-off con peso/tamaño cuando sea relevante.

#### DELIVERY / CAMPO

Composición de criterios, por ejemplo:

- batería;
- resistencia;
- GPS/posicionamiento;
- redes/conectividad;
- peso cuando el cliente lo priorice.

#### CAMARA

- cámara principal;
- nocturna cuando aplique;
- video;
- almacenamiento disponible/relevante.

#### USO SIMPLE

Evitar sobreventa: recomendar el producto suficiente, no necesariamente el más caro.

### Salida esperada

La política debe producir:

- candidato recomendado;
- criterios que justifican la decisión;
- trade-offs;
- evidencia utilizada;
- nivel de confianza / ausencia de suficiente evidencia.

No hardcodear nombres de productos.

## 10. P4 — Comparación simétrica persistente

### Objetivo

Conservar un comparison pair y recuperar la misma evidencia de ambos lados.

Ejemplo:

`[Armor X13, Armor 22]`

“¿cuál tiene mejor batería?”
→ `BATERIA(X13)` + `BATERIA(22)`

“¿y cámara?”
→ `CAMARA(X13)` + `CAMARA(22)`

“¿y el otro?”
→ resolver el producto opuesto determinísticamente.

### Regla

No permitir que el producto activo monopolice la recuperación cuando el contexto indica comparación.

## 11. P5 — N+1 Compatibility Policy

### Objetivo

Evaluar N+1 en cada turno sin convertir cada respuesta en una pregunta ni derivar prematuramente.

### Matriz base

| Situación | Acciones permitidas principales |
|---|---|
| PRICE sin compra clara | ANSWER_ONLY / SOFT_CLOSE |
| STOCK sin compra clara | ANSWER_ONLY / SOFT_CLOSE |
| CAPABILITY factual | ANSWER_ONLY / SOFT_CLOSE si ya evalúa compra |
| POLICY/WARRANTY | ANSWER_ONLY / puente contextual si aporta valor |
| EVALUATE_USE | ASK_MISSING_FACT / RECOMMEND |
| BUDGET_CONSTRAINT | ASK_MISSING_FACT / RECOMMEND |
| COMPARE | COMPARE / RECOMMEND |
| OBJECTION | OFFER_ALTERNATIVE |
| PURCHASE 1 unidad | flujo de reserva |
| PURCHASE >=2 unidades | ASSISTED_HANDOFF |
| HUMAN | ASSISTED_HANDOFF |
| QUOTE B2B | ASSISTED_HANDOFF cuando contexto mínimo esté listo |

Regla: el LLM puede proponer, pero el validador debe impedir una acción incompatible con intención/estado.

## 12. P6 — Commercial Writer

### Objetivo

Redactar como vendedor consultivo humano, corto y convincente, sin lenguaje interno.

### Principios

- resolver primero la pregunta actual;
- empatía principalmente implícita/contextual;
- usar dolor/necesidad ya conocida sin repetir discovery;
- convertir specs en beneficios verificables;
- no usar “te entiendo” como muletilla;
- no decir “catálogo verificado”, “evidencia verificada”, RAG, INTENT, queryTarget, UNKNOWN;
- no afirmar “mejor”, “dura todo el día”, “más resistente”, etc. sin comparación/evidencia suficiente;
- SPIN/FAB/LAER/neuroventas influyen internamente, no se nombran;
- 1–3 frases normalmente;
- máximo una pregunta útil cuando realmente mueve la decisión;
- no precio no solicitado;
- no stock numérico crudo;
- no acción/reserva/pedido inventado.

Patrón conceptual no rígido:

`contexto/dolor → respuesta → beneficio → prueba/trade-off → siguiente paso útil`

## 13. P7 — Corregir Oracle / Golden 100

### Objetivo

Evitar optimizar el bot contra falsos RED.

### Cambios mínimos requeridos

- actualizar alias N+1 viejo;
- manejar números negados en truth-checking;
- no truncar hechos antes de validar afirmaciones importantes;
- distinguir facts estructurados de texto crudo;
- actualizar escenarios de reserva 1 unidad;
- mantener B2B 2+ unidades en handoff;
- conservar checks de price/stock/reference/persistence/fabrication.

### Regla

No suavizar el QA para “hacerlo verde”. El Oracle debe ser más correcto y más estricto donde corresponda.

## 14. P8 — Golden 100 AFTER y cierre de iteración

### Ejecución

Ejecutar un run nuevo y fresco, sin reutilizar session IDs del BEFORE.

Comparar:

- scenario GREEN/YELLOW/RED;
- factual accuracy corregida;
- product identity;
- reference accuracy;
- noFabrication;
- memoryConsistency;
- questionResolved;
- N+1 quality;
- purchase progression;
- persistence;
- uso de rutas SQL/RAG;
- handoffs prematuros;
- lenguaje robótico;
- tokens/latencia.

### Criterio comercial adicional

Revisar manualmente muestras representativas:

- construcción;
- delivery;
- presupuesto;
- cámara;
- comparación;
- typos WhatsApp;
- objeción de precio;
- políticas;
- compra 1 unidad;
- compra/cotización B2B.

## 15. Estrategia de implementación rápida

Se avanza secuencialmente P0→P8, pero sin pausas innecesarias entre subfases.

Cada P debe cumplir:

1. test que reproduzca el fallo real;
2. RED antes del fix cuando sea aplicable;
3. cambio mínimo general;
4. GREEN específico;
5. regresión de suite relevante;
6. no romper contratos anteriores.

Si una causa raíz cubre varios casos, se prefiere un único cambio general antes que múltiples parches.

## 16. Criterios de no-regresión

No se aceptará una mejora si rompe:

- precio/stock autoritativo SQL;
- referencias activas/recomendadas/seleccionadas;
- comparación que ya funciona;
- memoria/persistencia;
- anti-fabricación;
- imágenes autoritativas;
- institutional RAG;
- handoff B2B contextual;
- contratos de SP autorizados.

## 17. Archivos/capas probables a tocar

La implementación deberá seguir las fronteras existentes; lista inicial probable:

- `backend/src/conversation/intent/IntentPlan.ts`
- `backend/src/conversation/reference/ReferenceResolver.ts`
- `backend/src/conversation/decision/DecisionValidator.ts`
- `backend/src/conversation/nba/NextBestAction.ts`
- `backend/src/conversation/HybridConversationEngine.ts`
- `backend/src/conversation/commercial/ProductEvidencePolicy.ts`
- nueva política/componente de recomendación estructurada
- `backend/src/adapters/supabase/SupabaseRagRepository.ts`
- nueva abstracción/implementación de embeddings
- `backend/src/config/config.ts`
- `backend/src/bootstrap.ts`
- `backend/src/adapters/openai/OpenAIProvider.ts` solo donde corresponda a writer/planner, no como parche universal
- QA evaluators/oracle/scenarios relacionados
- tests unitarios/integración/QA.

La lista puede ajustarse al implementar, pero cualquier cambio debe mantener separación de responsabilidades.

## 18. Fuera de alcance en esta iteración

- producción/deploy/merge sin gate explícito;
- nuevos SP fuera de whitelist;
- hardcodes por Ulefone/modelos concretos;
- rediseño total de Supabase;
- cambio innecesario de tablas productivas;
- nuevo framework de agentes;
- scraping;
- reescritura completa de n8n;
- entrenamiento/fine-tuning.

## 19. Estado

- Diseño P0–P8: **APROBADO**
- Documento congelado: **SÍ, este archivo**
- Implementación: **PENDIENTE**
- Re-embedding de datos: **NO ejecutado**
- Base productiva modificada: **NO**
- Producción/deploy/merge: **NO**

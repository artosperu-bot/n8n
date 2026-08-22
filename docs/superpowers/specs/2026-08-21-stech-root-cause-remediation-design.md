# STECH Backend — Root-Cause Remediation Design

Fecha: 2026-08-21  
Rama: `feat/stech-backend`  
Base de evidencia: Live QA `qa-20260821-190612-d166` + inspección del HEAD actual  
Estado: **DISEÑO DE REMEDIACIÓN — REQUIERE APROBACIÓN ANTES DE IMPLEMENTAR**

## 1. Objetivo

Corregir las causas raíz que todavía impiden certificar el chatbot STECH como vendedor comercial confiable, preservando las piezas que ya están verdes.

El objetivo no es mejorar frases aisladas. El objetivo es cerrar el pipeline completo:

`mensaje → intención/contexto → producto/referente → candidatos SQL → evidencia RAG → recomendación estructurada → verdad comercial → N+1 → writer → persistencia → QA`

La definición de **RESUELTO** cambia desde esta iteración:

> Un punto solo se considera resuelto cuando existe **implementación + test de regresión + evidencia Live QA**. Código presente o tests unitarios aislados no son suficientes.

No se hará merge ni deploy a producción durante esta iteración sin autorización explícita.

## 2. Autocrítica de las iteraciones anteriores

### 2.1 Se sobrevaloró el GREEN unitario

Varias piezas fueron marcadas como cerradas porque existía código y el test local pasaba, aunque el camino Live todavía podía evitarlas.

Ejemplo: `RecommendationPolicy` ya separa correctamente similitud RAG de calidad de producto, pero una necesidad como construcción/delivery puede seguir por `COMMERCIAL_REASONING` sin entrar al ranking estructurado.

Corrección de proceso: cada P tendrá tres gates separados:

1. `CODE` — implementación existente;
2. `REGRESSION` — tests focalizados y suite completa verdes;
3. `LIVE` — evidencia real en Golden/Live QA.

### 2.2 Se confundió N+1 acotado con N+1 correcto

Se corrigió que el LLM no pueda emitir acciones arbitrarias, pero se conservó una regla antigua: `PURCHASE → ASSISTED_HANDOFF`.

Eso contradice el contrato congelado de reserva para una unidad.

Peor: en la última corrida hay respuestas con `lastNba=ANSWER_ONLY` que igualmente terminan preguntando algo. El writer todavía puede contradecir al motor de decisión.

Corrección: N+1 debe ser autoridad de salida, no solo metadata.

### 2.3 No se cerró la frontera de verdad del writer

Se bloquearon lenguaje interno, precio no solicitado, stock crudo y algunos superlativos. Aun así el writer puede transformar especificaciones reales en promesas no demostradas como “sin lags”, “dura todo el día”, “menos reparaciones” o equivalentes.

Corrección: separar hecho verificado, comparación derivada, beneficio comercial permitido e inferencia prohibida.

### 2.4 Persistencia se trató como métrica secundaria

La corrida reporta 88 turnos y solo 83 quedaron persistidos. G100-20 no existe en las tablas inspeccionadas. Esto debe ser un bloqueo de certificación, no una observación menor.

Corrección: un turno HTTP exitoso sin persistencia verificable debe quedar explícitamente FAIL y detener la certificación del journey.

### 2.5 El Oracle comparte compactación con el prompt del writer

`EvidenceNormalizer` compacta evidencia RAG a 320 caracteres, lo que es razonable para controlar prompt/tokens, pero no debe definir el universo completo de verdad del Oracle.

Corrección: separar `writer facts` compactos de `oracle facts` completos.

### 2.6 Algunos tests congelan contratos obsoletos

La suite todavía contiene expectativas de `PURCHASE → ASSISTED_HANDOFF` para compra personal y Golden100 mantiene `requiresHandoff=true` en escenarios que ahora deben entrar a reserva de una unidad.

Corrección: actualizar los tests al contrato comercial aprobado sin disminuir severidad factual.

## 3. Evidencia Live QA actual

Run: `qa-20260821-190612-d166`

- GREEN: 0/20
- YELLOW: 3/20
- RED: 17/20
- turnos ejecutados reportados: 88
- turnos persistidos: 83
- productIdentity: 23/23
- referenceAccuracy: 18/19
- factualAccuracy: 8/42
- noFabrication: 72/88
- memoryConsistency: 82/88
- questionResolved: 83/88
- nbaQuality: 82/88
- purchaseProgression: 3/3, pero bajo contrato antiguo
- persistence: 83/88

Hallazgos adicionales verificados:

- 10 turnos persistidos terminaron en `OTHER`;
- 26 turnos con `ANSWER_ONLY` igualmente contienen una pregunta;
- 3 compras personales de una unidad terminaron en `ASSISTED_HANDOFF`;
- apareció al menos un producto inventado: `Armor X10`;
- lenguaje robótico tipo “catálogo/evidencia verificada” cayó a 0;
- G100-01, G100-02, G100-05 y G100-19 se cortaron después del turno 2;
- G100-20 no quedó persistido.

## 4. Estado real P0–P8

Los porcentajes son **estimación de avance**, no una métrica matemática de calidad.

| Fase | Estado actual | Avance estimado | Evidencia / pendiente |
|---|---|---:|---|
| P0 Semantic Authority | PARCIAL | 75% | Typos básicos, cámara vs imágenes, presupuesto y compra corta ya tienen reglas; quedan 10 `OTHER` y casos de integración |
| P1 Product & Reference Resolver | CASI GREEN | 88% | identidad 23/23, referencias 18/19, `el otro` funciona; falta certificar fuzzy real/G100-20 y uso efectivo del resolver SQL autorizado |
| P2 Vector RAG | CODE GREEN / LIVE PARCIAL | 80% | `OpenAIEmbeddingProvider`, `text-embedding-3-small`, RPC vectoriales y fallback existen; falta observabilidad Live y corregir consumo institucional vectorial |
| P3 Structured Recommendation | COMPONENT GREEN / PIPELINE OPEN | 55% | ranking estructurado existe y tiene tests; necesidades reales aún pueden evitarlo y el writer llegó a inventar `Armor X10` |
| P4 Comparison | GREEN MECÁNICO | 93% | comparación simétrica y `el otro` tienen regresiones; preservar |
| P5 N+1 | PARCIAL / CONTRATO ERRÓNEO | 50% | compatibilidad existe, pero PURCHASE personal sigue handoff y `ANSWER_ONLY` no controla la salida |
| P6 Writer | PARCIAL | 58% | guardrails importantes verdes; falta firewall de producto, claims derivados seguros y obediencia estricta a NBA |
| P7 Oracle / Golden semantics | ABIERTO | 42% | truncamiento de facts, números negados, alias/contratos viejos, IMAGE URL-only y purchase antiguos |
| P8 Golden100 final | NO CERRADO | 0% certificación | última corrida 0 GREEN y persistencia 83/88 |

## 5. Contratos que quedan congelados

No reabrir salvo evidencia contraria:

- SQL es autoridad para catálogo, precio, stock e imágenes.
- Product RAG es autoridad para hechos técnicos.
- Institutional RAG es autoridad para políticas y datos institucionales.
- Supabase almacena memoria, conversación, telemetría y conocimiento RAG.
- n8n orquesta; no inventa autoridad factual.
- no hardcodear modelos específicos como solución general.
- no exponer stock numérico crudo al cliente.
- no inventar reserva/pedido/acción transaccional.
- `el otro` dentro de comparison pair debe conservarse.
- comparación de atributo debe recuperar ambos lados.
- `tomar fotos` no significa solicitar imágenes del producto.
- no volver a lenguaje interno/robótico.

Whitelist de SP autorizados permanece exactamente la definida en `backend/docs/SP-AUTORIZADOS-CHATBOT.md`. No agregar otros SP sin aprobación explícita.

## 6. Causas raíz y diseño de remediación

### R0 — Reliability / persistencia como gate bloqueante

Problema:

88 turnos reportados, 83 persistidos. Un journey que pierde estado deja de ser auditable y puede producir referencias/N+1 incorrectos en turnos posteriores.

Diseño:

- localizar primero la fase exacta del fallo: acquire, engine, persist atómico, release o lectura QA;
- un HTTP exitoso no puede considerarse PASS si el turno no aparece persistido exactamente una vez;
- si `completeTurn` falla, el QA debe registrar fase + error y marcar el turno explícitamente fallido;
- no silenciar/reintentar de forma que pueda duplicar conversaciones;
- reintento solo si la operación es demostrablemente idempotente para el mismo `message_id`;
- persistencia 100% será prerequisito para interpretar el score comercial final.

Gate:

`successful_turns == persisted_turns == unique_message_ids` y cero gaps de `context_version`.

### R1 — Recommendation Entry Gate

Problema:

`RecommendationPolicy` existe, pero necesidades como construcción/delivery/cámara pueden quedarse en `COMMERCIAL_REASONING` sin consultar candidatos reales.

Diseño:

Cuando exista una necesidad suficiente para decidir criterios:

`useCase/problem/priorities`
→ SQL candidatos reales
→ filtros duros de presupuesto/stock
→ RAG por secciones relevantes
→ `RecommendationPolicy`
→ recomendación explicable.

Solo preguntar un dato faltante si realmente puede cambiar la selección. No preguntar Android/iOS, marca, uso o prioridad por ritual si ya existe suficiente contexto.

Ejemplos:

- construcción + caídas → RESISTENCIA ya es criterio suficiente para empezar;
- construcción + caídas + jornada larga → RESISTENCIA + BATERIA;
- delivery + GPS/datos → BATERIA + RESISTENCIA + POSICIONAMIENTO/REDES;
- cámara + resistencia → CAMARA + RESISTENCIA.

### R2 — Catalog Candidate Firewall

Problema:

El writer llegó a presentar `Armor X10`, que no era un candidato SQL real.

Diseño:

Todo producto ofrecido/recomendado al cliente debe pertenecer a uno de estos conjuntos:

1. candidatos canónicos devueltos por SQL en el turno; o
2. producto canónico ya resuelto y persistido en contexto.

Un modelo inexistente escrito por el usuario puede repetirse únicamente para explicar que no fue resuelto/encontrado. Nunca puede convertirse en una oferta real.

El writer recibirá un conjunto de productos permitidos y `WriterGuard` actuará como defensa adicional ante nombres fuera del conjunto.

No hardcodear `Armor X10`, X13, 22, etc.; la regla es genérica por identidad canónica.

### R3 — Truth Boundary para FAB y claims comerciales

Problema:

Un dato real puede transformarse en una conclusión no demostrada.

Diseño conceptual de claims:

1. `VERIFIED_FACT`: dato literal de SQL/RAG;
2. `DERIVED_COMPARISON`: cálculo/dirección determinística entre hechos comparables verificados;
3. `COMMERCIAL_BENEFIT`: traducción contextual permitida, calibrada y no absoluta;
4. `FORBIDDEN_INFERENCE`: promesa causal, garantía o superlativo sin evidencia suficiente.

Ejemplos permitidos:

- 6600 mAh vs 6320 mAh → “tiene algo más de capacidad”;
- 33 W vs 10 W → “tiene ventaja en velocidad/potencia de carga”;
- 2 m de caída certificada vs 1.5 m → “tiene una especificación de caída superior”.

No permitido sin evidencia específica:

- “te dura todo el día”;
- “sin lags”;
- “menos reparaciones”;
- “la cámara toma mejores fotos” solo por tener más MP;
- “GPS más estable” por listar más sistemas;
- “es el más resistente” si no se comparó el universo relevante con la misma métrica.

### R4 — N+1 como autoridad de salida

Problema:

`lastNba=ANSWER_ONLY` no impide que el writer agregue una pregunta.

Diseño:

- `ANSWER_ONLY`: cero preguntas comerciales añadidas;
- `ASK_MISSING_FACT`: exactamente un dato faltante declarado que cambia decisión;
- `SOFT_CLOSE`: máximo una acción relacionada con la etapa actual;
- `COMPARE/RECOMMEND/OFFER_ALTERNATIVE`: respetar el producto/criterio actual;
- el writer no puede ascender ni cambiar la acción decidida.

Añadir concepto de `pendingCommercialAction`/acción ofrecida para interpretar respuestas cortas:

- bot ofrece revisar precio+stock → “sí/dale” = ejecutar esa consulta, no PURCHASE;
- bot ofrece reserva → “sí/dale” = iniciar reserva;
- ausencia de acción pendiente + “sí” no debe inventar intención fuerte.

### R5 — Buying stage / progresión comercial

El motor necesita distinguir, aunque los nombres finales puedan variar:

- INTEREST
- CONSIDERATION
- VALIDATION
- DECISION
- TRANSACTION

N+1 debe usar etapa + intención + producto + datos ya conocidos.

Ejemplo:

Cliente eligió Armor22 y luego pregunta stock.

- si solo está comparando → responder disponibilidad;
- si ya expresó preferencia fuerte y conoce precio → puede ofrecer reserva;
- si antes dijo “si hay stock lo compro” → disponibilidad positiva debe avanzar al primer dato de reserva, no preguntar de nuevo si quiere comprar.

### R6 — Reserva personal de 1 unidad

El contrato actual de `NextBestAction`/`NbaCompatibility` está obsoleto porque fuerza `PURCHASE → ASSISTED_HANDOFF`.

Diseño contractual obligatorio:

`PURCHASE + producto resuelto + qty implícita 1`
→ revalidar disponibilidad cuando corresponda
→ DNI/CE
→ nombres y apellidos
→ dirección
→ `dbo.sp_IA_RegistrarReserva24h_Idempotente`
→ confirmar solo resultado exitoso real.

Reglas:

- no pedir producto nuevamente;
- no preguntar cantidad en flujo personal estándar;
- no solicitar teléfono/WhatsApp en QA/local;
- no confirmar reserva antes del SP;
- si `quantity >= 2`, no entrar a esta máquina de estados: `ASSISTED_HANDOFF` con contexto;
- `HUMAN` explícito sigue siendo handoff.

La integración transaccional requerirá extender el puerto ERP de forma explícita y únicamente con el SP autorizado.

### R7 — Institucional vectorial: corregir integración

Defecto concreto encontrado:

`SupabaseRagRepository` produce evidencia vectorial con fuente:

`SUPABASE_VECTOR_INSTITUCIONAL:...`

pero `institutionalResponse()` busca únicamente:

`SUPABASE_INSTITUCIONAL:...`

Por lo tanto, cuando la búsqueda vectorial funciona, la capa de respuesta determinística puede ignorar evidencia institucional válida.

Diseño:

- la semántica debe basarse en `domain === 'INSTITUTIONAL'` / tipo de evidencia, no en un prefijo concreto de transporte;
- vector y lexical fallback deben ser intercambiables para la ResponsePolicy;
- mantener topic/category/subcategory como filtros fuertes;
- no inventar política si el retrieval no encuentra evidencia afirmable.

### R8 — Observabilidad RAG

Para poder declarar P2 LIVE GREEN, cada retrieval debe exponer/persistir de forma auditable:

- `mode: vector | lexical_fallback`;
- RPC utilizada;
- `productId` o topic institucional;
- secciones solicitadas;
- fuentes/similarity de resultados;
- razón/error de fallback cuando exista.

No incluir secretos ni embeddings completos en logs.

### R9 — Aislamiento de memoria institucional vs comercial

Problema:

`extractCommercialFacts` se ejecuta globalmente y acumula hechos. Una pregunta pura de ubicación, privacidad o pago no debe crear nuevas prioridades/product problems.

Diseño:

- resolver intención suficientemente temprano;
- para turno puramente institucional, preservar el estado comercial previo pero no extraer/mutar prioridades/useCase/problem desde palabras incidentales;
- el puente comercial del writer no debe mutar la memoria como si el cliente hubiera expresado una necesidad.

### R10 — Objeciones y alternativa sin corrupción de identidad

Cuando se recomienda una alternativa por precio:

- `recommendedProduct`/salience puede cambiar;
- `selectedProduct` y active product no deben cambiar hasta selección explícita;
- “cuánto sale esa alternativa” debe resolver la alternativa recomendada;
- la respuesta a objeción debe comparar el beneficio relevante y el principal trade-off, no soltar una ficha técnica completa.

### R11 — B2B

Para 12/20 unidades sin modelo decidido:

`cantidad + empresa + uso/necesidad`
→ candidatos SQL
→ recomendación breve / 1–2 opciones
→ preservar factura/RUC/cantidad/contexto
→ `ASSISTED_HANDOFF` para cotización.

No preguntar “¿qué modelo quieres?” si justamente el cliente busca que STECH lo asesore.

### R12 — Imágenes + N+1

Contrato actual QA: una respuesta IMAGE contiene únicamente URLs autoritativas, una por línea.

No se romperá ese contrato accidentalmente.

Si se quiere añadir N+1 después de imágenes, la arquitectura preferida es:

- payload/respuesta de imágenes autoritativa por separado;
- acción N+1 estructurada/persistida;
- segundo mensaje comercial solo si el canal soporta correctamente esa separación.

Hasta validar ese contrato de transporte, se mantiene IMAGE URL-only.

## 7. Actualización P0–P8 por trabajo que ya existe

### P0 — Semantic Authority

Ya implementado:

- precio coloquial;
- stock abreviado;
- cámara para “tomar fotos” separada de solicitud de imágenes;
- `ya el 22 quiero` como PURCHASE;
- superlativos como RECOMMEND;
- presupuesto determinístico.

Pendiente:

- eliminar los `OTHER` evitables;
- asegurar que señales determinísticas fuertes ganen end-to-end;
- cubrir confirmaciones cortas mediante acción pendiente.

### P1 — Resolver producto/referente

Ya implementado:

- comparison pair;
- `el otro`;
- aliases contextuales como `22` cuando son inequívocos;
- protección contra confundir fecha/día 22;
- selección explícita;
- identidad Live 23/23 y referencias 18/19.

Pendiente:

- certificar typo/fuzzy real en Live;
- integrar/usar de forma verificable `sp_ResolverContextoCatalogoVenta` cuando corresponda antes de UNKNOWN;
- cerrar el único error referencial residual sin romper comparison pair.

### P2 — Vector RAG

Ya implementado:

- `EmbeddingProvider` desacoplado;
- OpenAI embeddings endpoint;
- `OPENAI_EMBEDDING_MODEL` con `text-embedding-3-small` por defecto;
- product vector RPC con `producto_id` exacto;
- institutional vector RPC;
- lexical fallback;
- test que verifica query embedding y RPC.

Pendiente:

- R7 integración institucional source-agnostic;
- observabilidad R8;
- certificación Live de vector vs fallback.

### P3 — RecommendationPolicy

Ya implementado:

- presupuesto/stock como filtros duros;
- criterios por necesidad;
- métricas comparables;
- ranking independiente de similarity RAG;
- tests de batería, resistencia, presupuesto y delivery.

Pendiente crítico:

- R1 Recommendation Entry Gate;
- R2 Candidate Firewall;
- R3 Truth Boundary;
- usar el ranking en todos los caminos comerciales que corresponden.

### P4 — Comparison

Ya implementado y a preservar:

- misma sección para ambos productos;
- continuidad del pair;
- `el otro` no pierde el referente por target stale del planner.

Pendiente:

- solo regresión full/live; no rediseñar.

### P5 — N+1

Ya implementado:

- catálogo bounded de acciones;
- matriz básica de compatibilidad;
- factual PRICE no puede convertirse arbitrariamente en handoff.

Pendiente crítico:

- eliminar PURCHASE personal → handoff;
- R4 hard output compliance;
- R5 buying stage;
- pending action;
- qty>=2/human vs 1-unit reservation.

### P6 — Writer

Ya implementado:

- bloqueo de lenguaje robótico;
- precio no solicitado;
- stock crudo;
- acción transaccional no verificada;
- algunos superlativos sin comparación suficiente.

Pendiente:

- R2 Candidate Firewall en output;
- R3 claim provenance;
- `ANSWER_ONLY` sin preguntas;
- objeciones más comerciales y cortas;
- SPIN/FAB usando memoria sin repetir discovery.

### P7 — Oracle/Golden semantics

Pendiente:

- facts completos separados de facts compactos del writer;
- números negados (`no 5G`) sin falso unsupported numeric;
- `OFFER_ALTERNATIVES` histórico → contrato actual;
- purchase personal → reserva, no handoff;
- persistence FAIL explícito;
- mantener IMAGE URL-only hasta migración deliberada.

### P8 — Certificación

No cerrado.

P8 solo se abre como gate final después de P0–P7 relevantes y R0 reliability.

## 8. Orden de implementación

### Fase A — Reliability y verdad

1. R0 persistencia y trazabilidad de fallo.
2. R7 evidencia institucional vectorial reconocida por la capa de respuesta.
3. R8 observabilidad RAG.
4. R1 Recommendation Entry Gate.
5. R2 Catalog Candidate Firewall.
6. R3 Truth Boundary.

### Fase B — Progresión comercial

7. R4 N+1 hard compliance.
8. R5 buying stage + pending action.
9. R6 reserva 1 unidad / qty>=2 handoff.
10. R10 objeciones y alternativa.
11. R11 B2B.
12. R9 aislamiento institucional/comercial.
13. R12 imágenes, solo si existe contrato de transporte seguro; de lo contrario se congela URL-only.

### Fase C — QA y certificación

14. P7 Oracle full facts.
15. negación numérica y contratos Golden obsoletos.
16. tests unit/integration completos + build.
17. Golden100 con `QA_RUN_ID` nuevo.
18. comparar BEFORE vs AFTER y no declarar cierre por percepción.

## 9. Política TDD para la implementación

Cada causa raíz comienza con un test que falle por el defecto real.

Regresiones mínimas requeridas:

1. construcción + caídas entra a recomendación por candidatos reales, sin pregunta genérica innecesaria;
2. un nombre de producto fuera de candidatos/contexto es rechazado por writer;
3. evidencia `SUPABASE_VECTOR_INSTITUCIONAL` produce respuesta institucional válida;
4. `ANSWER_ONLY` no puede devolver una pregunta;
5. PURCHASE personal 1 unidad pide DNI/CE y no activa handoff;
6. PURCHASE qty>=2 activa handoff con producto/cantidad/contexto;
7. “sí/dale” ejecuta la acción comercial pendiente correcta;
8. un turno institucional puro no añade prioridades comerciales nuevas;
9. objeción alternativa no cambia `selectedProduct` sin selección explícita;
10. Oracle puede validar un hecho situado después del carácter 320;
11. “no tiene 5G; sí 4G” no genera falso numeric fabrication por el `5` negado;
12. fallo de persistencia hace fallar explícitamente el turno/journey QA;
13. IMAGE mantiene solo URLs SQL válidas mientras el contrato siga vigente;
14. comparación X13/22 y `el otro` siguen verdes como regresión congelada.

Después de cada bloque:

- test focalizado GREEN;
- suite completa GREEN;
- build GREEN;
- no avanzar si aparece regresión funcional en dimensiones congeladas.

## 10. Gates de salida

### Gates bloqueantes

- persistence = 100%;
- cero turnos HTTP exitosos sin persistencia;
- invented catalog products = 0;
- productIdentity = 100%;
- reference errors = 0 en suite final;
- `ANSWER_ONLY` + pregunta = 0;
- personal 1-unit PURCHASE → handoff = 0;
- reserva 1 unidad progresa por DNI/CE → nombre → dirección → SP real;
- qty>=2 → handoff correcto;
- comparison regressions = 0;
- ningún hard fabrication factual;
- vector institutional evidence reconocida correctamente;
- IMAGE authority sin regresión.

### Objetivos Golden100

Mantener como objetivos mínimos:

- hardPass >= 92/100;
- factAccuracyFails <= 5, después de corregir Oracle;
- intentMismatch <= 5;
- purchaseProgressionFails = 0;
- comparisonFails = 0;
- persistenceFails = 0;
- budgetContextAvailability >= 98%;
- poorSourceUsage <= 10%;
- tokenConsistencyFails = 0;
- sin regresión material de promedio/p95 de tokens salvo justificación documentada.

No se aprobará P8 únicamente porque el número global mejore si queda cualquiera de los gates bloqueantes.

## 11. No objetivos / límites

- no cambiar producción;
- no mergear PR;
- no agregar Stored Procedures fuera de whitelist;
- no hardcodear respuestas por Armor X13/Armor22/25T/etc.;
- no reestructurar RAG desde cero si el vector retrieval actual puede corregirse;
- no usar similitud embedding como ranking de “mejor producto”;
- no debilitar el Oracle para hacer desaparecer RED reales;
- no convertir SPIN en un cuestionario;
- no convertir cada turno en una pregunta;
- no añadir texto junto a imágenes hasta definir un contrato de canal compatible.

## 12. Criterio de cierre por P

Cada P debe quedar documentado con:

- `CODE: GREEN`;
- `REGRESSION: GREEN`;
- `LIVE: GREEN`;
- ejecución/QA_RUN_ID correspondiente;
- cualquier limitación conocida.

Solo entonces se marcará `RESUELTO` en `backend/docs/PLAN-P0-P8-RAG-COMERCIAL.md` y en la auditoría AFTER.

## 13. Decisión propuesta

Aplicar esta remediación por causas raíz y en el orden definido, preservando P4 y los subcontratos ya verdes. La siguiente etapa, después de aprobar este documento, es generar el plan de implementación detallado por archivos/tests y ejecutar con TDD, sin tocar producción.

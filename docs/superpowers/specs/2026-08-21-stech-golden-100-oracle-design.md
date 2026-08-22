# STECH Golden 100 + Oracle QA — Diseño aprobado para implementación

## 1. Objetivo

Crear un gate de calidad realista para el vendedor IA de STECH basado en **100 mensajes de clientes distribuidos en 20 conversaciones de 5 turnos**, usando como referencia una **respuesta-oráculo construida directamente desde SQL/RAG** y no desde la propia salida del chatbot.

El objetivo no es enseñar al bot a pasar 100 frases hardcodeadas. El objetivo es detectar por familia dónde falla el sistema: comprensión, referencia, memoria, SQL, RAG, redacción, N+1, persistencia o handoff.

Este diseño se rige por `docs/COMMERCIAL_CONTRACT.md`.

## 2. Principio central: ORACLE independiente

Cada turno del Golden 100 debe evaluarse contra una verdad independiente del chatbot.

Flujo:

```text
pregunta del cliente
→ Oracle Resolver
→ determinar fuente autoritativa
→ consultar SQL / RAG producto / RAG institucional
→ construir OracleCard de hechos y restricciones
→ ejecutar chatbot con la misma pregunta
→ comparar respuesta + estado persistido contra OracleCard
```

La salida del chatbot **nunca** puede alimentar el Oracle.

### OracleCard mínima

```ts
{
  intentClass,
  authoritativeDomain,      // SQL | PRODUCT_RAG | INSTITUTIONAL_RAG | MEMORY | HANDOFF
  expectedProductId,
  expectedProductName,
  allowedFacts,
  forbiddenFacts,
  expectedReferenceBehavior,
  expectedStateDelta,
  expectedNbaClass,
  requiresHandoff,
  sourceRefs
}
```

El Oracle no redacta una única frase obligatoria. Define **qué debe ser verdad**, qué no puede decirse y qué cambio de estado debe ocurrir.

## 3. Prompt: qué limitar y qué NO poner

### 3.1 Planner GPT-5 mini

Modelo canónico:

`OPENAI_MODEL=gpt-5-mini-2025-08-07`

El planner debe recibir un system prompt corto. Su responsabilidad:

- entender la pregunta actual;
- intención principal y secundarias;
- resolver referentes conversacionales;
- identificar necesidad/problema/prioridad/objeción nueva;
- detectar selección explícita vs mera mención;
- proponer N+1 comercial;
- detectar señal fuerte de compra.

El planner **NO debe decidir**:

- procedimiento SQL;
- `needsSql` / `needsProductRag` / `needsInstitutionalRag`;
- IDs internos de producto;
- precio/stock/políticas/specs;
- locks/persistencia;
- hechos no verificados.

Estas decisiones se derivan en código después de validar intención/referente.

### 3.2 Contexto que recibe el planner

Debe combinar dos fuentes distintas:

**Memoria estable (`ia_contexto`)**

- activeProduct
- salientProduct
- selectedProduct
- recommendedProduct
- comparisonProducts
- budget
- customerType
- sector
- useCase
- problem
- priorities
- quantity
- invoiceRequired
- objection
- purchaseSignal
- commercialStage

**Historia reciente (`ia_conversaciones`)**

Últimos **3 turnos completos** como máximo:

- mensaje cliente
- respuesta vendedor

No enviar al modelo:

- métricas de tokens;
- locks;
- context_version;
- nombres de stored procedures;
- payloads Supabase completos;
- IDs técnicos salvo cuando sean necesarios para ejecutar herramientas, nunca para razonar conversación;
- documentos RAG crudos completos.

### 3.3 Writer GPT-5 mini

El writer recibe únicamente:

1. mensaje actual;
2. decisión validada compacta;
3. memoria comercial relevante;
4. `N+1` canónico;
5. hechos verificados normalizados.

Respuesta objetivo: normalmente **1–3 frases**, máximo **una pregunta útil**.

No debe recibir 8 documentos largos. Debe recibir hechos compactos.

## 4. Distribución de responsabilidades

```text
GPT-5 mini
= comprensión semántica + estrategia conversacional

SQL Server
= identidad comercial + precio + disponibilidad + catálogo + imágenes + pedido protegido

RAG producto
= especificaciones y evidencia técnica del producto canónico

RAG institucional
= políticas / entrega / pagos / garantía / postventa / privacidad / términos / ubicación

Código
= router + validación + guardas + estado + persistencia + handoff + evaluación
```

## 5. Producto RAG

La recuperación técnica se hace por `producto_id` canónico y por las secciones necesarias para la pregunta.

Secciones reales actualmente disponibles incluyen:

- AUDIO
- BATERIA
- CAMARA
- CONECTIVIDAD
- FISICO
- FUNCIONES
- IDENTIFICACION
- MEMORIA
- PANTALLA
- POSICIONAMIENTO
- REDES
- RENDIMIENTO
- RESISTENCIA
- SEGURIDAD
- SENSORES
- SIM
- SISTEMA
- TERMICA

Ejemplos:

```text
"¿Tiene NFC?"          → CONECTIVIDAD / FUNCIONES
"¿Es 5G?"              → REDES / CONECTIVIDAD
"¿Cuánta RAM?"         → MEMORIA
"¿Aguanta caídas?"     → RESISTENCIA
"¿Tiene térmica?"      → TERMICA / CAMARA
"¿Qué batería tiene?"  → BATERIA
```

Para ficha general se puede usar una cobertura comercial reducida; para atributo específico se consulta solo lo necesario.

## 6. RAG institucional

No hacer búsqueda lexical global como primera decisión.

Resolver primero una categoría/subcategoría canónica y luego recuperar evidencia dentro de ese dominio.

Cobertura actual relevante:

- entrega / recojo_tienda
- envios / disponibilidad
- envios / envio_gratuito
- envios / plazo_variable
- garantia / evaluacion_y_resultado
- pagos / cancelacion_pedido
- pagos / confirmacion_pedido
- pagos / contraentrega
- pagos / datos_cierre_venta
- pagos / medios_pago
- pagos / validacion_pago
- pedidos / reserva_separacion
- postventa / cambios_devoluciones
- postventa / devolucion_envio_seguro
- postventa / garantia_general
- postventa / exclusiones / procedimiento / reembolsos
- privacidad / ...
- terminos / ...
- ubicacion / direccion
- ubicacion / horario

El writer recibe solo la respuesta institucional autorizada y metadatos útiles (`requiere_dato`, `requiere_asesor`, etc.), no toda la tabla.

## 7. Memoria y Supabase

### `ia_conversaciones`

Verdad del turno:

- cliente;
- respuesta;
- intención;
- ruta;
- producto objetivo/resuelto;
- SQL/RAG usado;
- N+1;
- SPIN del turno;
- tokens;
- errores;
- snapshot comercial.

### `ia_contexto`

Memoria acumulada:

- producto activo;
- saliencia;
- selección;
- recomendación;
- comparación;
- necesidad/problema/prioridades;
- presupuesto/cantidad;
- objeción;
- señal de compra;
- etapa;
- acción pendiente;
- handoff.

Persistencia debe seguir siendo atómica por turno.

Regla:

`producto consultado ≠ producto activo ≠ producto seleccionado`

## 8. N+1 dinámico

N+1 no es una tabla fija `intent → siguiente pregunta`.

Debe usar intención actual + memoria + evidencia + etapa.

Casos obligatorios:

- producto inexistente → buscar alternativas reales y relevantes;
- fuera de presupuesto → alternativa real dentro del presupuesto;
- objeción precio → justificar valor o alternativa, no repetir el mismo producto sin motivo;
- stock disponible + señal fuerte → avanzar compra;
- compra explícita → handoff, no discovery;
- dato ya conocido → no repetir pregunta;
- pregunta factual → responder antes de preguntar;
- falta un único dato decisivo → máximo una pregunta.

## 9. Golden 100

Gate principal: **20 conversaciones × 5 turnos = 100 mensajes de clientes**.

No 100 preguntas aisladas.

### Distribución mínima

| Familia | Turnos |
|---|---:|
| Necesidad + recomendación + presupuesto | 20 |
| Producto / specs / uso | 15 |
| Comparación + referentes + memoria | 15 |
| Precio + stock + imágenes | 15 |
| Envíos + pagos + garantía + políticas | 15 |
| Objeciones + alternativas | 10 |
| Compra + handoff + empresa | 5 |
| Unknown / contradicción / seguridad | 5 |
| **TOTAL** | **100** |

Las conversaciones deben sonar a clientes reales de Perú, incluyendo mensajes cortos, errores ortográficos y referencias ambiguas naturales.

Ejemplos de estilo:

- `y el otro?`
- `cuanto esta`
- `ese tiene stock?`
- `ya ese quiero`
- `pero esta caro`
- `hay uno mas barato?`
- `aguanta golpes?`
- `y camara?`
- `envian a arequipa?`
- `puedo pagar con yape?`

No hardcodear resultados para frases específicas.

## 10. Cómo se construye cada caso

Cada turno tendrá:

```ts
{
  message,
  semanticExpectation,
  oracleSpec
}
```

Antes de enviar el mensaje al chatbot, el runner construye el `OracleCard` con las fuentes reales.

Ejemplo:

```text
Cliente: "¿Tiene NFC el Armor X13?"

Oracle:
- resolver X13 en SQL catálogo
- obtener producto_id canónico
- consultar RAG secciones CONECTIVIDAD/FUNCIONES
- extraer solo hechos afirmables
- marcar como forbidden cualquier dato no presente

Chatbot:
- recibe la conversación normal
- responde

Evaluator:
- producto correcto
- afirmaciones cubiertas por Oracle
- cero contradicciones
- no precio espontáneo
- N+1 razonable
- estado correcto
```

## 11. Evaluación

### Hard RED

Un solo caso produce RED cuando ocurre:

- producto equivocado;
- referente equivocado;
- precio incorrecto/no autorizado;
- stock inventado o cantidad cruda revelada;
- spec inventada;
- política incorrecta;
- URL inventada;
- switch falso;
- respuesta NULL/error;
- turno/lock abandonado;
- compra fuerte que vuelve a discovery;
- handoff falso o acción no ejecutada presentada como hecha.

### Calidad comercial

Evaluar separadamente:

- resuelve pregunta actual;
- N+1 útil;
- no repite conocido;
- máximo una pregunta;
- SPIN invisible;
- FAB relevante;
- objeción tratada;
- concisión;
- naturalidad;
- avance de compra.

### Memoria/persistencia

- `ia_conversaciones ↔ ia_contexto` consistentes;
- `context_version` secuencial;
- producto activo / queryTarget / selected / recommended correctos;
- comparisonProducts preservado;
- sin PROCESSING abandonados;
- sin `[object Object]`;
- N+1 canónico.

## 12. Reporte Golden 100

El resultado no debe limitarse a `GREEN/YELLOW/RED`.

Debe mostrar al menos:

```text
TOTAL CUSTOMER TURNS       100
PRODUCT IDENTITY           x/100
REFERENCE ACCURACY         x/100
FACTUAL ACCURACY           x/100
NO FABRICATION             x/100
MEMORY CONSISTENCY         x/100
CURRENT QUESTION RESOLVED  x/100
N+1 QUALITY                x/100
PURCHASE PROGRESSION       x/x
PERSISTENCE                x/100
AVG INPUT TOKENS/TURN      x
AVG OUTPUT TOKENS/TURN     x
AVG LATENCY                x ms
```

Y agrupar fallos por causa raíz:

- SEMANTIC
- REFERENCE
- STATE
- SQL
- PRODUCT_RAG
- INSTITUTIONAL_RAG
- WRITER
- NBA
- PERSISTENCE
- HANDOFF

## 13. Orden de implementación

1. Simplificar `OpenAIProvider.decide()` a decisión semántica compacta.
2. Añadir últimos 3 turnos completos desde `ia_conversaciones` al planner.
3. Separar memoria estable vs historia reciente.
4. Mover routing SQL/RAG completamente a código.
5. Crear EvidenceNormalizer para convertir RAG/SQL en hechos compactos.
6. Ampliar ProductEvidencePolicy a todas las secciones técnicas reales.
7. Ampliar InstitutionalTopicResolver a categorías/subcategorías reales.
8. Reducir contexto del writer a decisión + memoria relevante + hechos normalizados + N+1.
9. Implementar OracleResolver independiente del chatbot.
10. Crear los 20 journeys Golden 100.
11. Crear evaluadores Oracle vs chatbot + persistencia Supabase.
12. Ejecutar BEFORE / AFTER con exactamente los mismos 100 turnos.
13. Solo después del Golden 100 estable agregar un fuzz/chaos test adicional con preguntas nuevas.

## 14. Criterio de éxito inicial

Para considerar el sistema listo para una fase de optimización comercial:

- producto correcto: 100%;
- precio/stock factual: 100%;
- fabricación: 0;
- persistencia completada: 100%;
- falso switch: 0;
- compra fuerte avanza: 100%;
- referencias críticas: 100%;
- ningún `PROCESSING` abandonado.

Los aspectos de estilo/SPIN/N+1 pueden iterarse como YELLOW mientras no violen gates duros.

## 15. Regla anti-overprompt

Antes de añadir una instrucción al system prompt se debe preguntar:

> ¿Puede esta regla vivir en código, router, schema, memoria, RAG o evaluador?

Si la respuesta es sí, **no se agrega al prompt**.

El prompt contiene conducta conversacional. La arquitectura contiene verdad, seguridad, routing y estado.

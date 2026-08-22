# STECH — Contrato Conversacional Comercial

**Estado:** Diseño aprobado para implementación  
**Objetivo:** Unificar memoria, SPIN, FAB, N+1, señales comerciales y capacidades reales sin que las capas se contradigan.  
**Alcance:** Backend de ventas B2C de STECH.  
**No cubre:** cambios de producción, cambios destructivos de Supabase, ejecución real de reservas no autorizada, GitHub Actions para QA conversacional.

---

## 1. Principio rector

La conversación debe estar gobernada por una sola secuencia:

```text
MENSAJE ACTUAL
+ ESTADO VIGENTE (ia_contexto)
+ EVIDENCIA DEL TURNO (ia_conversaciones)
+ AUTORIDADES SQL/RAG
        ↓
INTERPRETACIÓN SEMÁNTICA
        ↓
ACTUALIZAR HECHOS COMERCIALES
        ↓
¿SPIN APORTA INFORMACIÓN REALMENTE FALTANTE?
        ↓
DECISIÓN COMERCIAL / N+1
        ↓
VALIDAR CAN_EXECUTE
        ↓
FAB SI SE HABLA DE ATRIBUTOS
        ↓
WRITER
        ↓
GUARDA POST-WRITER
        ↓
RESPUESTA FINAL
```

Ninguna capa puede sobrescribir arbitrariamente una decisión anterior.

---

## 2. Responsabilidad de cada capa

### 2.1 SPIN

SPIN **no decide el siguiente paso comercial final**.

SPIN sirve para descubrir, cuando aporta valor:

- **S — Situación:** uso, sector, contexto.
- **P — Problema:** dolor, limitación, objeción.
- **I — Implicación:** consecuencia práctica del problema.
- **N — Need-payoff:** qué mejora busca el cliente y qué criterio prioriza.

SPIN debe ser oportunista, no obligatorio.

Reglas:

1. No preguntar algo ya conocido.
2. No ejecutar una pregunta SPIN si el cliente ya está en compra/cierre.
3. No hacer una pregunta SPIN solo para completar una plantilla.
4. Una pregunta SPIN solo es válida si su respuesta cambia una decisión posterior.
5. SPIN alimenta memoria y ranking; no controla directamente el writer.

### 2.2 N+1 / Next Best Action

N+1 es la **autoridad comercial del siguiente movimiento**.

Debe responder:

> Después de resolver la intención actual, ¿cuál es la única siguiente acción útil, ejecutable y no repetitiva?

N+1 puede ser:

- `ANSWER_ONLY`
- `ASK_MISSING_FACT`
- `RECOMMEND`
- `COMPARE`
- `CHECK_PRICE`
- `CHECK_STOCK`
- `OFFER_ALTERNATIVE`
- `SOFT_CLOSE`
- `COLLECT_RESERVATION_DATA`
- otra acción solamente si existe una capability real registrada.

N+1 **no significa siempre hacer una pregunta**.

### 2.3 FAB

FAB se activa cuando el turno trata de atributos/características del producto o cuando una recomendación necesita justificar valor.

```text
FEATURE verificada
→ ADVANTAGE razonable
→ BENEFIT relacionado con el contexto conocido
```

- **Feature:** siempre viene de SQL/RAG/documentación verificada.
- **Advantage:** inferencia comercial segura.
- **Benefit:** relación con el uso/problema/prioridad conocido.

El LLM puede redactar Advantage/Benefit.
El LLM no puede inventar Features, cifras, compatibilidades ni resultados exactos.

---

## 3. Regla para evitar conflicto SPIN ↔ N+1

El orden de autoridad es:

```text
1. Resolver la pregunta/intención actual
2. Procesar respuesta a pregunta pendiente, si existe
3. Actualizar hechos comerciales
4. Evaluar compra/interés/objeción
5. Evaluar si falta un dato con impacto real
6. SPIN propone solamente preguntas faltantes válidas
7. N+1 elige UNA acción final
8. CAN_EXECUTE valida la acción
9. Writer ejecuta únicamente esa acción
```

SPIN puede proponer un `missingFact`, pero N+1 decide si preguntarlo.

Ejemplo:

```text
Cliente: "Trabajo en construcción y se me cae el celular"

SPIN descubre:
sector=construccion
problem=caidas_frecuentes
priority=resistencia

Si ya existe evidencia suficiente para recomendar:
N+1 = RECOMMEND

NO obligar a otra pregunta SPIN.
```

Otro ejemplo:

```text
Cliente: "Está caro"

objection=precio
budget=null

SPIN/missingFact puede proponer BUDGET.
N+1 valida que presupuesto cambia ranking.
N+1 = ASK_MISSING_FACT(BUDGET)
```

---

## 4. Regla universal para preguntas

Una pregunta solo puede llegar al cliente si cumple las tres condiciones:

```text
UNKNOWN = true
DECISION_IMPACT = true
CAN_CONSUME_ANSWER = true
```

Si una condición falla, no se pregunta.

### Ejemplos válidos

- presupuesto cuando cambia la recomendación;
- uso cuando todavía no sabemos qué criterio priorizar;
- prioridad cuando existen dos alternativas técnicamente válidas;
- ciudad solo cuando una política de delivery realmente depende de ciudad y existe soporte para responderla.

### Ejemplos inválidos

- preguntar nuevamente uso si ya está en `ia_contexto`;
- pedir horario para una demo que STECH no puede agendar;
- pedir datos que el backend no sabe almacenar o utilizar;
- continuar discovery cuando `purchaseSignal=true`.

---

## 5. `ia_conversaciones` — evidencia histórica por turno

`ia_conversaciones` registra qué ocurrió en cada turno. No es autoridad factual vigente para precio, stock o políticas.

### Campos principales

| Campo | Papel |
|---|---|
| `mensaje_cliente` | mensaje original |
| `respuesta_bot` | respuesta final enviada |
| `intencion` | intención final del turno |
| `etapa_comercial` | etapa del turno |
| `producto_id_resuelto` | producto objetivo del turno |
| `atributo_detectado` | atributo actual: batería, RAM, cámara, resistencia, etc. |
| `prioridades_detectadas` | prioridades descubiertas/acumuladas |
| `objecion_detectada` | objeción del turno |
| `implicaciones_detectadas` | consecuencias comerciales inferidas de problemas reales |
| `pregunta_pendiente_turno` | pregunta comercial que se decidió formular |
| `accion_pendiente_turno` | N+1 finalmente autorizado/executable |
| `siguiente_accion` | representación compacta de la acción final |
| `nivel_interes` | puntuación/estado histórico de interés |
| `probabilidad_compra` | señal analítica secundaria |
| `perfil_cliente` | adaptación de estilo/argumentación |
| `score_total_mensaje` | señal secundaria de analítica |
| `contexto_comercial_snapshot` | fotografía del estado después del turno |

### Regla crítica

`accion_pendiente_turno` debe guardar **la acción ya validada por `CAN_EXECUTE`**, no una sugerencia preliminar del planner/LLM.

`pregunta_pendiente_turno` debe existir solo cuando la pregunta pasó la regla:

```text
UNKNOWN + DECISION_IMPACT + CAN_CONSUME_ANSWER
```

---

## 6. `ia_contexto` — estado operativo vigente

`ia_contexto` representa lo que el agente debe considerar **ahora**.

Debe contener o proyectar de forma canónica:

- producto activo;
- producto seleccionado;
- producto recomendado vigente;
- producto/query target del turno;
- etapa comercial;
- use case / actividad;
- sector;
- problema vigente;
- implicación útil vigente;
- presupuesto vigente;
- prioridades vigentes;
- objeción vigente;
- atributo activo;
- interés actual;
- señal de compra;
- nivel de interés vigente;
- pregunta pendiente vigente;
- acción pendiente vigente;
- estado de reserva cuando corresponda;
- versión/context version.

### Regla de actualización

```text
ia_conversaciones = HISTORIA
ia_contexto       = ESTADO ACTUAL
```

Un nuevo valor explícito reemplaza el anterior cuando corresponde:

- nuevo presupuesto → reemplaza presupuesto;
- nuevo producto explícito → actualiza producto activo/query target según contrato;
- objeción resuelta → no queda activa para siempre;
- prioridad nueva → se agrega/normaliza;
- compra confirmada → discovery deja de dominar.

---

## 7. Nivel de interés 0–100

`nivel_interes` debe reflejar **cantidad + tipo + progresión** de interacción.

No debe ser simplemente “número de preguntas”.

### Propuesta de ponderación

| Señal | Puntos orientativos |
|---|---:|
| pregunta técnica sobre atributo | +4 |
| segunda/tercera característica del mismo producto | +3 c/u, con tope |
| pregunta precio | +8 |
| pregunta stock | +10 |
| garantía/delivery/pago | +5 |
| compara modelos | +7 |
| pide recomendación | +10 |
| explica uso/necesidad | +6 |
| da presupuesto | +8 |
| objeción y continúa evaluando | +7 |
| “me interesa” | +15 |
| “si hay stock me interesa” | +18 |
| “cómo compro” | +20 |
| elección explícita “quiero ese” | +25 |

### Anti-inflación

- repetir la misma pregunta no suma indefinidamente;
- varias preguntas del mismo atributo tienen tope;
- el score se recalcula/normaliza sobre señales únicas relevantes;
- `purchaseSignal` y señales determinísticas siempre tienen prioridad sobre el score.

### Lectura comercial sugerida

```text
0–19   BAJO
20–39  EXPLORANDO
40–59  INTERESADO
60–79  ALTO
80–100 COMPRA_CERCANA
```

El score orienta la intensidad del N+1, pero no reemplaza señales explícitas.

---

## 8. Probabilidad de compra

`probabilidad_compra` es distinta de `nivel_interes`.

- **nivel_interes:** cuánto investiga/se involucra.
- **probabilidad_compra:** qué tan cerca muestran sus señales de una compra real.

Debe considerar, entre otras:

- producto elegido;
- presupuesto compatible;
- precio consultado/aceptado;
- stock consultado;
- interés explícito;
- pregunta de compra;
- selección explícita;
- `purchaseSignal`.

No debe gobernar decisiones críticas por sí sola.

---

## 9. Perfil del cliente

`perfil_cliente` adapta la forma de vender, no los hechos.

Ejemplos conceptuales:

- `PRACTICO`: corto, directo, beneficio claro.
- `TECNICO`: puede tolerar más detalle verificable.
- `PRECIO_SENSIBLE`: priorizar valor, presupuesto y alternativas.
- `COMPARADOR`: mostrar diferencias y criterio decisivo.

Nunca cambia SQL/RAG ni permite inventar datos.

---

## 10. Atributo detectado + FAB

Cuando `atributo_detectado` existe y hay `verifiedFeature`, FAB debe activarse de forma preferente.

```text
IF atributo_detectado != null
AND verifiedFeature exists
THEN SAFE_FAB
```

### Mapeos conceptuales

| Atributo | Feature | Beneficio seguro posible |
|---|---|---|
| BATERIA | mAh / W | más margen durante la jornada |
| RAM | RAM física + virtual | más margen para multitarea |
| RESISTENCIA | IP68/IP69K/caída | mejor encaje para obra/campo/golpes |
| CAMARA | MP/sensor/night vision | utilidad para registrar detalles/baja luz cuando aplique |
| PANTALLA | tamaño/resolución/Hz | visibilidad/fluidez |
| NFC | NFC confirmado | uso de funciones compatibles basadas en NFC |

FAB no debe afirmar autonomía exacta, rendimiento exacto ni equivalencias no verificadas.

---

## 11. RAM física + virtual

Cuando RAG tenga ambos valores:

```text
RAM física = X GB
RAM virtual máxima = Y GB
```

El writer puede decir:

> “X GB de RAM física + hasta Y GB de RAM virtual.”

Puede mencionar total combinado únicamente dejando explícito que incluye RAM virtual.

Nunca decir “16 GB de RAM” si son 8 GB físicos + 8 GB virtuales.

---

## 12. Implicaciones detectadas

`implicaciones_detectadas` conecta problema con beneficio.

Ejemplo:

```text
problem = caidas_frecuentes
implication = riesgo de daño / interrupción / reemplazo
verifiedFeature = resistencia a caídas 1.5 m
```

FAB puede expresar:

> “Para obra y golpes frecuentes, esa resistencia reduce el riesgo de quedarte sin equipo por una caída.”

No debe convertir la implicación en una afirmación cuantitativa no respaldada.

---

## 13. Prioridad de decisión N+1

Orden recomendado:

```text
1. Resolver respuesta a pregunta pendiente
2. purchaseSignal
3. interestSignal
4. objeción activa
5. acción pendiente válida
6. selectedProduct
7. recommendedProduct vigente
8. activeProduct / queryTarget
9. commercialStage
10. nivel_interes
11. budget
12. problem + implications
13. priorities
14. atributo_detectado
15. useCase / sector
16. missingFact realmente útil
17. CommercialCapabilities / CAN_EXECUTE
```

Las señales determinísticas vencen a scores numéricos.

---

## 14. CommercialCapabilities

El sistema debe conocer solamente capacidades implementadas hoy.

Ejemplos:

```text
CHECK_PRICE
CHECK_STOCK
ANSWER_PRODUCT_FEATURE
COMPARE_PRODUCTS
RECOMMEND_PRODUCT
ANSWER_WARRANTY
ANSWER_DELIVERY
ANSWER_PAYMENT
ANSWER_LOCATION
SHOW_IMAGES
COLLECT_RESERVATION_DATA
ANSWER_ONLY
```

Cada capability tiene precondiciones.

### Ejemplo

```text
CHECK_STOCK:
- producto resuelto
- SQL disponible

COMPARE_PRODUCTS:
- >= 2 productos resueltos
- evidencia Product RAG suficiente

SHOW_IMAGES:
- URLs reales recuperadas

COLLECT_RESERVATION_DATA:
- purchaseSignal=true
- etapa compatible
- contrato de reserva permitido
```

No registrar capacidades aspiracionales como “agendar demo” si no existe implementación real.

---

## 15. CAN_EXECUTE

Antes del writer:

```text
candidateNBA
→ relevance check
→ known/missing check
→ capability check
→ authority/preconditions check
→ executableNBA
```

Si no es ejecutable:

1. intentar un `ASK_MISSING_FACT` válido;
2. si no existe, `ANSWER_ONLY`.

Nunca degradar a otra promesa inventada.

---

## 16. Contrato del Writer

El writer recibe solamente:

- intención actual;
- `executableNBA`;
- etapa comercial;
- `knownFacts`;
- `missingFact` válido;
- señales de interés/compra;
- productos activos/seleccionados/recomendados;
- useCase/problem/priorities/budget;
- atributo detectado;
- implicaciones útiles;
- `verifiedFeatures`;
- capabilities permitidas.

El writer puede:

- elegir tono y redacción;
- aplicar FAB seguro;
- reconocer objeciones;
- ejecutar el N+1 autorizado.

El writer no puede:

- crear nuevas acciones;
- prometer capacidades no soportadas;
- inventar características;
- cambiar producto objetivo sin autorización del state engine;
- reabrir discovery en compra confirmada.

---

## 17. Guarda post-writer

La respuesta final debe ser validada para evitar:

- promesas operativas no autorizadas;
- lenguaje interno (`RAG`, `oracle`, `confidence`, “según la fuente”, “según ficha técnica” como muletilla);
- cifras no soportadas;
- cambio de producto no autorizado;
- pregunta repetida;
- CTA no incluido en `executableNBA`.

Si falla, reescribir de forma segura sin inventar una acción alternativa.

---

## 18. Estilo comercial

La respuesta ideal:

```text
RESUELVE
+ FAB si hay atributo relevante
+ UNA progresión comercial útil cuando corresponda
```

Evitar:

- sonar a QA;
- explicar fuentes internas;
- preguntas innecesarias;
- listas técnicas enormes;
- “te agendo / coordino / te llamarán” sin capability;
- “según su ficha técnica” como frase rutinaria.

---

## 19. Ejemplo completo sin contradicción SPIN/N+1/FAB

### Turno 1

Cliente:
> Trabajo en construcción, se me cae bastante el celular.

Estado detectado:

```text
sector=construccion
useCase=trabajo
problem=caidas_frecuentes
priorities=[resistencia]
atributo_detectado=RESISTENCIA
```

SPIN ya obtuvo suficiente Problema/Implicación.
No debe forzar otra pregunta.

N+1:

```text
RECOMMEND
```

Respuesta:

> “Para ese uso te recomiendo el Armor 22: tiene IP68, IP69K y resistencia a caídas de hasta 1.5 m, así que encaja bien para trabajo en obra y golpes frecuentes.”

### Turno 2

Cliente:
> Y necesito batería todo el día.

Actualización:

```text
priorities += bateria
atributo_detectado=BATERIA
```

FAB:

> “Tiene 6600 mAh y carga de 33 W. Para una jornada larga de trabajo te da más margen durante el día.”

Si presupuesto falta y cambia la recomendación:

```text
N+1=ASK_MISSING_FACT(BUDGET)
```

### Turno 3

Cliente:
> Máximo 1500.

Consume pregunta pendiente:

```text
budget=1500
pregunta_pendiente=null
```

N+1:

```text
RECOMMEND_WITHIN_BUDGET / SOFT_CLOSE
```

Respuesta:

> “Con ese presupuesto, el Armor 22 encaja bien con resistencia y batería. ¿Quieres que revise stock?”

### Turno 4

Cliente:
> Si está disponible me interesa.

```text
interestSignal=true
purchaseSignal=false
N+1=CHECK_STOCK/SOFT_CLOSE
```

SQL responde stock.

> “Sí, está disponible. ¿Quieres avanzar con ese modelo?”

### Turno 5

Cliente:
> Ya ese quiero, ¿cómo compro?

```text
purchaseSignal=true
selectedProduct=Armor22
commercialStage=CIERRE
```

SPIN queda subordinado: no más discovery.

N+1:

```text
COLLECT_RESERVATION_DATA
```

---

## 20. Regla de certificación

Un turno solo pasa N+1 si:

```text
DECISION_CORRECT
AND DELIVERY_CORRECT
AND ACTIONABLE
AND NOT_REPEATED
AND CONSISTENT_WITH_STAGE
AND SUPPORTED_BY_AUTHORITY
```

Métricas recomendadas:

- `nbaDecisionQuality`
- `nbaDeliveryQuality`
- `nbaActionabilityQuality`
- `commercialProgression`
- `spinUtilityQuality`
- `fabGroundingQuality`

N+1 no queda PASS si una acción no es ejecutable aunque el texto “suene comercial”.

---

## 21. Progresión comercial después de responder

Resolver correctamente la consulta actual no cierra por defecto la decisión comercial. Una vez resuelta con su autoridad correspondiente, el motor debe reevaluar el contexto actualizado:

```text
RESOLVE_CURRENT_ANSWER
→ UPDATE_COMMERCIAL_CONTEXT
→ POST_ANSWER_COMMERCIAL_PROGRESSION
→ CANDIDATE_NBA
→ CAN_EXECUTE
→ CONTINUITY_GATES
→ EXECUTABLE_NBA
→ WRITER
```

`ANSWER_ONLY` es el fallback seguro final cuando no existe una progresión útil, relevante y ejecutable; no es el resultado automático de toda consulta factual.

La evaluación usa `purchaseSignal`, `interestSignal`, etapa, `levelOfInterest`, objeción, productos vigentes, presupuesto, uso, problema, prioridades, atributos, acciones/preguntas pendientes, hechos SPIN e `interestEvents`. Las señales explícitas siempre vencen al score.

- `HIGH`: compra, selección o interés explícito con una acción soportada.
- `MEDIUM`: contexto maduro y respuesta verificada que habilitan una progresión útil.
- `LOW`: dato aislado, contexto insuficiente o ausencia de una acción soportada; termina en `ANSWER_ONLY`.

No se fuerza una pregunta para aparentar progresión. SPIN solo puede aportar un `missingFact` desconocido, decisivo y consumible, y nunca desplaza una acción de mayor valor. El turno entrega exactamente un NBA y `CAN_EXECUTE` puede degradarlo únicamente a una pregunta válida o a `ANSWER_ONLY`, sin inventar otra promesa.

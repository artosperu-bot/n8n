# STECH — IMPLEMENT COMMERCIAL CONVERSATION CONTRACT

Implementa el contrato definido en `STECH_CONVERSATION_COMMERCIAL_CONTRACT.md`.

## Restricciones

- No hacer otra auditoría general.
- No GitHub Actions para QA conversacional.
- No tocar producción.
- No modificar SQL authority, persistencia, RAG institucional o reserva salvo regresión concreta que lo exija.
- No crear nuevas columnas en Supabase inicialmente.
- No hardcodear modelos, precios, stock, RAM ni frases por producto.
- QA conversacional Live lo ejecuta el usuario localmente.

## Objetivo

Unificar:

```text
SPIN → descubre solo información útil
N+1 → decide la única siguiente acción comercial
CAN_EXECUTE → valida que STECH pueda realizarla
FAB → convierte atributos verificados en beneficio contextual
WRITER → redacta, pero no inventa decisiones/capacidades
```

SPIN, FAB y N+1 no pueden competir entre sí.

## Implementación requerida

### P0 — Contrato N+1 ejecutable

1. Construir/fortalecer contrato comercial antes del writer con:
   - current intent
   - commercialStage
   - knownFacts
   - missingFacts
   - selected/active/recommended product
   - interestSignal
   - purchaseSignal
   - objection
   - budget
   - problem
   - implications
   - priorities
   - attribute
   - levelOfInterest
   - pendingQuestion
   - pendingAction
   - verifiedFeatures
   - capabilities

2. Generar `candidateNBA`.
3. Validar `CAN_EXECUTE`.
4. Producir `executableNBA`.
5. El writer recibe solo `executableNBA`.
6. El writer no puede agregar otro CTA independiente.

### P0 — Preguntas procesables

Una pregunta solo es válida si:

```text
UNKNOWN
AND DECISION_IMPACT
AND CAN_CONSUME_ANSWER
```

SPIN puede proponer la pregunta, pero N+1 decide si se ejecuta.

No preguntar datos ya presentes en `ia_contexto`.
No continuar discovery con `purchaseSignal=true`.

### P0 — Capabilities reales

Crear/consolidar `CommercialCapabilities` con capacidades que realmente existen hoy.

Como mínimo evaluar:

- CHECK_PRICE
- CHECK_STOCK
- ANSWER_PRODUCT_FEATURE
- COMPARE_PRODUCTS
- RECOMMEND_PRODUCT
- ANSWER_WARRANTY
- ANSWER_DELIVERY
- ANSWER_PAYMENT
- ANSWER_LOCATION
- SHOW_IMAGES
- COLLECT_RESERVATION_DATA
- ANSWER_ONLY

Cada capability debe verificar precondiciones del turno.

No registrar/agregar capabilities ficticias como agenda de demo si no existe backend real.

### P0 — Guarda post-writer

Detectar y bloquear/reformular:

- promesa no incluida en executableNBA;
- acción no soportada;
- lenguaje interno customer-facing;
- cifra no soportada;
- pregunta repetida;
- cambio de producto no autorizado.

Regresión obligatoria:

USER:
"¿Pueden agendarme una prueba del equipo?"

El sistema NO puede responder que la agenda/coordina si esa capability no existe.

### P1 — SPIN sin corrupción

SPIN no es una máquina de cuatro preguntas.

Debe:

- detectar Situation/Problem/Implication/Need-payoff;
- persistir hechos útiles;
- no preguntar lo conocido;
- no forzar preguntas si ya puede recomendar;
- apagarse/subordinarse en cierre.

Añadir `spinUtilityQuality` o equivalente en QA:

PASS solamente si una pregunta SPIN:

- era realmente desconocida;
- cambia una decisión;
- puede procesarse;
- no retrasa una compra ya clara.

### P1 — Nivel de interés 0–100

Implementar/normalizar `nivel_interes` usando cantidad + calidad + progresión.

Pesos orientativos:

- pregunta atributo +4;
- segunda/tercera feature +3 con tope;
- precio +8;
- stock +10;
- garantía/delivery/pago +5;
- comparación +7;
- recomendación +10;
- uso/necesidad +6;
- presupuesto +8;
- objeción y sigue evaluando +7;
- interés explícito +15;
- interés condicionado +18;
- cómo comprar +20;
- selección explícita +25.

Evitar inflación por repetición.

Las señales explícitas mandan:

```text
purchaseSignal > score
interestSignal > score cuando corresponde
```

Persistir nivel histórico por turno en `ia_conversaciones` y estado vigente/proyectado en contexto sin crear columnas nuevas si no son necesarias.

### P1 — Campos útiles de ia_conversaciones

Conectar realmente a la lógica/persistencia, sin poblar por poblar:

- `atributo_detectado`
- `implicaciones_detectadas`
- `prioridades_detectadas`
- `objecion_detectada`
- `pregunta_pendiente_turno`
- `accion_pendiente_turno`
- `nivel_interes`
- `contexto_comercial_snapshot`

`accion_pendiente_turno` debe guardar la acción FINAL después de CAN_EXECUTE.

`pregunta_pendiente_turno` debe corresponder al missingFact realmente preguntado.

No es obligatorio conectar todavía como autoridad primaria:

- `probabilidad_compra`
- `perfil_cliente`
- `score_total_mensaje`

Pueden seguir como señales secundarias hasta tener contrato estable.

### P1 — FAB general

Cuando exista `atributo_detectado` + `verifiedFeature`:

```text
FEATURE → SAFE ADVANTAGE → CONTEXTUAL BENEFIT
```

Aplicar a:

- batería
- RAM
- resistencia
- cámara
- pantalla
- NFC
- cualquier otro atributo verificable

No hardcodear modelo/frase.

No inventar autonomía, desempeño, compatibilidad o cifras.

### P1 — RAM física + virtual

Si Product RAG contiene ambas:

- RAM física
- RAM virtual máxima

proyectarlas juntas hasta writer.

Formato:

"8 GB de RAM física + hasta 8 GB de RAM virtual"

Nunca "16 GB de RAM" sin aclarar la parte virtual.

### P1 — Referencias

Mantener regla:

```text
EXPLICIT CURRENT VALID PRODUCT
>
STALE PREVIOUS RECOMMENDATION
```

Caso de regresión:

Armor 30 desconocido
→ "mejor dime del Armor X13"
→ "aguanta caídas?"

La última pregunta sigue dirigida a X13, no a una recomendación vieja de Armor22.

### P1 — Atributos físicos

Peso/dimensiones/grosor/tamaño físico deben mapear a Product RAG/FISICO.

Caso:

"¿Cuánto pesa el Armor 22?"

debe ser `CAPABILITY/PRODUCT_SPEC` equivalente funcional, no `OTHER` si el atributo está soportado.

### P1 — Objeción

Cuando haya objeción:

```text
ACKNOWLEDGE
+
NEXT USEFUL ACTION
```

Ejemplo conceptual:

"Está muy caro"
→ reconocer restricción
→ preguntar presupuesto si falta
→ alternativa si presupuesto ya existe.

No hardcodear la frase exacta.

## Prioridad N+1

Usar este orden:

```text
1. respuesta a pregunta pendiente
2. purchaseSignal
3. interestSignal
4. objection
5. pending executable action
6. selectedProduct
7. recommendedProduct vigente
8. activeProduct/queryTarget
9. commercialStage
10. nivel_interes
11. budget
12. problem + implications
13. priorities
14. attribute
15. useCase/sector
16. valid missingFact
17. CommercialCapabilities/CAN_EXECUTE
```

Scores numéricos nunca vencen señales determinísticas explícitas.

## QA

No crear decenas de tests.

Agregar regresiones compactas para:

1. SPIN no repite dato conocido.
2. SPIN no interrumpe compra confirmada.
3. `ASK_MISSING_FACT` solo pregunta unknown+impact+consumable.
4. unsupported capability nunca llega al cliente.
5. writer no crea CTA fuera de executableNBA.
6. nivel_interes sube por señales útiles y no se infla por repetición.
7. atributo detectado activa FAB grounded.
8. RAM física+virtual.
9. stale recommendation no roba referencia explícita.
10. peso/dimensiones enrutan a Product RAG físico.
11. objeción de precio se reconoce antes de avanzar.

## CORE LIVE

Mantener <=25 turnos.

No Golden100 todavía.

El CORE debe cubrir:

- construcción;
- batería;
- RAM física+virtual;
- precio;
- stock;
- comparación;
- objeción;
- interés condicionado;
- compra;
- pregunta pendiente/respuesta corta;
- capability no soportada;
- referencia después de recomendación vieja;
- atributo físico.

Añadir métricas:

- nbaDecisionQuality
- nbaDeliveryQuality
- nbaActionabilityQuality
- commercialProgression
- spinUtilityQuality
- fabGroundingQuality

Un turno N+1 no pasa si la acción es comercialmente bonita pero no ejecutable.

## Ejecución

No detenerse entre fixes mientras todo sea código/tests/docs y no producción.

Al terminar:

STATUS:
ROOT:
CHANGED:
VERIFIED:
NEXT:

Si necesita Live QA:

LOCAL QA REQUIRED

OBJETIVO:
Validar SPIN + N+1 + FAB + actionability + memory sin contradicción.

COMANDO:
<UN SOLO BLOQUE POWERSHELL>

QUÉ DEBO DEVOLVERTE:
summary.json
failures.json
conversation-report.txt

IMPLEMENTA AHORA.

## Delta obligatorio: POST_ANSWER_COMMERCIAL_PROGRESSION

No tratar `ANSWER_ONLY` como default por el solo hecho de que la intención actual sea factual. Después de recuperar y resolver la respuesta actual, actualizar las señales comerciales y evaluar si existe un siguiente movimiento útil, relevante y ejecutable.

```text
respuesta actual resuelta
→ contexto comercial actualizado
→ ProgressionOpportunity HIGH / MEDIUM / LOW
→ candidateNBA único
→ CAN_EXECUTE
→ continuity gates
→ executableNBA
→ writer
```

La oportunidad debe considerar señales explícitas antes que scores, el historial no repetido de interés, la etapa y todos los hechos comerciales vigentes. El interés bajo cambia la intensidad del N+1, pero no lo elimina normalmente. Precio, stock o un atributo verificado deben añadir exactamente una continuación ligera relacionada cuando SQL/Product RAG permiten hacerlo con seguridad.

Regresiones compactas obligatorias:

- precio después de interacciones significativas progresa cuando está soportado;
- atributo verificado con problema/prioridad maduros puede progresar;
- hecho técnico aislado y verificado recibe un `RELATED_VALUE` ligero, declarativo y grounded;
- no se formula una pregunta inútil;
- SPIN no desplaza una acción superior;
- se entrega exactamente un NBA;
- capability no ejecutable degrada de forma segura;
- producto y etapa conservan continuidad.

Regla autoritativa:

> STECH N+1 significa que una pregunta normal elegible recibe la respuesta grounded a la solicitud actual más exactamente una continuación relacionada, útil y ejecutable. `LOW` cambia la intensidad del `+1`; no lo elimina normalmente. `ANSWER_ONLY` es un fallback seguro excepcional, no el default del primer turno ni de una pregunta comercial con interés bajo.

El selector reusable puede producir `RELATED_VALUE` únicamente acompañado por un `CommercialMove` estructurado. Como mínimo debe transportar `kind`, producto objetivo, intensidad, motivo, base de autoridad, atributo, facts verificados y contexto real relevante.

N+1 no es una etiqueta de acción. La capa de decisión determina el valor semántico exacto antes del writer; el writer solo lo verbaliza. No puede decidir qué significa `RELATED_VALUE`, sustituir el movimiento, inventar otro beneficio o agregar un segundo `+1`.

El `CommercialMove` debe derivarse exclusivamente desde SQL, `verifiedFeatures` y contexto comercial real, y debe pasar `CAN_EXECUTE`. Si el payload es insuficiente, se degrada antes del writer. La guarda post-writer debe rechazar filler genérico que no entregue los facts/contexto seleccionados.

No tratar propósitos internos de consulta (`precio`, `conocer_precio`, `stock_availability`, `saber_disponibilidad`) como use cases del cliente para FAB o beneficios contextuales.

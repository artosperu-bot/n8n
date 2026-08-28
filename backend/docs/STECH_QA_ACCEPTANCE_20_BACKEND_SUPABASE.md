# STECH — QA 20: CONTRATO ESPERADO BACKEND + SUPABASE

**Estado:** contrato operativo de aceptación para la primera tanda de 20 conversaciones LIVE  
**Branch:** `feat/stech-backend`  
**Autoridad relacionada:** `STECH_BACKEND_MASTER.md`, `STECH_CONVERSATION_ACCEPTANCE_100.md`, `STECH_CONVERSATION_COMMERCIAL_CONTRACT.md`  
**Objetivo:** definir, antes de probar, qué debe ocurrir en el backend y qué debe quedar persistido en `ia_conversaciones` e `ia_contexto` para los primeros 20 escenarios.

> Este documento NO es un set de frases a memorizar. Los mensajes son ejemplos. El backend debe cumplir el mismo contrato ante variantes naturales, errores de escritura y mensajes equivalentes.

> **QA conversacional LIVE:** lo ejecuta el usuario externamente. No usar tests locales ni GitHub Actions como prueba de comportamiento conversacional.

---

## 0. Regla de lectura de Supabase

```text
ia_conversaciones = QUÉ PASÓ EN ESTE TURNO
ia_contexto       = QUÉ DEBE SABER / CONSERVAR EL AGENTE AHORA
```

### `ia_conversaciones` — evidencia por turno

Campos que deben tener sentido entre sí:

- `mensaje_cliente`
- `respuesta_bot`
- `intencion`
- `ruta`
- `objetivo` / `siguiente_accion`
- `producto_detectado`
- `producto_id_resuelto`
- `producto_codigo_resuelto`
- `estado_resolucion_producto`
- `origen_resolucion_producto`
- `producto_objetivo_turno` (`queryTarget`, `activeProduct`, `salientProduct`, `selectedProduct`, `recommendedProduct`)
- `presupuesto_detectado`
- `etapa_comercial`
- `objecion_principal`
- `cambio_producto_explicito`
- `requiere_sql`
- `requiere_rag`
- `spin_aporte`
- `spin_fase_actual`
- `actividad_detectada`
- `problemas_detectados`
- `prioridades_detectadas`
- `atributo_detectado`
- `implicaciones_detectadas`
- `pregunta_pendiente_turno`
- `accion_pendiente_turno`
- `contexto_comercial_snapshot`

### `ia_contexto` — estado vigente

Dentro de `contexto` deben ser coherentes, según el caso:

- `activeProduct`
- `queryTarget`
- `salientProduct`
- `selectedProduct`
- `recommendedProduct`
- `comparisonProducts`
- `budget`
- `useCase`
- `sector`
- `problem`
- `priorities`
- `objection`
- `purchaseSignal`
- `commercialStage`
- `lastIntent`
- `lastNba`
- `pendingCommercialAction`
- `pendingMissingFact`
- `reservationStage`

### Regla crítica

`queryTarget` puede cambiar para contestar una consulta puntual SIN cambiar `activeProduct`.

```text
mención ≠ switch
consulta puntual ≠ switch
recomendación ≠ selección
selección explícita = selectedProduct
cambio explícito = activeProduct cambia
```

Precio y stock nuevos deben venir de SQL actual; no de memoria histórica.

---

# CASO 01 — Precio → stock → compra

### T1 Cliente
`¿Cuánto cuesta el Armor 22?`

**BACKEND esperado**
- `finalIntent=PRICE`
- producto resuelto: `Armor 22`
- `route=SQL_PRICE`
- SQL requerido
- `activeProduct=Armor 22`
- `queryTarget=Armor 22`
- `purchaseSignal=false`
- N responde precio actual y +1 relacionado con stock/avance

**ia_conversaciones esperado**
- `intencion=PRICE`
- `producto_detectado=Armor 22`
- `estado_resolucion_producto=CONFIRMADO`
- `requiere_sql=true`
- `ruta=SQL_PRICE`
- `producto_objetivo_turno.activeProduct=Armor 22`
- `producto_objetivo_turno.queryTarget=Armor 22`

**ia_contexto esperado**
- `activeProduct=Armor 22`
- `queryTarget=Armor 22`
- `selectedProduct=null`
- `purchaseSignal=false`

### T2 Cliente
`¿Y tienes stock?`

**BACKEND esperado**
- `finalIntent=STOCK`
- referente heredado: Armor 22
- `route=SQL_STOCK`
- no pedir modelo nuevamente
- `activeProduct` sigue Armor 22
- +1 puede ser soft close/avance

**ia_conversaciones**
- `intencion=STOCK`
- `producto_detectado=Armor 22`
- `origen_resolucion_producto` compatible con contexto/producto activo
- `ruta=SQL_STOCK`

**ia_contexto**
- `activeProduct=Armor 22`
- `queryTarget=Armor 22`
- `lastIntent=STOCK`

### T3 Cliente
`Ya, quiero comprarlo.`

**BACKEND esperado**
- `finalIntent=PURCHASE`
- producto seleccionado: Armor 22
- `purchaseSignal=true`
- `commercialStage=CIERRE`
- `NBA=COLLECT_RESERVATION_DATA`
- no SPIN
- no afirmar compra/reserva ejecutada

**ia_conversaciones**
- `intencion=PURCHASE`
- `producto_objetivo_turno.selectedProduct=Armor 22`
- `accion_pendiente_turno.accion=COLLECT_RESERVATION_DATA`
- `etapa_comercial=CIERRE`

**ia_contexto**
- `activeProduct=Armor 22`
- `selectedProduct=Armor 22`
- `purchaseSignal=true`
- `reservationStage` inicia captura de datos

---

# CASO 02 — Necesidad de batería + construcción

### T1
`Necesito un celular que me dure todo el día trabajando.`

**BACKEND**
- intención de evaluación/uso, no PRICE/PRODUCTO arbitrario
- puede formular COMO MÁXIMO una pregunta útil si falta contexto
- detectar prioridad batería/autonomía

**ia_conversaciones**
- `prioridades_detectadas` incluye batería/autonomía si fue detectada
- `pregunta_pendiente_turno` solo si falta un dato con impacto real

**ia_contexto**
- `priorities` conserva batería/autonomía
- todavía no debe existir `selectedProduct`

### T2
`Trabajo en construcción, casi no tengo dónde cargarlo.`

**BACKEND**
- `useCase/sector=construcción/campo`
- problema asociado a carga/autonomía
- integrar batería + resistencia
- recomendar usando RAG verificado + catálogo/stock según política
- no repetir discovery

**ia_conversaciones**
- `actividad_detectada` coherente con construcción/campo
- `prioridades_detectadas` incluye batería y resistencia si derivada con soporte
- `spin_aporte` debe reflejar aporte real, no pregunta artificial
- `producto_recomendado` visible en snapshot si hay ganador

**ia_contexto**
- `useCase/sector` persistidos
- `priorities` acumuladas
- `recommendedProduct=<ganador real>`

### T3
`¿Cuánto cuesta?`

**BACKEND**
- `finalIntent=PRICE`
- referente = `recommendedProduct`
- SQL PRICE del recomendado

**ia_contexto**
- `recommendedProduct` se conserva
- `queryTarget` apunta al recomendado
- no perder `useCase/priorities`

---

# CASO 03 — Presupuesto máximo + batería

### T1
`Tengo máximo S/900, ¿qué me recomiendas?`

**BACKEND**
- presupuesto rígido `budget=900`
- no convertir presupuesto en pregunta SPIN
- `finalIntent=RECOMMEND_WITHIN_BUDGET`
- ranking solo de candidatos elegibles dentro del tope

**ia_conversaciones**
- `presupuesto_detectado=900`
- `intencion=RECOMMEND_WITHIN_BUDGET`
- candidatos coherentes con presupuesto

**ia_contexto**
- `budget=900`
- `recommendedProduct` solo si existe ganador válido

### T2
`Quiero buena batería.`

**BACKEND**
- actualizar prioridad batería
- conservar budget 900
- nueva recomendación debe considerar AMBOS

**ia_contexto**
- `budget=900`
- `priorities` incluye batería
- recomendación vigente coherente

### T3
`¿Cuál de esos comprarías tú para trabajo?`

**BACKEND**
- elegir entre candidatos actuales solo con evidencia verificable
- 2–3 razones relevantes
- no inventar ganador absoluto fuera del contexto

---

# CASO 04 — Comparación X13 vs Armor 22 + delivery

### T1
`¿Armor X13 o Armor 22?`

**BACKEND**
- `finalIntent=COMPARE`
- `comparisonProducts=[Armor X13, Armor 22]`
- 2–4 diferencias verificadas
- no forzar switch

**ia_conversaciones**
- ambos productos asociados correctamente
- `producto_objetivo_turno` no debe falsificar selección

**ia_contexto**
- `comparisonProducts` conserva ambos
- `selectedProduct=null` salvo elección explícita

### T2
`Lo quiero para delivery.`

**BACKEND**
- guardar useCase delivery
- reevaluar recomendación según batería/resistencia/navegación solo con datos reales

**ia_contexto**
- `useCase=delivery`
- comparisonProducts persisten
- `recommendedProduct=<ganador contextual si existe>`

### T3
`¿Y cuánto cuesta el recomendado?`

**BACKEND**
- referente `RECOMMENDED_REFERENT`
- `finalIntent=PRICE`
- SQL sobre `recommendedProduct`

---

# CASO 05 — Referencia “el recomendado”

### T1
`Necesito uno resistente por menos de S/1500.`

**BACKEND**
- budget=1500
- prioridad resistencia
- recomendación con evidencia real

### T2
`¿El recomendado tiene NFC?`

**BACKEND**
- resolver exactamente `recommendedProduct`
- `finalIntent=CAPABILITY`
- Product RAG
- UNKNOWN si no está confirmado

**ia_conversaciones**
- `origen_resolucion_producto=REFERENCIA_CONTEXTO`
- `producto_detectado=<recommendedProduct>`

### T3
`¿Y cuánto cuesta?`

**BACKEND / CONTEXTO**
- mantener mismo referente
- `PRICE` por SQL
- no cambiar producto por una pregunta factual

---

# CASO 06 — Referencia “el otro”

### T1
`Compárame X13 y Armor 22.`

**BACKEND**
- `comparisonProducts=[X13, Armor 22]`

### T2
`Creo que me gusta más el Armor 22.`

**BACKEND**
- reconocer preferencia/selección según fuerza semántica
- Armor 22 debe quedar como producto saliente y, si corresponde, seleccionado
- comparisonProducts no se pierde

### T3
`¿Y el otro cuánto cuesta?`

**BACKEND**
- `queryTarget=X13`
- `finalIntent=PRICE`
- SQL X13
- **NO asumir que X13 pasa a ser activeProduct por consultar su precio**

**ia_contexto**
- `comparisonProducts=[X13, Armor 22]`
- si Armor 22 estaba seleccionado/activo, debe seguirlo
- `queryTarget=X13` solo para el turno factual

---

# CASO 07 — Mención de Armor 22 sin switch desde X13

### Estado inicial
`activeProduct=X13`

### T1
`¿La batería del Armor 22 es mejor?`

**BACKEND**
- consultar/comparar Armor 22 según evidencia
- `queryTarget=Armor 22`
- `cambio_producto_explicito=false`
- `activeProduct` debe seguir X13

### T2
`¿Y el mío cuánto cuesta?`

**BACKEND**
- “el mío” debe volver a X13
- SQL PRICE X13

**ia_contexto final**
- `activeProduct=X13`
- no haber sufrido switch silencioso

---

# CASO 08 — Cambio explícito de producto

### Estado inicial
`activeProduct=X13`

### T1
`Mejor hablemos del Armor 22.`

**BACKEND**
- `explicitSwitch=true`
- `activeProduct=Armor 22`
- `queryTarget=Armor 22`

**ia_conversaciones**
- `cambio_producto_explicito=true`
- `origen_resolucion_producto=SELECCION_USUARIO` o equivalente autorizado

### T2
`¿Tiene stock?`

**BACKEND**
- STOCK Armor 22
- no preguntar modelo

---

# CASO 09 — Preferencia de atributo no implica switch

### Estado inicial
`activeProduct=X13`, comparación con Armor 22 disponible en contexto

### T1
`Prefiero la batería del Armor 22.`

**BACKEND**
- registrar prioridad/preferencia batería
- `explicitSwitch=false`
- no cambiar activeProduct automáticamente

### T2
`¿Cuál me conviene entonces?`

**BACKEND**
- comparar/rankear usando esa preferencia
- puede recomendar Armor 22 si evidencia lo sustenta
- recomendar ≠ seleccionar

---

# CASO 10 — Compra media sobre recomendado

### Precondición
`recommendedProduct=Armor 22`

### T1
`Creo que me quedo con ese.`

**BACKEND**
- resolver `ese` → Armor 22
- señal de compra media/confirmación contextual
- no reiniciar SPIN
- verificar verdad comercial necesaria antes de avanzar
- progresión hacia compra/reserva según disponibilidad

**ia_contexto**
- `selectedProduct=Armor 22` si la decisión queda confirmada
- `purchaseSignal=true` o etapa de cierre compatible

---

# CASO 11 — Compra fuerte

### T1
`Quiero comprarlo.`

**BACKEND**
- `finalIntent=PURCHASE`
- producto correcto por contexto
- `purchaseSignal=true`
- no preguntar uso
- no afirmar compra registrada
- `NBA=COLLECT_RESERVATION_DATA` o handoff autorizado según caso

**ia_conversaciones**
- `etapa_comercial=CIERRE`
- `accion_pendiente_turno` de compra real

---

# CASO 12 — Cliente ya decidió modelo

### T1
`Ya vi todo, quiero el Armor 22.`

**BACKEND**
- selección explícita Armor 22
- cero discovery
- verificar disponibilidad/precio cuando sean necesarios para progresión
- avanzar cierre

**ia_contexto**
- `activeProduct=Armor 22`
- `selectedProduct=Armor 22`
- `purchaseSignal=true`
- `commercialStage=CIERRE`

---

# CASO 13 — Objeción de precio ≠ presupuesto

### T1
`Está muy caro.`

**BACKEND**
- `objection=precio`
- NO inventar budget
- manejar valor verificable o alternativa

**ia_contexto**
- `budget` sin cambio si no fue informado
- `objection=precio`

### T2
`Tengo S/1000 como máximo.`

**BACKEND**
- ahora sí `budget=1000`
- objeción puede darse por resuelta/reclasificada
- ranking dentro del presupuesto

---

# CASO 14 — Precio vs valor

### T1
`¿Por qué cuesta más el Armor 22 que el X13?`

**BACKEND**
- comparación de precio + diferencias verificadas
- no inventar superioridad absoluta
- asociación correcta de cada producto con cada dato

### T2
`¿Vale la pena para trabajo?`

**BACKEND**
- conectar diferencias verificadas con useCase trabajo si existe contexto suficiente
- si falta un criterio decisivo, máximo una pregunta útil

---

# CASO 15 — Stock agotado

### T1
`Quiero el modelo X.`

**BACKEND**
- resolver producto real
- consultar stock actual
- si stock=0: NO decir disponible
- `route=PURCHASE_NO_STOCK` o equivalente
- `NBA=OFFER_ALTERNATIVE` / handoff autorizado
- no generar reserva de producto agotado

**ia_contexto**
- producto puede seguir siendo tema
- `selectedProduct` no autoriza falsa disponibilidad

---

# CASO 16 — Dato técnico UNKNOWN

### T1
`¿El X13 tiene 5G?`

**BACKEND**
- Product RAG
- si no existe VerifiedFact: responder UNKNOWN/no confirmable
- jamás inferir sí/no

**ia_conversaciones**
- `requiere_rag=true`
- `atributo_detectado` relacionado con conectividad/5G

### T2
`Entonces ¿cuál sí tiene 5G confirmado?`

**BACKEND**
- filtrar/recomendar solo candidatos con 5G confirmado
- no usar conocimiento no presente en autoridad factual

---

# CASO 17 — NFC obligatorio

### T1
`Necesito NFC sí o sí.`

**BACKEND**
- prioridad/requisito duro NFC
- no recomendar modelos sin NFC confirmado

**ia_contexto**
- `priorities` refleja NFC como criterio vigente

### T2
`¿El Armor 22 cumple?`

**BACKEND**
- CAPABILITY Armor 22
- verdad Product RAG

### T3
`Entonces dame precio y stock.`

**BACKEND**
- intención compuesta factual
- resolver Armor 22
- consultar precio y stock actuales
- no contestar solo una mitad si el backend soporta ambas autoridades en el turno

---

# CASO 18 — Cámara nocturna + opción económica

### T1
`Trabajo de noche y necesito cámara nocturna.`

**BACKEND**
- `useCase=trabajo nocturno`
- prioridad/requisito cámara nocturna
- recomendar solo feature confirmada

### T2
`¿Cuál sería el más económico que cumpla?`

**BACKEND**
- filtro técnico confirmado primero
- precio después como criterio de orden
- no elegir barato que no cumpla la feature

**ia_contexto**
- requisito técnico persiste durante ranking

---

# CASO 19 — Comparación sin criterio suficiente

### T1
`¿Cuál es mejor, X13 o Armor 22?`

**BACKEND**
- comparar diferencias principales
- si no hay ganador contextual verificable: NO declarar ganador absoluto
- máximo UNA pregunta concreta que cambie decisión
- ejemplo de `pendingMissingFact`: prioridad entre resistencia/batería/precio

**ia_conversaciones**
- `intencion=COMPARE`
- `pregunta_pendiente_turno` solo si realmente es necesaria
- `comparisonProducts` en snapshot

**ia_contexto**
- no perder ambos productos
- `pendingMissingFact` coherente

---

# CASO 20 — Interrupción institucional y retorno al producto

### Precondición
Conversación activa sobre Armor 22.

### T1
`¿Dónde queda la tienda?`

**BACKEND**
- `finalIntent=POLICY`/institucional correspondiente
- Institutional RAG
- responder dirección real
- NO borrar `activeProduct=Armor 22`

**ia_conversaciones**
- `requiere_rag=true`
- ruta institucional
- snapshot conserva Armor 22 como producto activo

**ia_contexto**
- `activeProduct=Armor 22`
- uso/prioridades/budget previos permanecen

### T2
`Ya, ¿y cuánto cuesta el que estábamos viendo?`

**BACKEND**
- resolver Armor 22 desde contexto
- `finalIntent=PRICE`
- SQL PRICE actual
- no pedir nuevamente el producto

**ia_contexto final**
- `activeProduct=Armor 22`
- `queryTarget=Armor 22`
- contexto comercial previo preservado

---

# MATRIZ DE EVALUACIÓN DE LOS 20 CASOS

Para cada caso LIVE, registrar:

```text
CASE_ID
SESSION_ID
TURN
MESSAGE
EXPECTED_INTENT
ACTUAL_INTENT
EXPECTED_ROUTE
ACTUAL_ROUTE
EXPECTED_TARGET
ACTUAL_TARGET
EXPECTED_ACTIVE_PRODUCT
ACTUAL_ACTIVE_PRODUCT
EXPECTED_SELECTED_PRODUCT
ACTUAL_SELECTED_PRODUCT
EXPECTED_RECOMMENDED_PRODUCT
ACTUAL_RECOMMENDED_PRODUCT
EXPECTED_REFERENCE_ORIGIN
ACTUAL_REFERENCE_ORIGIN
EXPECTED_BUDGET
ACTUAL_BUDGET
EXPECTED_USE_CASE
ACTUAL_USE_CASE
EXPECTED_PRIORITIES
ACTUAL_PRIORITIES
EXPECTED_PURCHASE_SIGNAL
ACTUAL_PURCHASE_SIGNAL
EXPECTED_STAGE
ACTUAL_STAGE
EXPECTED_NBA
ACTUAL_NBA
EXPECTED_RESERVATION_STAGE
ACTUAL_RESERVATION_STAGE
PRODUCT = PASS/FAIL
REFERENT = PASS/FAIL
TRUTH = PASS/FAIL
CONTEXT = PASS/FAIL
SPIN = PASS/FAIL
NBA = PASS/FAIL
NATURALNESS = PASS/FAIL
PURCHASE = PASS/FAIL
RESULT = PASS/FAIL
FIRST_BROKEN_BOUNDARY
NOTES
```

---

# REGLA DE DIAGNÓSTICO DESPUÉS DEL LIVE

Nunca corregir por frase. Para cada FAIL:

```text
INPUT
→ deterministic intent
→ planner intent
→ final intent
→ reference resolution
→ state
→ SQL/RAG authority
→ verified facts
→ commercial decision
→ executable NBA
→ writer
→ final response
→ persisted ia_conversaciones / ia_contexto
```

La primera capa que deja de cumplir el esperado de este documento es la frontera autorizada para corregir.

### Ejemplo

Si:

```text
expectedTarget = X13
actualTarget = X13
SQL price = correcto
final response price = incorrecto
```

Entonces `REFERENT` y `TRUTH upstream` pasan; investigar presentación/writer downstream.

Si:

```text
expectedTarget = X13
actualTarget = Armor 22
```

el primer defecto está en reference/state/decision. No tocar Writer para ocultarlo.

---

# CRITERIO DE SALIDA DE ESTA TANDA

No avanzar automáticamente a los casos 21–40.

Primero obtener resultados reales de estos 20 y resumir:

```text
PRODUCT      X/20
REFERENT     X/20
TRUTH        X/20
CONTEXT      X/20
SPIN         X/20
NBA          X/20
NATURALNESS  X/20
PURCHASE     X/20
RESULT       X/20
```

Luego priorizar correcciones por dimensión y primera frontera rota.

**No se ejecutó QA conversacional local al crear este contrato. El usuario ejecutará las pruebas LIVE externamente.**

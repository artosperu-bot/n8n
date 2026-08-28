# STECH Backend — Política comercial SPIN + FAB + N+1

Fecha: 2026-08-21  
Rama: `feat/stech-backend`  
Relación: complemento obligatorio de P5/P6 en `PLAN-P0-P8-RAG-COMERCIAL.md`

## 1. Objetivo

Definir una política única para que SPIN, FAB, empatía, objeciones y N+1 trabajen juntos como una conversación comercial natural.

Principio central:

**SPIN decide qué necesitamos comprender; FAB decide cómo traducimos el producto a beneficios; N+1 decide cuál es el siguiente movimiento comercial.**

Ninguno de los tres debe operar como un árbol rígido ni como una secuencia obligatoria de preguntas.

## 2. Regla principal de N+1

N+1 se evalúa en cada respuesta, pero solo se ejecuta si el siguiente paso tiene sentido con:

- lo que el cliente acaba de decir;
- la intención actual;
- el producto activo/recomendado/seleccionado;
- el estado de la conversación;
- el dolor/problema ya conocido;
- el presupuesto;
- las prioridades;
- la objeción actual;
- la etapa comercial;
- la última acción que el propio bot ofreció.

Si el siguiente paso no tiene relación directa o no aporta valor, la acción correcta es `ANSWER_ONLY`.

Nunca hacer una pregunta solo para mantener la conversación abierta.

## 3. SPIN no es un cuestionario

SPIN se usa para construir comprensión comercial, no para obligar al cliente a responder cuatro preguntas.

### Situación

Capturar cuando sea relevante:

- trabajo/sector;
- uso principal;
- contexto de uso;
- frecuencia/intensidad;
- restricciones conocidas.

No volver a preguntar una situación que ya está en memoria.

### Problema

Identificar el dolor concreto:

- caídas/roturas;
- batería insuficiente;
- mala cámara;
- lentitud;
- presupuesto;
- señal/conectividad;
- peso/tamaño;
- otro problema verificable.

### Implicación

No debe convertirse en una pregunta artificial del tipo “¿qué pasa si...?” cuando la consecuencia es razonablemente inferible del contexto.

Puede expresarse de forma natural para aumentar relevancia comercial.

Ejemplo:

Cliente: “Hago delivery con GPS todo el día y siempre termino buscando dónde cargar.”

No preguntar:

“¿Qué pasaría si te quedaras sin batería?”

Mejor:

“Con GPS y datos durante toda la jornada, quedarte corto de batería te puede complicar una ruta justo cuando más necesitas el equipo.”

### Need-payoff / necesidad-solución

Traducir el problema en el criterio que debe resolverlo.

Ejemplo:

`delivery + GPS + batería insuficiente`
→ prioridad de batería/autonomía + resistencia + posicionamiento/redes.

`construcción + caídas`
→ prioridad resistencia real a caída + protección + batería si la jornada es larga.

## 4. FAB como puente entre evidencia y beneficio

FAB no debe presentarse como una lista técnica.

La estructura conceptual es:

`hecho verificable → ventaja → beneficio para el uso real`

Ejemplo:

Hecho: `6320 mAh`.

No quedarse en:

“Este equipo tiene batería de 6320 mAh.”

Cuando el contexto lo permita:

“Para delivery, esos 6320 mAh te dan más margen que una opción de menor capacidad si vas con GPS y datos durante horas.”

El beneficio debe salir de evidencia real y del contexto conocido. No afirmar “te dura todo el día” si no existe evidencia autoritativa suficiente.

## 5. Orquestación SPIN → FAB → N+1

La secuencia no es obligatoriamente lineal, pero la lógica general es:

`escuchar`
→ `extraer hechos SPIN ya presentes`
→ `preguntar solo el dato faltante que cambia la decisión`
→ `identificar implicación relevante`
→ `traducir evidencia a beneficio con FAB`
→ `recomendar/explicar trade-off`
→ `elegir N+1 coherente`
→ `avanzar un solo paso`

Se deben saltar automáticamente las etapas que ya estén resueltas.

## 6. Ejemplo: construcción

Cliente:

“Trabajo en construcción y se me cae bastante el celular.”

Estado inferido:

- Situación: construcción.
- Problema: caídas frecuentes.
- Prioridad: resistencia.

No preguntar nuevamente:

“¿En qué trabajas?”

No preguntar:

“¿Se te cae el celular?”

N+1 válido si falta un criterio que realmente cambie la decisión:

“Además de resistencia, ¿lo usas bastante para fotos o principalmente llamadas y WhatsApp?”

Si ya existe evidencia suficiente para recomendar, no preguntar por obligación: recomendar directamente.

Ejemplo de progresión:

“En obra priorizaría resistencia real a caídas y protección contra agua/polvo. También revisaría batería si lo usas durante toda la jornada. Entre las opciones disponibles, X encaja mejor por A y B.”

Después, si existe interés comercial real:

“¿Quieres que te confirme precio y disponibilidad?”

## 7. Ejemplo: delivery

Cliente:

“Trabajo haciendo delivery todo el día, uso GPS y datos y casi no tengo dónde cargar.”

Estado inferido:

- Situación: delivery.
- Problema: autonomía/carga.
- Implicación: riesgo de quedarse sin equipo durante la ruta.
- Prioridades: batería, resistencia, posicionamiento, redes.

No hacer discovery repetido.

La respuesta debe orientar el producto según esos criterios y explicar por qué.

N+1 puede avanzar a precio/stock cuando la recomendación ya esté suficientemente sustentada.

## 8. Acción comercial pendiente y respuestas cortas contextuales

El sistema debe conservar qué acción comercial ofreció en el turno anterior.

Conceptualmente:

- `CHECK_PRICE_STOCK`
- `CHECK_PRICE`
- `CHECK_STOCK`
- `COMPARE_OPTIONS`
- `SHOW_IMAGES`
- `OFFER_RESERVATION`
- `COLLECT_RESERVATION_DOCUMENT`
- `COLLECT_RESERVATION_NAME`
- `COLLECT_RESERVATION_ADDRESS`
- `ASSISTED_HANDOFF`

No significa que estos nombres deban persistirse exactamente así; representan el contrato funcional.

### Interpretación de “sí / dale / ya / ok / hazlo”

Una afirmación corta nunca se interpreta aislada del contexto.

Ejemplo:

Bot:
“¿Quieres que te confirme precio y disponibilidad?”

Cliente:
“sí”

Interpretación:

`confirmación de CHECK_PRICE_STOCK`

NO:

`PURCHASE` automáticamente.

Después:

Bot:
“Está a S/X y sí tenemos disponibilidad. ¿Quieres que te lo reserve?”

Cliente:
“sí” / “dale” / “ya” / “hazlo” / “sepáralo”

Interpretación:

`PURCHASE / START_RESERVATION`

El significado depende de `lastOfferedAction`/acción pendiente y del estado comercial.

## 9. Progresión precio/stock → reserva

No imponer siempre este flujo; usarlo cuando el contexto comercial lo justifique.

### Caso A: cliente pide precio y stock juntos

Cliente:
“¿Precio y stock del X13?”

Responder ambos en un solo turno desde SQL.

Si existe intención/interés suficiente:

“Está a S/X y sí tenemos disponibilidad. ¿Quieres que te lo reserve?”

No preguntar primero “¿quieres saber stock?” porque ya lo pidió.

### Caso B: solo pregunta precio

Cliente:
“¿Cuánto está?”

Responder precio.

N+1 puede ser `ANSWER_ONLY` o un soft close contextual.

No ofrecer reserva automáticamente si la conversación todavía es puramente factual.

### Caso C: recomendación ya aceptada

Cliente:
“Ese me gusta.”

El bot puede avanzar a precio/stock si aún no se conocen.

Si precio y stock ya están verificados, puede pasar directamente a ofrecer reserva.

## 10. Reserva personal — 1 unidad

Cuando existe decisión clara y producto resuelto:

`intención de compra`
→ `revalidar producto/precio/stock cuando corresponda`
→ `ofrecer reserva si todavía no fue aceptada`
→ `aceptación contextual`
→ `DNI/CE`
→ `nombres y apellidos`
→ `dirección`
→ `ejecutar dbo.sp_IA_RegistrarReserva24h_Idempotente`
→ `confirmar únicamente resultado real`

Reglas:

- no preguntar producto si ya está seleccionado;
- no preguntar cantidad en flujo estándar;
- cantidad omitida = 1 para el flujo estándar contractual;
- teléfono/WhatsApp se obtiene del canal en producción; no se pregunta en QA/local;
- no re-preguntar campos ya validados;
- no afirmar que la reserva existe antes del SP exitoso.

## 11. Compra de 2 o más unidades

Si el cliente expresa `cantidad >= 2`:

- conservar producto;
- conservar cantidad;
- conservar empresa/RUC/factura si existen;
- conservar uso, dolor, prioridades y presupuesto;
- no entrar a reserva estándar automática;
- `ASSISTED_HANDOFF` con contexto completo.

No reiniciar discovery con el asesor.

## 12. N+1 por familia de intención

### Factual técnico

Ejemplos: batería, cámara, RAM, resistencia, peso.

Primero responder exactamente el dato/pregunta.

N+1 solo si el contexto demuestra que un siguiente paso aporta a la decisión.

Si no, `ANSWER_ONLY`.

### Precio

Precio primero.

No `ASSISTED_HANDOFF` sin señal comercial suficiente.

Puede usar soft close relacionado con el producto actual.

### Stock

Disponibilidad primero sin cantidad cruda.

Puede ofrecer reserva solo cuando existe contexto de compra suficiente.

### Institucional

Horario, ubicación, garantía, pagos, envío, recojo, etc.:

- responder el dato exacto primero;
- opcionalmente conectar con producto/compra si es natural;
- nunca inventar condiciones para crear una pregunta.

Ejemplo válido:

“Hasta las 5 p. m. Si vienes por un equipo específico, dime cuál y te confirmo disponibilidad antes de que te acerques.”

Ejemplo inválido:

“¿En qué distrito quieres retirar para buscarte la tienda más cercana?”

si no existe evidencia de múltiples tiendas o esa necesidad no está en la política.

### Objeción

Resolver primero la objeción.

Luego elegir entre:

- reforzar fit;
- alternativa;
- comparación;
- soft close.

Nunca responder una objeción de precio con una lista larga de especificaciones sin conectar con el dolor.

### Comparación

Mantener el par y el criterio actual.

Después de comparar, recomendar solo cuando existe evidencia suficiente o prioridades conocidas.

### Compra decidida

No volver a SPIN discovery.

Entrar a progresión de compra/reserva.

## 13. Reglas de coherencia del N+1

Antes de emitir N+1, validar:

1. ¿Está relacionado con la pregunta actual?
2. ¿Respeta el producto/referente vigente?
3. ¿Usa información ya conocida en lugar de volver a preguntarla?
4. ¿Es el siguiente paso más útil para la etapa actual?
5. ¿No contradice una intención más fuerte del cliente?
6. ¿No salta etapas sin evidencia o consentimiento?
7. ¿No repite el mismo CTA del turno anterior sin motivo?
8. ¿La pregunta realmente cambia la decisión?
9. ¿Puede resolverse mejor con `ANSWER_ONLY`?
10. ¿El tono se siente como vendedor humano y no como decision tree?

Si cualquiera de estas reglas críticas falla, degradar a una acción más segura/coherente.

## 14. Reglas de no-colisión

SPIN, FAB, N+1, reserva, RAG y SQL no deben competir entre sí.

Prioridades:

1. verdad/seguridad/autorización;
2. intención actual del cliente;
3. referencia/producto correcto;
4. respuesta a la pregunta actual;
5. estado comercial/memoria;
6. SPIN/FAB para mejorar relevancia;
7. N+1 para avanzar cuando aporta.

N+1 nunca puede hacer que se omita o distorsione la respuesta actual.

SPIN nunca puede hacer que una compra decidida vuelva a discovery.

FAB nunca puede convertir un dato técnico en un beneficio no respaldado.

El writer nunca puede inventar una acción que SQL/SP no confirmó.

## 15. Tolerancia a lenguaje ambiguo, abreviado y mal escrito

El cliente puede escribir como una persona real en WhatsApp: con errores, abreviaturas, ausencia de tildes, palabras incompletas, frases cortas o expresiones ambiguas.

El sistema debe intentar comprender primero usando **contexto + intención + producto/referente + acción pendiente**, antes de caer en `OTHER`, `UNKNOWN_PRODUCT` o pedir una aclaración.

### Principio

`mensaje imperfecto + contexto suficiente → interpretación contextual segura`

NO:

`mensaje imperfecto → UNKNOWN automáticamente`

### Ejemplos que deben tolerarse

- `armro x13` → intentar resolver `Armor X13`;
- `stk?` / `hay stk` → STOCK;
- `cuanto ta` / `cuanto esta ese` → PRICE según referente vigente;
- `el 22` → Armor 22 cuando el contexto/catálogo lo hace inequívoco;
- `ya el 22 quiero` → PURCHASE + Armor 22 si ese producto está en el contexto;
- `foto ps` / `manda foto` → IMAGE;
- `quiero tomar fotos para redes` → CAMARA/EVALUATE_USE, no IMAGE;
- `si`, `ya`, `dale`, `ok`, `hazlo` → interpretar según la última acción pendiente;
- `el otro`, `ese`, `esa`, `los dos` → resolver usando comparación/recomendación/selección vigente.

### Regla de ambigüedad

No hacer fuzzy agresivo ni adivinar cuando existan dos o más interpretaciones plausibles con impacto comercial distinto.

Orden de resolución:

1. intención explícita detectable;
2. acción pendiente del turno anterior;
3. producto seleccionado/recomendado/activo;
4. comparison pair/referentes recientes;
5. catálogo/SQL autorizado para resolver nombre o typo;
6. normalización/fuzzy controlado;
7. pregunta de aclaración solo si la ambigüedad sigue siendo material.

### Preguntar solo cuando sea necesario

La aclaración se justifica si una interpretación equivocada puede cambiar:

- producto;
- precio;
- stock;
- compra/reserva;
- cantidad;
- política importante;
- comparación/recomendación.

Si el contexto resuelve de forma razonable y segura la frase, no preguntar por formalidad.

### No corregir al cliente innecesariamente

El bot no debe responder con tono de corrección lingüística.

No decir:

“Creo que quisiste decir Armor X13.”

si puede resolverlo con confianza.

Mejor:

“El Armor X13 está a S/X.”

### Límite de seguridad comercial

La tolerancia a errores nunca autoriza inventar un producto, atributo, precio, stock o intención de compra.

Si no existe suficiente evidencia contextual:

- pedir una sola aclaración breve;
- conservar el contexto previo;
- no resetear la conversación;
- no asumir compra/reserva.

## 16. Criterios QA obligatorios

Agregar/validar casos para:

- SPIN infiere situación y problema sin re-preguntar;
- solo una pregunta cuando falta un criterio decisivo;
- SPIN salta discovery cuando ya hay datos suficientes;
- FAB traduce evidencia a beneficio sin exagerar;
- N+1 factual puede terminar en `ANSWER_ONLY`;
- N+1 institucional crea puente solo cuando es contextual;
- “sí” después de oferta de precio/stock confirma esa acción, no compra;
- “sí/dale/ya” después de oferta de reserva inicia reserva;
- no re-preguntar precio/stock si ya se consultaron;
- no re-preguntar producto seleccionado;
- compra decidida no vuelve a discovery;
- reserva pide solo DNI/CE, nombre completo y dirección;
- cantidad >=2 deriva a asesor con contexto;
- no CTA genérico repetitivo;
- máximo una pregunta útil por turno salvo bloque transaccional definido;
- no superlativos sin comparación/evidencia;
- no lenguaje interno/robótico;
- no acción/reserva inventada;
- typo de producto resuelve identidad canónica cuando existe evidencia suficiente;
- abreviaturas como `stk` mantienen la intención correcta;
- `el 22`/`ya el 22 quiero` usan contexto antes de interpretaciones no comerciales;
- `foto ps` se distingue de `tomar fotos`;
- afirmaciones cortas (`si`, `ya`, `dale`) respetan la acción pendiente;
- ambigüedad material genera como máximo una aclaración breve, sin resetear memoria;
- fuzzy/normalización nunca inventa productos inexistentes.

## 17. Ejemplo de conversación objetivo

Cliente:
“Trabajo en construcción y se me cae bastante el celular.”

Bot:
“En obra priorizaría resistencia real a caídas y protección contra agua/polvo. También miraría batería si lo usas toda la jornada. ¿Lo usas principalmente para llamadas/WhatsApp o también bastante para fotos y aplicaciones?”

Cliente:
“Llamadas, WhatsApp y fotos de trabajos.”

Bot:
“Entonces buscaría resistencia + batería + una cámara que te permita documentar trabajos sin irte a un equipo sobredimensionado. Entre las opciones disponibles, X encaja mejor por A y B; Y tendría sentido si priorizas C.”

Cliente:
“Ese me gusta.”

Bot:
“¿Quieres que te confirme precio y disponibilidad?”

Cliente:
“sí”

Bot:
“Está a S/X y sí tenemos disponibilidad. ¿Quieres que te lo reserve?”

Cliente:
“dale”

Bot:
“Perfecto. Pásame tu DNI o Carné de Extranjería.”

Luego:

`documento → nombre completo → dirección → SP idempotente → confirmación real`

El ejemplo es conceptual: los modelos, precios, atributos y beneficios solo pueden utilizarse cuando las autoridades reales los respalden.

## 18. Estado

- Política SPIN + FAB + N+1: **APROBADA POR EL USUARIO**
- Tolerancia a typos/ambigüedad/contexto: **APROBADA Y OBLIGATORIA**
- Debe gobernar P0/P1/P5/P6 y el flujo de cierre: **SÍ**
- Debe incorporarse a Golden100: **SÍ**
- Hardcodes por producto: **NO**
- Producción modificada por este documento: **NO**

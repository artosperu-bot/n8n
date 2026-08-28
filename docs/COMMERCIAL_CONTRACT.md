# COMMERCIAL CONTRACT — STECH VENDEDOR IA

> **FUENTE CANÓNICA DEL PROYECTO.**
> Todo cambio de código, prompt, RAG, SQL, memoria, QA o handoff debe demostrar que respeta este documento.
> No se corrige un caso puntual si la regla no generaliza. No se considera listo porque una ejecución sea `SUCCESS`; importa la respuesta real, el estado persistido y la continuidad multi-turno.

## 0. Objetivo final

Construir un vendedor IA que recuerde, entienda, recomiende con criterio, use información verdadera, converse naturalmente y sepa cuándo avanzar la venta y cuándo pasarla a una persona.

Flujo comercial objetivo:

`consulta → necesidad → recomendación → objeción → decisión → compra / atención humana`

El modelo configurado para el backend es:

`OPENAI_MODEL=gpt-5-mini-2025-08-07`

El modelo puede razonar sobre intención, referentes, necesidad, objeción, estrategia y N+1. SQL/RAG y las reglas duras conservan autoridad sobre hechos, identidad y acciones realmente ejecutadas.

## 1. Las cinco reglas maestras

1. **Nunca producto equivocado.**
2. **Nunca información inventada.**
3. **Nunca volver a preguntar lo que ya sabemos.**
4. **Cada respuesta debe resolver lo actual y dar el mejor siguiente paso.**
5. **Cuando el cliente quiere comprar, avanzar la compra.**

Estas cinco reglas tienen prioridad sobre estilo, wording, longitud o preferencia de implementación.

## 2. Intención actual manda

- Entender qué pregunta el cliente **ahora**.
- Una intención explícita actual gana a un N+1 histórico.
- Precio actual no puede ser secuestrado por una comparación previa.
- Stock actual no puede reabrir discovery.
- Una política actual no puede convertirse en una recomendación de producto.
- `Ya entendí` no debe generar una pregunta innecesaria.
- Una respuesta normalmente resuelve primero y pregunta después solo si realmente hace falta.

Regla:

`CURRENT TURN > estado histórico > N+1 histórico`

La memoria ayuda a continuar; nunca debe secuestrar el turno actual.

## 3. Producto, objetivo y referentes

Estos conceptos son distintos y no deben colapsarse:

- `activeProduct`: producto comercial activo de la conversación.
- `queryTarget`: producto sobre el que se pregunta en el turno actual.
- `salientProduct`: producto más relevante del intercambio reciente.
- `recommendedProduct`: producto recomendado vigente.
- `selectedProduct`: producto elegido explícitamente por el cliente.
- `comparisonProducts`: pareja de comparación preservada.

Regla crítica:

`producto consultado ≠ producto activo ≠ producto seleccionado`

Ejemplo:

- Activo: Armor X13.
- Cliente: `¿La batería del Armor 22 cuánto dura?`
- `queryTarget = Armor 22`.
- `activeProduct = Armor X13`.
- **NO switch**.

Solo existe cambio explícito cuando hay intención inequívoca, por ejemplo:

- `Prefiero el Armor 22.`
- `Quiero cambiar al Armor 22.`
- `Mejor veamos el Armor 22.`

Preferir un atributo no cambia producto:

`Prefiero la batería del Armor 22` → NO switch.

### Referencias

Expresiones como:

- `ese`
- `el recomendado`
- `el otro`
- `el primero`
- `me quedo con ese`
- `quiero comprarlo`

se resuelven usando estado reciente, no una recomendación vieja.

Prioridad para una selección referencial:

`selección explícita reciente > referente/saliencia reciente > recomendación vigente > producto activo > aclaración`

Una recomendación vieja jamás puede pisar una selección posterior.

### Mención de un segundo producto

`También estoy viendo el Armor 22` no significa automáticamente `COMPARE` ni cambio de producto.

Debe producir como mínimo:

- `queryTarget/salientProduct = Armor 22` cuando corresponda;
- preservar `activeProduct` si no hubo switch;
- incorporar Armor 22 a la memoria de candidatos/comparación si es útil.

No se debe preguntar `¿Qué dos modelos quieres comparar?` si el sistema ya conoce ambos modelos por contexto.

## 4. Verdad y autoridad de datos

Nunca inventar:

- precio;
- stock;
- garantía;
- batería;
- procesador;
- cámara;
- resistencia;
- 5G;
- NFC;
- promociones;
- envío;
- tiempo de entrega;
- compra, reserva, cotización o pedido ejecutado.

Si un dato importante no está confirmado:

`No puedo confirmarte ese dato ahora.`

es mejor que inventarlo.

### Autoridades

- **SQL/catalogo**: identidad comercial, precio, disponibilidad, catálogo, imágenes, pedidos.
- **RAG producto**: características técnicas verificadas del producto identificado.
- **RAG institucional**: políticas, tienda, envíos, pagos, garantía, recojo, postventa.
- **GPT-5 mini**: interpretación semántica, criterio comercial, SPIN, objeciones, N+1 y redacción basada en evidencia.

El modelo no crea IDs, precios, stock ni hechos.

## 5. Producto inexistente / no reconocido

Un producto inexistente no debe terminar en un callejón sin salida cuando existen alternativas reales.

Ejemplo:

`¿Tienen Armor 30?`

Si no existe:

1. confirmar que no aparece en catálogo;
2. buscar alternativas **reales** disponibles;
3. usar necesidad, presupuesto y prioridades conocidas para ordenarlas;
4. ofrecer 1–2 opciones útiles;
5. mantener claro que el producto original no fue encontrado;
6. no inventar precio/stock del producto inexistente.

N+1 general:

`UNKNOWN PRODUCT → VERIFIED ALTERNATIVES → CONTINUE WITH SALIENT ALTERNATIVE(S)`

Si el bot ofrece X12 Pro y X13 como alternativas, las preguntas siguientes (`¿cuánto cuesta?`, `¿tienen stock?`) deben usar la saliencia y pedir una aclaración mínima si realmente hay dos candidatos indistinguibles; no repetir eternamente la explicación del producto inexistente.

## 6. Características y RAG producto

Para información general de un producto, priorizar una ficha comercial útil:

- pantalla;
- rendimiento;
- memoria;
- cámara;
- batería;
- resistencia;
- conectividad cuando sea relevante.

No listar todo por defecto. Elegir lo importante para la consulta/uso.

Regla de neuroventas:

`característica verificada → efecto práctico → beneficio relacionado con la necesidad`

Ejemplo:

`6600 mAh → mayor autonomía → menos dependencia del cargador durante una jornada larga`

No convertir especificaciones irrelevantes en relleno comercial.

## 7. Comparaciones

Una comparación conversacional debe:

- preservar exactamente la pareja;
- evitar contaminación por terceros productos;
- usar la misma cobertura/dimensiones para ambos;
- mostrar 2–4 diferencias realmente relevantes;
- explicar trade-off;
- vincular diferencias con el uso del cliente;
- recomendar solo si existe contexto suficiente.

Si el cliente pregunta solo batería, comparar batería. Si pregunta cámara, comparar cámara. No reabrir una comparación genérica completa.

Ejemplo esperado:

`El Armor 22 te conviene más por batería y rendimiento; el X13 es más sencillo. Para trabajo de campo, me inclinaría por el Armor 22.`

Solo si la evidencia y el contexto sustentan esa conclusión.

## 8. Presupuesto

Presupuesto es una restricción comercial, no automáticamente SPIN ni objeción.

`Tengo máximo S/900` → `budget.max = 900`.

Debe:

- persistirse;
- filtrar candidatos reales;
- influir en recomendación/N+1;
- NO convertirse por sí solo en `PRICE_OBJECTION`;
- NO convertirse por sí solo en Problema/Implicación SPIN.

Pregunta directa:

`¿Cuál entra en mi presupuesto?`

Debe responder primero usando precios reales. No iniciar otra entrevista antes de responder.

## 9. SPIN invisible

SPIN existe para mejorar la decisión, no para parecer formulario.

Detectar progresivamente:

`Situación → Problema → Implicación → Necesidad`

Reglas:

- máximo una pregunta útil;
- muchas veces cero preguntas;
- no repetir información ya conocida;
- no obligar a pasar por las cuatro etapas;
- no inventar problemas;
- no convertir presupuesto en problema/implicación;
- no preguntar por preguntar;
- no reiniciar discovery después de una señal de compra.

La pregunta solo se justifica si la respuesta puede cambiar la recomendación o el siguiente paso.

## 10. Empatía y naturalidad

Empatía debe demostrarse mediante criterio útil.

Mejor:

`Entonces priorizaría batería y resistencia antes que cámara.`

Peor:

`Entiendo perfectamente que trabajas todo el día fuera.`

No abusar de:

- `Entiendo`;
- `Perfecto`;
- `Claro`;
- repetir literalmente lo dicho por el cliente.

Español natural para Perú. Respuestas normalmente cortas, claras y sin párrafos innecesarios.

## 11. N+1 / Next Best Action dinámico

N+1 es **la menor acción útil que hace avanzar la venta**.

No es una tabla rígida `PRICE → STOCK`.

Debe considerar:

- intención actual;
- producto/referente;
- necesidad;
- presupuesto;
- objeción;
- etapa comercial;
- información ya conocida;
- disponibilidad de herramientas/evidencia.

Ejemplos:

- Precio + señal fuerte de compra → avanzar compra.
- Precio mientras compara → ayudar a decidir.
- Stock disponible + intención fuerte → avanzar cierre.
- Producto inexistente → ofrecer alternativas verificadas.
- Producto fuera de presupuesto → alternativa dentro del presupuesto.
- Objeción de precio → resolver valor o alternativa.
- `Ya entendí` → cerrar naturalmente, no preguntar por obligación.
- `Quiero comprarlo` → avanzar/handoff; no reiniciar SPIN.
- Política respondida → no forzar pregunta de producto si el cliente aún está aclarando políticas.

Un N+1 stale, redundante, ya satisfecho o incompatible con la intención actual debe descartarse.

## 12. Precio, stock e imágenes

### Precio

- SQL manda.
- Dar precio solo cuando fue pedido o un flujo de cotización lo autoriza.
- No introducir precio espontáneamente en ficha/recomendación.

### Stock

- SQL manda.
- Respuesta comercial: disponible / no disponible / requiere validar cantidad solicitada.
- Nunca revelar cantidad interna cruda.

### Imágenes

Cuando el cliente pide imágenes de un producto identificado:

`resolver producto → sp_BuscarImagenesProductoVenta → validar http(s) → SOLO LINKS`

Sin introducción, explicación ni despedida adicional.

Si no hay imágenes verificadas, decirlo; no inventar URLs ni cambiar silenciosamente a otro producto.

## 13. Compra y handoff

Señales medias/fuertes de compra son críticas.

`Me quedo con ese`:

- resolver correctamente referente;
- convertirlo en `selectedProduct` cuando corresponda;
- conservar producto correcto;
- avanzar un paso.

`Quiero comprarlo`:

- no volver a preguntar uso/necesidad;
- no reiniciar SPIN;
- verificar lo indispensable;
- avanzar proceso/handoff;
- no afirmar reserva/compra inexistente.

Handoff cuando:

- cliente pide humano;
- compra requiere asesor;
- no puede identificar producto después de aclaración razonable;
- fallo externo crítico;
- pago/reclamo/excepción;
- contradicción importante de producto/estado.

El handoff debe conservar todo el contexto para que el humano no empiece desde cero.

## 14. Supabase: contrato de memoria

### `ia_conversaciones`

Es la **verdad del turno**. Debe guardar:

- mensaje cliente;
- respuesta bot;
- intención/ruta;
- producto objetivo/resuelto;
- SQL/RAG usados;
- aporte SPIN del turno;
- N+1;
- etapa/estrategia;
- tokens/modelo;
- errores/derivación;
- trace IDs.

### `ia_contexto`

Es la **memoria acumulada de la sesión**. Debe guardar:

- producto activo canónico;
- producto recomendado/seleccionado/saliente;
- pareja de comparación;
- actividad/sector/uso;
- problema/prioridades;
- presupuesto/cantidad;
- objeción;
- señal de compra;
- etapa;
- acción pendiente;
- handoff;
- `context_version`;
- `ultimo_message_id`;
- `ultimo_conversacion_id`.

Regla de atomicidad:

`ia_conversaciones + ia_contexto` deben representar el mismo turno confirmado.

No se permite memoria futura con conversación incompleta.

Persistencia canónica:

`ia_adquirir_turno → ia_persistir_turno_atomico → ia_liberar_turno`

Si un turno falla después de adquirir lease, debe existir cierre de error/limpieza. Nunca debe quedar eternamente `PROCESSING` por una excepción del backend.

## 15. Vocabulario operativo

GPT puede razonar con texto libre, pero **no puede inventar códigos de sistema**.

Intención, ruta, N+1, origen/estado de resolución y etapa que se persisten deben pertenecer a vocabularios canónicos conocidos por el backend/Supabase.

Nunca persistir cosas como:

- `precio_query` si el código canónico es `PRICE`;
- párrafos completos dentro de `lastNba`;
- `[object Object]` dentro de `spinFacts`;
- IDs de producto construidos manualmente.

Los IDs se toman del catálogo/SQL.

## 16. Errores graves que bloquean

RED / BLOCKER:

- producto equivocado;
- referente equivocado;
- cambio falso de producto;
- precio incorrecto;
- stock incorrecto;
- dato inventado;
- olvidar contexto importante;
- repetir discovery de forma clara;
- compra fuerte no progresa;
- afirmar compra/reserva no ejecutada;
- `respuesta_bot = NULL`;
- desalineación `ia_conversaciones` vs `ia_contexto`;
- turno atascado en `PROCESSING` por error del backend;
- RAG de producto cruzado con otro producto;
- política institucional equivocada.

## 17. Mejoras no bloqueantes

YELLOW / WEAK, normalmente no bloquean por sí solas:

- frase algo más larga;
- un `Perfecto` ocasional;
- tono mejorable;
- respuesta correcta pero poco elegante;
- una pregunta discutible que no rompe contexto ni venta.

No buscar perfección infinita.

## 18. Regla de ingeniería

**NO ARREGLAR A ROMPIENDO B.**

Siempre:

`reproducir → encontrar primer punto roto → encontrar dueño real → causa raíz → cambio mínimo/general → probar caso → probar vecinos → probar multi-turno → verificar Supabase real`

Prohibido:

- hardcodear una frase exacta para pasar QA;
- hardcodear productos/precios;
- agregar regex para cada ejemplo sin regla general;
- modificar varias capas a ciegas;
- asumir que tests unitarios sustituyen una prueba contra constraints reales de Supabase;
- considerar `SUCCESS` como equivalente a buena respuesta.

## 19. Mínimo de salida

| Dimensión | Objetivo |
|---|---:|
| Producto correcto | 100% |
| Referente correcto | 100% |
| Precio/stock reales | 100% |
| Cambios falsos de producto | 0 |
| Datos inventados | 0 |
| Repetición de discovery | 0 |
| Compra fuerte progresa | 100% |
| SPIN | natural/invisible |
| Neuroventas | útil/verificada |
| Empatía | contextual |
| N+1 | útil y dinámico |
| Handoff | seguro |
| Conversación | natural |
| Memoria/contexto | estable |

## 20. Cómo se evalúa un run QA

Nunca mirar solo `GREEN/YELLOW/RED`.

Orden obligatorio:

1. confirmar número de sesiones/turnos intentados;
2. comprobar `ia_turn_queue` y locks;
3. comprobar que cada turno confirmado existe en `ia_conversaciones` con `respuesta_bot`;
4. comprobar `ia_contexto`, `context_version`, `ultimo_message_id`, `ultimo_conversacion_id`;
5. comprobar producto activo vs producto consultado/resuelto;
6. comprobar intención, ruta, N+1 y herramientas;
7. leer **la respuesta real**;
8. evaluar verdad, memoria, SPIN, N+1, naturalidad y progresión de compra;
9. recién entonces asignar resultado.

Los journeys son ejemplos de regresión; **este documento es el contrato**. No se cambia el comportamiento solo para satisfacer el wording de un caso si eso contradice estas reglas.

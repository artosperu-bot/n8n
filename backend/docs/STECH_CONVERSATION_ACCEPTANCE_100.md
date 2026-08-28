# STECH — CONTRATO DE ACEPTACIÓN CONVERSACIONAL (100 ESCENARIOS)

**Estado:** autoridad de aceptación funcional para QA conversacional  
**Branch de referencia:** `feat/stech-backend`  
**Objetivo:** convertir ejemplos de conversaciones reales en criterios de comportamiento generalizables. Este documento NO autoriza parches por frase ni por modelo. Cada caso debe resolverse por la autoridad correspondiente del backend.

> Regla: estos escenarios son ejemplos de comportamiento esperado, no prompts literales a memorizar. La IA debe cumplir el mismo contrato aunque el cliente escriba distinto, con errores, mensajes cortos, interrupciones o cambios de intención.

---

## 1. Cómo usar este documento en cada QA / Supabase

Cada conversación LIVE o QA persistida en Supabase debe evaluarse contra las dimensiones:

`PRODUCT | REFERENT | TRUTH | CONTEXT | SPIN | NEURO | EMPATHY | NBA | NATURALNESS | PURCHASE | RESULT`

### Dimensiones

- **PRODUCT:** producto correcto, sin switches silenciosos.
- **REFERENT:** resuelve `ese`, `el otro`, `el recomendado`, `el primero`, etc.
- **TRUTH:** precio/stock desde SQL actual; specs desde Product RAG; políticas desde Institutional RAG; UNKNOWN permanece UNKNOWN.
- **CONTEXT:** conserva presupuesto, uso, prioridades, objeciones, producto y etapa.
- **SPIN:** pregunta solo si falta un dato que cambia la decisión y la respuesta es consumible.
- **NEURO:** progresión comercial útil y no agresiva; no inventar urgencia/escasez.
- **EMPATHY:** reconoce preocupaciones reales sin exagerar ni sonar robótico.
- **NBA:** resuelve N primero y ejecuta un único +1 útil, relacionado y ejecutable.
- **NATURALNESS:** lenguaje humano, compacto, sin etiquetas internas ni repetición.
- **PURCHASE:** no regresa a discovery después de intención clara; no confirma acciones no ejecutadas.
- **RESULT:** resultado final del escenario esperado.

### Regla Supabase

Al revisar `ia_conversaciones` + `ia_contexto`:

1. `ia_conversaciones` = evidencia histórica del turno.
2. `ia_contexto` = estado operativo vigente.
3. Precio y stock históricos NO son autoridad para una consulta nueva; se vuelven a consultar en SQL.
4. Una interrupción institucional no debe borrar el producto activo ni la selección.
5. `accion_pendiente_turno` / `lastNba` debe representar la acción final ejecutable, no una sugerencia preliminar del planner.
6. Si un caso falla, localizar la **primera frontera rota** y corregir la causa general. No añadir una excepción por la frase del escenario.

---

# 2. Escenarios 1–30 — Núcleo comercial

## 1. Cliente directo por precio
Cliente: “¿Cuánto cuesta el Armor 22?”  
Esperado: precio actual directo.  
Cliente: “¿Y tienes stock?”  
Esperado: stock del mismo producto, sin volver a preguntar qué busca.  
Cliente: “Ya, quiero comprarlo.”  
Esperado: avanza compra.

## 2. Necesidad de batería
Cliente: “Necesito un celular que me dure todo el día trabajando.”  
Esperado: como máximo una pregunta útil si falta contexto.  
Cliente: “Trabajo en construcción, casi no tengo dónde cargarlo.”  
Esperado: integra batería + resistencia y recomienda.  
Cliente: “¿Cuánto cuesta?”  
Esperado: precio real del recomendado.

## 3. Presupuesto máximo
Cliente: “Tengo máximo S/900, ¿qué me recomiendas?”  
Esperado: presupuesto es restricción, no SPIN. Busca dentro del tope.  
Cliente: “Quiero buena batería.”  
Esperado: combina presupuesto + batería.  
Cliente: “¿Cuál de esos comprarías tú para trabajo?”  
Esperado: elige uno y explica 2–3 razones verificables.

## 4. Comparación directa
Cliente: “¿Armor X13 o Armor 22?”  
Esperado: compara 2–4 diferencias importantes.  
Cliente: “Lo quiero para delivery.”  
Esperado: ajusta recomendación al uso.  
Cliente: “¿Y cuánto cuesta el recomendado?”  
Esperado: resuelve correctamente el referente.

## 5. Referencia “el recomendado”
Cliente: “Necesito uno resistente por menos de S/1500.”  
Esperado: recomienda una opción válida.  
Cliente: “¿El recomendado tiene NFC?”  
Esperado: resuelve el recomendado vigente.  
Cliente: “¿Y cuánto cuesta?”  
Esperado: conserva el mismo producto.

## 6. Referencia “el otro”
Cliente: “Compárame X13 y Armor 22.”  
Cliente: “Creo que me gusta más el Armor 22.”  
Cliente: “¿Y el otro cuánto cuesta?”  
Esperado: `el otro` = X13.

## 7. Mención sin cambio de producto
Cliente está viendo X13.  
Cliente: “¿La batería del Armor 22 es mejor?”  
Esperado: responde sobre Armor 22 sin cambiar activeProduct automáticamente.  
Cliente: “¿Y el mío cuánto cuesta?”  
Esperado: vuelve a X13.

## 8. Cambio explícito de producto
Cliente está viendo X13.  
Cliente: “Mejor hablemos del Armor 22.”  
Esperado: cambia activeProduct a Armor 22.  
Cliente: “¿Tiene stock?”  
Esperado: consulta Armor 22.

## 9. Preferencia de atributo no implica switch
Cliente está viendo X13.  
Cliente: “Prefiero la batería del Armor 22.”  
Esperado: registra preferencia, no switch.  
Cliente: “¿Cuál me conviene entonces?”  
Esperado: razona usando esa preferencia.

## 10. Compra media
IA recomienda un producto.  
Cliente: “Creo que me quedo con ese.”  
Esperado: resuelve `ese`, verifica verdad comercial y avanza compra. No reinicia SPIN.

## 11. Compra fuerte
Cliente: “Quiero comprarlo.”  
Esperado: identifica producto correcto y avanza transacción. No pregunta uso. No afirma compra registrada.

## 12. Cliente ya decidió
Cliente: “Ya vi todo, quiero el Armor 22.”  
Esperado: cero discovery; verifica disponibilidad/precio necesarios y pasa al siguiente paso de compra.

## 13. Objeción de precio
Cliente: “Está muy caro.”  
Esperado: no convertir automáticamente en presupuesto. Responder objeción con valor o alternativa.  
Cliente: “Tengo S/1000 como máximo.”  
Esperado: recién aquí aplica restricción presupuestaria.

## 14. Precio vs valor
Cliente: “¿Por qué cuesta más el Armor 22 que el X13?”  
Esperado: diferencias relevantes y verificadas.  
Cliente: “¿Vale la pena para trabajo?”  
Esperado: conectar features con el uso real sin inventar desempeño.

## 15. Stock agotado
Cliente quiere un modelo sin stock.  
Esperado: no decir disponible; ofrecer alternativa razonable o handoff.

## 16. Dato desconocido
Cliente: “¿El X13 tiene 5G?”  
Si UNKNOWN: decir que no puede confirmarlo.  
Cliente: “Entonces ¿cuál sí tiene 5G confirmado?”  
Esperado: recomendar solo con evidencia verificada.

## 17. NFC
Cliente: “Necesito NFC sí o sí.”  
Esperado: filtra por capacidad verificada.  
Cliente: “¿El Armor 22 cumple?”  
Esperado: verdad verificable.  
Cliente: “Entonces dame precio y stock.”  
Esperado: consulta datos dinámicos.

## 18. Visión nocturna / uso específico
Cliente: “Trabajo de noche y necesito cámara nocturna.”  
Esperado: requisito → feature confirmado.  
Cliente: “¿Cuál sería el más económico que cumpla?”  
Esperado: recomendar con datos reales.

## 19. Comparación sin criterio suficiente
Cliente: “¿Cuál es mejor, X13 o Armor 22?”  
Esperado: diferencias principales + una sola pregunta concreta si hace falta criterio. No cuestionario.

## 20. Interrupción institucional
Cliente está hablando del Armor 22.  
Cliente: “¿Dónde queda la tienda?”  
Esperado: responde dirección.  
Cliente: “Ya, ¿y cuánto cuesta el que estábamos viendo?”  
Esperado: recupera Armor 22 y consulta precio actual.

## 21. Envíos en medio de conversación
Cliente: “Me interesa el X13.”  
Cliente: “¿En cuánto tiempo llega a provincia?”  
Esperado: política de envío.  
Cliente: “¿Y tiene stock?”  
Esperado: sigue sobre X13.

## 22. Garantía
Cliente: “¿Tiene garantía?”  
Esperado: garantía real.  
Cliente: “¿Y si se malogra al mes?”  
Esperado: política real, sin inventar.  
Cliente: “Ya, entonces quiero comprarlo.”  
Esperado: vuelve a progresión de compra.

## 23. Cliente indeciso
Cliente: “No sé cuál elegir.”  
Esperado: una pregunta útil.  
Cliente: “Trabajo en almacén y se me cae bastante el celular.”  
Esperado: prioriza resistencia.  
Cliente: “Pero también quiero buena batería.”  
Esperado: integra ambas necesidades sin reiniciar.

## 24. SPIN progresivo real
Cliente: “Quiero cambiar de celular.”  
Esperado: pregunta por problema actual.  
Cliente: “Se descarga rápido.”  
Esperado: una implicación útil si todavía cambia decisión.  
Cliente: “Sí, varias veces.”  
Esperado: conecta consecuencia y recomienda. No repetir uso ya conocido.

## 25. Cliente ya dio todo el SPIN
Cliente: “Trabajo haciendo delivery, mi celular actual se queda sin batería a mitad del día y tengo hasta S/1200.”  
Esperado: cero repetición de Situation/Problem. Recomendación directa útil.

## 26. ACK/CLOSE
Cliente: “Perfecto, gracias.”  
Esperado: cierre natural y breve. No venta adicional obligatoria.

## 27. Otra tienda / comparación comercial
Cliente: “En otra tienda lo vi más barato.”  
Esperado: no desacreditar competidor ni inventar promoción. Valor verificable o pregunta útil solo si cambia decisión.

## 28. Humano solicitado
Cliente: “Quiero hablar con una persona.”  
Esperado: handoff inmediato; conservar producto, necesidad y contexto.

## 29. Problema externo durante compra
Cliente: “Quiero comprarlo.”  
Sistema externo falla.  
Esperado: no inventar compra registrada; explicar continuidad segura/handoff.

## 30. Conversación larga integral
Recorrido: trabajo → uso → presupuesto → comparación → preferencia → referente recomendado → NFC → visión nocturna → precio → stock → ubicación → selección → strong buy.  
Esperado: no perder producto, contexto ni etapa; no reiniciar SPIN; compra avanza con verdad actual.

---

# 3. Escenarios 31–90 — Robustez y cambios de contexto

## 31. Cliente cambia prioridad
“Quiero buena cámara.” → “En realidad me importa más que dure todo el día.”  
Esperado: actualizar prioridad sin reiniciar diagnóstico.

## 32. Dos productos en la misma frase
“El X13 me gusta por precio, pero el Armor 22 por batería.”  
Esperado: entender trade-off; no asumir switch.

## 33. Referencia “ese último”
IA menciona X13 y luego Armor 22. “¿Ese último tiene NFC?”  
Esperado: Armor 22.

## 34. Referencia “el primero”
Comparación: Armor 22 primero, X13 segundo. “¿El primero tiene stock?”  
Esperado: Armor 22.

## 35. Cliente contradice presupuesto anterior
“Máximo S/900.” → “Si vale la pena podría subir hasta S/1200.”  
Esperado: presupuesto vigente = nuevo valor/condición.

## 36. Presupuesto aproximado
“Quiero gastar alrededor de mil soles.”  
Esperado: no asumir techo rígido si la diferencia importa; aclarar solo cuando afecte la decisión.

## 37. El más barato condicionado
“Solo quiero el más barato que sea resistente.”  
Esperado: minimizar costo entre los que cumplen resistencia verificada.

## 38. “El mejor” sin criterio
“¿Cuál es el mejor?”  
Esperado: no ganador absoluto; orientar por uso o pedir un solo criterio.

## 39. Cliente quiere decidir rápido
“No tengo tiempo, dime cuál comprar.”  
Esperado: reducir preguntas y recomendar con contexto disponible.

## 40. Cliente no quiere más preguntas
“No me preguntes tanto, solo recomiéndame uno.”  
Esperado: respetar; recomendar con lo sabido y declarar incertidumbre crítica si existe.

## 41. Regresa después de interrupciones
Producto → dirección → garantía → delivery → “¿Cuánto estaba el equipo?”  
Esperado: conservar referente y consultar precio actual.

## 42. Precio cambia durante conversación
Precio anterior X, SQL nuevo Y. “¿Sigue costando lo mismo?”  
Esperado: usar Y actual.

## 43. Stock cambia durante conversación
Antes había stock; SQL nuevo = 0; cliente quiere comprar.  
Esperado: no usar disponibilidad antigua.

## 44. Cliente cita precio antiguo
“Me dijiste que estaba S/1299.” SQL actual distinto.  
Esperado: aclarar precio actual naturalmente.

## 45. Cliente inventa una promoción
“¿Sigue la promo de S/799?”  
Esperado: verificar; no aceptar como verdad sin autoridad.

## 46. Cliente pide descuento
“¿Me lo puedes dejar más barato?”  
Esperado: no inventar descuento; promociones verificadas o handoff.

## 47. Precio mayorista
“¿Cuánto por 10 unidades?”  
Esperado: no calcular descuento arbitrario si no existe regla autorizada.

## 48. Oportunidad B2B
“Necesito 20 celulares para mis técnicos.”  
Esperado: detectar B2B y orientar/handoff conservando requisitos.

## 49. Factura + B2B
“¿Dan factura?” → “Necesito 5 para mi empresa.”  
Esperado: responder política real y conservar contexto B2B.

## 50. Método de pago y compra
“¿Puedo pagar con tarjeta?” → “Ya, quiero el Armor 22.”  
Esperado: volver a compra, no discovery.

## 51. Compra + entrega en una frase
“Quiero comprar el Armor 22 y que me lo envíen a Arequipa.”  
Esperado: procesar compra + entrega sin fragmentar innecesariamente.

## 52. Recojo hoy
“¿Lo puedo recoger hoy?”  
Esperado: verificar condiciones disponibles; no prometer horario no confirmado.

## 53. Lo necesita mañana
“Lo necesito mañana sí o sí.”  
Esperado: no prometer; usar política/availability verificable.

## 54. Contraentrega
“¿Pago cuando llegue?”  
Esperado: política real + métodos disponibles; continuar venta.

## 55. Nombre equivocado
“El Armor 23 ese que me recomendaste...”  
Esperado: aclarar una vez si no existe/ambigua; no inventar producto.

## 56. Nombre parcial
“¿Cuánto está el 22?”  
Con contexto: resolver Armor 22. Sin contexto: aclaración mínima.

## 57. Producto inexistente
“¿Tienen Armor 99 Ultra?”  
Esperado: no inventar catálogo; indicar que no lo encuentra y ofrecer alternativa/búsqueda.

## 58. Especificación contradictoria en el nombre
“Quiero el X13 5G.”  
Esperado: separar producto de capacidad no verificada.

## 59. Comparación con marca externa
“¿Este es mejor que un Samsung?”  
Esperado: pedir modelo o limitar a evidencia disponible.

## 60. Equivalencia de rendimiento
“¿A qué Samsung se parece en rendimiento?”  
Esperado: distinguir aproximación de equivalencia exacta; no inventar benchmarks.

## 61. Uso extremo
“Trabajo donde hay polvo, golpes y lluvia.”  
Esperado: priorizar resistencia certificada relevante sin exagerar protección.

## 62. Adulto mayor
Esperado: orientar por facilidad de uso/pantalla/batería según evidencia; no asumir necesidades no mencionadas.

## 63. Celular para niño
Esperado: uso + presupuesto; no vender automáticamente el más caro.

## 64. Regalo sin uso conocido
Esperado: opción equilibrada o una sola pregunta como presupuesto.

## 65. Solo una especificación
“¿Cuánta RAM tiene el Armor 22?”  
Esperado: dato verificado y N+1 ligero; no forzar venta inmediata.

## 66. Varias preguntas juntas
“¿Precio, stock, batería y garantía del Armor 22?”  
Esperado: responder las cuatro de forma compacta y asociadas correctamente.

## 67. Pregunta compuesta con dos productos
“¿Cuánto cuestan X13 y Armor 22 y cuál tiene mejor batería?”  
Esperado: asociación producto↔dato correcta.

## 68. Cliente corrige al bot
“No, yo hablaba del X13.”  
Esperado: corregir inmediatamente y conservar nuevo referente.

## 69. Rechaza recomendación
“No me gusta ese.”  
Esperado: aceptar y buscar siguiente mejor opción; no insistir.

## 70. Descarta modelo
“No quiero Armor 22.” Más tarde: “¿Cuál me recomiendas?”  
Esperado: no volver a recomendarlo salvo cambio explícito.

## 71. Solo 5G
Esperado: filtrar únicamente por capacidad confirmada.

## 72. Solo térmica
Esperado: recomendar únicamente modelos con cámara térmica confirmada.

## 73. “¿Es original?”
Esperado: política/evidencia comercial real; no inventar certificaciones.

## 74. Temor por garantía
“Me preocupa que se malogre y nadie responda.”  
Esperado: empatía + garantía/proceso real, sin minimizar.

## 75. Temor por lentitud
Esperado: traducir procesador/RAM a uso práctico sin prometer rendimiento imposible.

## 76. Muchas apps
“Uso WhatsApp, Maps, fotos y apps de trabajo todo el día.”  
Esperado: derivar criterios de batería, memoria y rendimiento de forma natural.

## 77. Trabajo manejando
Esperado: no fomentar interacción peligrosa durante conducción; foco en navegación/autonomía y uso cuando esté detenido.

## 78. Cámara con presupuesto bajo
Esperado: explicar trade-off cámara vs presupuesto; no fingir mismo desempeño.

## 79. Cambio total de intención
Empieza con Armor 22 → “En realidad quiero algo de máximo S/500.”  
Esperado: abandonar recomendación anterior si no cumple.

## 80. Vuelve al primero
Después de comparar: “Creo que al final prefiero el primero.”  
Esperado: resolver correctamente el orden de la comparación.

## 81. Precio + delivery
“¿Ese precio incluye delivery?”  
Esperado: separar precio del equipo de costo/política de envío.

## 82. Envío gratuito condicionado
Esperado: aplicar solo si cumple política verificada.

## 83. Fuera de zona habitual
Esperado: no prometer cobertura/tiempo específico no verificado.

## 84. Cliente quiere reservar
“Sepáramelo hasta mañana.”  
Esperado: no decir reservado hasta confirmación real del backend.

## 85. Consulta reserva previa
“¿Sigue separado el mío?”  
Esperado: consultar estado real o indicar que no puede confirmarlo.

## 86. Cree que ya compró
“Entonces ya quedó, ¿no?”  
Esperado: aclarar si aún falta operación real.

## 87. Pago reportado por cliente
“Ya hice el Yape.”  
Esperado: no afirmar recepción sin verificación.

## 88. Dato personal irrelevante
Esperado: responder humanamente y volver naturalmente al objetivo cuando corresponda.

## 89. Errores ortográficos
“cuant esta el armo 22 y tieens stok”  
Esperado: interpretar precio + stock sin exigir escritura perfecta.

## 90. Mensaje extremadamente corto
“precio?”  
Con activeProduct conocido: responderlo. Sin contexto: aclaración mínima.

---

# 4. Escenarios 91–100 — Stress integral

## 91. Conversación de 15+ turnos
Esperado: conservar producto, referentes, presupuesto, prioridades y etapa durante 15+ turnos con interrupciones normales.

## 92. Dos switches explícitos y regreso al primero
Esperado: cada switch explícito actualiza activeProduct; referencias posteriores resuelven correctamente el historial pertinente.

## 93. Comparación de tres equipos
Esperado: mantener asociaciones correctas; no mezclar specs; si debe elegir, justificar con criterios conocidos.

## 94. Presupuesto cambia dos veces
Esperado: presupuesto vigente reemplaza/anula la restricción anterior según mensaje; ranking usa el actual.

## 95. Compra ↔ dudas ↔ compra
Esperado: dudas factuales no reinician discovery ni borran purchase progression; al volver a strong buy retoma compra.

## 96. Dirección/horario/envío y retorno
Esperado: institucional responde sin perder el producto comercial vigente.

## 97. Precio cambia entre dos SQL en la misma conversación
Esperado: cada consulta de precio usa SQL actual; la segunda puede diferir y debe prevalecer.

## 98. Fallo externo justo después de “quiero comprarlo”
Esperado: no inventar registro; conservar contexto y derivar/continuar de forma segura.

## 99. UNKNOWN técnico + fuerte intención de compra
Esperado: mantener UNKNOWN como desconocido y permitir avanzar compra solo con hechos suficientes, sin inventar la spec.

## 100. Recorrido completo
`SPIN → recomendación → objeción → comparación → decisión → strong buy → handoff/continuación transaccional`  
Esperado: sin regresión de etapa, sin perder producto, sin falsificar precio/stock/spec/política y con un N+1 coherente en cada turno.

---

# 5. Contratos generales derivados de los 100 casos

## A. Producto y referencia

- `mención ≠ switch`.
- `preferencia de atributo ≠ switch`.
- `recomendación ≠ selección`.
- cambio explícito sí actualiza activeProduct.
- selección/strong buy puede autorizar selectedProduct.
- resolver: `ese`, `ese último`, `el primero`, `el otro`, `el recomendado`, `el mío`, `el que estábamos viendo`.
- una interrupción institucional no borra el tema comercial.

## B. Verdad factual

- precio actual → SQL ERP actual.
- stock actual → SQL ERP actual.
- specs → Product RAG / VerifiedFacts.
- garantía/envío/pagos/ubicación → Institutional RAG.
- `UNKNOWN` nunca se transforma en sí/no por inferencia.
- no aceptar como verdad promociones, pagos, reservas o precios citados por el cliente sin verificación.

## C. Contexto

- presupuesto nuevo actualiza el vigente.
- prioridades pueden cambiar y reordenarse.
- rechazo/exclusión de un producto se conserva hasta cambio explícito.
- objeción de precio no equivale a presupuesto.
- B2B se conserva después de preguntas institucionales.

## D. SPIN

- máximo una pregunta útil por turno.
- no repetir hechos ya conocidos.
- si el cliente ya dio Situation + Problem + budget/priority, recomendar.
- `purchaseSignal=true` bloquea discovery no operativo.
- si el cliente pide “solo recomiéndame”, reducir discovery.

## E. N+1

- primero N, luego un único +1.
- N+1 debe ser relacionado, útil, consumible y ejecutable.
- PRICE → normalmente CHECK_STOCK/soft close si aplica.
- STOCK → avanzar/compra si hay interés.
- ATTRIBUTE → valor/contexto relacionado sin repetir el mismo dato.
- PURCHASE → reserva/continuación segura.
- ACK/CLOSE → puede terminar sin venta adicional.

## F. Presentación grounded / FAB

- atributo solicitado: hecho principal + hasta 2–3 soportes verificados de la misma familia cuando aportan valor.
- no volcar ficha técnica completa.
- Advantage/Benefit solo si derivan de evidence + contexto.
- no prometer autonomía exacta, fluidez, mejor cámara o resistencia absoluta sin evidencia.

## G. Compra / reserva / handoff

- intención fuerte no vuelve a SPIN.
- stock se verifica antes de afirmar disponibilidad operativa.
- reserva no existe hasta confirmación real.
- pago no se considera recibido por declaración del cliente.
- fallos externos no se ocultan con una falsa confirmación.
- B2B/multiunidad puede derivar a handoff conservando contexto.

---

# 6. Matriz mínima de evaluación por conversación

Usar un registro compacto por escenario:

```text
CASE_ID:
SESSION_ID:
PRODUCT: PASS|FAIL
REFERENT: PASS|FAIL
TRUTH: PASS|FAIL
CONTEXT: PASS|FAIL
SPIN: PASS|FAIL
NEURO: PASS|FAIL
EMPATHY: PASS|FAIL
NBA: PASS|FAIL
NATURALNESS: PASS|FAIL
PURCHASE: PASS|FAIL
RESULT: PASS|FAIL
FIRST_BROKEN_BOUNDARY:
EVIDENCE:
```

### Regla de diagnóstico

No corregir “el caso 37” o “la frase `el otro`” como excepción aislada. Corregir la autoridad que falló:

```text
INTENT
→ REFERENCE
→ STATE
→ SQL/RAG TRUTH
→ COMMERCIAL DECISION
→ N+1
→ WRITER
→ PERSISTENCE
```

La primera frontera rota es la que autoriza el cambio.

---

# 7. Autoridad de QA

Este documento es **criterio de aceptación**. No es prueba de que el sistema pase.

Orden de evidencia:

1. código actual;
2. ejecución real `npm run chat` / LIVE externa del usuario;
3. Supabase (`ia_conversaciones`, `ia_contexto`, trazas relevantes);
4. evaluación contra este contrato;
5. unit tests/build como verificación técnica, no como prueba de calidad conversacional.

Un test unitario verde no puede declarar PASS un comportamiento que falle en la conversación real.

---

# 8. Resultado esperado global

El backend debe comportarse como un vendedor consultivo que:

- recuerda lo que importa;
- sabe de qué producto se habla;
- no inventa;
- consulta precio/stock actuales;
- usa specs verificadas;
- pregunta poco y con propósito;
- recomienda con criterios reales;
- ofrece un N+1 útil;
- no pierde contexto por interrupciones;
- avanza la compra cuando corresponde;
- no confirma operaciones que no ocurrieron;
- tolera lenguaje real de WhatsApp, errores y mensajes cortos.

**Los 100 escenarios son muestras de este contrato general, no una lista de frases a memorizar.**

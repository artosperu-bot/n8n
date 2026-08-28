# STECH Backend — Live QA: Hallazgos, reglas y seguimiento

Fecha: 2026-08-21  
Rama: `feat/stech-backend`  
Estado: **TRACKER VIVO — NO ES CERTIFICACIÓN**  
Complementa:

- `backend/docs/SPIN-FAB-N1-POLITICA-COMERCIAL.md`
- `backend/docs/PLAN-P0-P8-RAG-COMERCIAL.md`
- `docs/superpowers/specs/2026-08-21-stech-root-cause-remediation-design.md`

## 1. Regla de autoridad para cerrar un hallazgo

Un hallazgo NO se marca como resuelto solo porque un unit test pase.

Para pasar a `CERTIFIED` debe existir, según corresponda:

1. implementación;
2. regresión automática;
3. evidencia Live;
4. evidencia persistida en `ia_conversaciones` y/o `ia_contexto`;
5. `STECH_TURN_TRACE` coherente con la respuesta final.

Estados:

- `OPEN`: defecto observado y no corregido o no comprobado;
- `FIXED-CODE`: corregido en código, falta Live;
- `LIVE-PASS`: comportamiento correcto observado en Live;
- `CERTIFIED`: código + regresión + Live + persistencia/traza coherentes.

## 2. Contrato comercial central

**SPIN decide qué necesitamos comprender; FAB decide cómo traducimos evidencia a beneficio; N+1 decide cuál es el siguiente movimiento comercial.**

Ninguna capa puede anular la anterior:

`verdad/autorización → intención actual → producto/referencia → respuesta actual → SPIN/FAB → N+1`

No existe un flujo universal obligatorio.

## 3. FAB — obligatorio, contextual y seguro

FAB NO es una lista de especificaciones ni debe desaparecer de la conversación comercial.

Contrato conceptual:

`Feature verificable → Advantage verificable/derivada → Benefit contextual seguro`

Ejemplo correcto:

- Feature: `6600 mAh`.
- Advantage: mayor capacidad que una alternativa de `6320 mAh`.
- Benefit contextual: para un cliente que usa GPS y datos muchas horas, ofrece más margen de capacidad.

No permitido sin evidencia adicional:

- “te dura todo el día”;
- “no se va a colgar”;
- “vas a tener menos reparaciones”;
- “la cámara será mucho mejor en baja luz” solo por más MP;
- “GPS más estable” solo por contar más constelaciones;
- “consume más” o “probablemente consume más” sin evidencia comparable.

FAB debe ser invisible al cliente: no escribir literalmente `Feature`, `Advantage`, `Benefit`, `Datos clave`, `Consecuencia práctica` o `Conclusión` como plantilla repetitiva salvo que el formato realmente lo necesite.

## 4. Writer — concisión, orden y no repetición

### Hallazgo LIVE-WRITER-001 — repetición factual

Estado: `OPEN`

Ejemplo observado:

> Conclusión: el Armor 22 pesa 324 g.
> - **Peso:** 324 g.

Problema: el dato es correcto, pero la misma afirmación se repite sin aportar información nueva.

Regla general:

**Una misma afirmación factual no debe repetirse en encabezado + bullet + conclusión cuando la segunda aparición no aporta contexto, comparación, ventaja o beneficio.**

Respuesta objetivo para pregunta simple:

> El **Armor 22 pesa 324 g**.

Respuesta objetivo para varios atributos:

> **Armor 22**
> * **Peso:** 324 g
> * **Batería:** 6600 mAh
> * **Carga:** 33 W

No agregar otra conclusión que repita los mismos valores.

Aplicar la misma regla a:

- precio;
- stock;
- batería;
- cámara;
- RAM/memoria;
- resistencia;
- procesador;
- peso;
- recomendación;
- política institucional.

### Formato objetivo

Para WhatsApp/chat:

- respuesta directa primero;
- negrita solo en producto, decisión o dato realmente importante;
- bullets `*` cuando hay 2 o más datos;
- evitar bloques artificiales largos;
- no repetir CTA;
- máximo una pregunta útil por turno salvo un flujo transaccional definido;
- si una frase basta, usar una frase.

## 5. N+1 — debe verse en comportamiento, no solo en estado

### Hallazgo LIVE-N1-001 — N+1 persistido no garantiza N+1 correcto

Estado: `OPEN`

La persistencia correcta de `lastNba`, `pendingCommercialAction` o contexto no prueba que el siguiente movimiento comercial sea el adecuado.

Auditar cada turno como:

`mensaje actual → contexto previo → intent → producto/referencia → buying stage → acción pendiente → N+1 elegido → writer → respuesta final → estado persistido`

Se deben distinguir dos defectos:

1. `N+1 incorrecto desde el motor`;
2. `N+1 correcto internamente pero writer lo ignora/promueve/cambia`.

Reglas obligatorias:

- `ANSWER_ONLY` → cero pregunta comercial añadida;
- si ya se conoce la prioridad, no volver a preguntarla;
- recomendación aceptada → no regresar a discovery;
- “si hay stock lo compro” → no preguntar luego “¿quieres comprarlo?”;
- “sí/dale/ya” se interpreta según la acción pendiente;
- compra personal 1 unidad → reserva;
- cantidad >=2 → handoff con contexto;
- no preguntar solo para mantener vivo el chat.

## 6. SPIN — no repetir discovery conocido

### Hallazgo LIVE-SPIN-001 — pregunta genérica repetida

Estado: `OPEN`

Ejemplo observado:

> ¿Qué aspecto es más importante para ti en el equipo?

Problema: apareció aun cuando el cliente ya había expresado prioridades como cámara, fotos de trabajos, redes y resistencia.

Regla:

Si `useCase/problem/priorities` ya contienen información suficiente para que un criterio cambie la recomendación, el sistema debe pasar a `RECOMMEND` o responder, no volver a `ASK_MISSING_FACT` genérico.

Solo preguntar un dato faltante si cambia materialmente:

- producto recomendado;
- presupuesto/fit;
- comparación;
- compra/reserva;
- cantidad;
- política necesaria.

## 7. Product RAG y atributos específicos

### Hallazgo LIVE-RAG-001 — atributos específicos degradados a PRODUCT_INFO

Estado: `FIXED-CODE`, pendiente de certificación Live.

Casos observados en Armor 22:

- `q procesador tiene?`;
- `tiene huella?`;
- `acepta dual sim?`;
- `q peso tiene?`.

La información existía en RAG, pero la decisión podía degradarse a `PRODUCT_INFO` genérico y terminar en fallback.

Regla:

Una intención determinística específica de atributo debe tener autoridad sobre un `PRODUCT_INFO` genérico del planner.

Mapeo esperado:

- procesador → `RENDIMIENTO`;
- huella → `SEGURIDAD`;
- dual SIM → `SIM`;
- peso → `FISICO`;
- cámara → `CAMARA`;
- térmica/temperatura → `TERMICA`;
- agua/polvo/caídas → `RESISTENCIA`.

## 8. Writer fallback

### Hallazgo LIVE-WRITER-002 — fallback destruye respuesta válida

Estado: `FIXED-CODE`, pendiente de certificación Live.

Mensaje observado:

> Puedo ayudarte a evaluar Armor 22; prefiero no afirmar una característica que no tenga confirmada.

Causa encontrada: el RAG y producto podían estar correctos, pero el writer añadía una pregunta no permitida bajo `ANSWER_ONLY`; el guard descartaba toda la respuesta.

Regla nueva:

Si la ÚNICA violación es una pregunta añadida bajo `ANSWER_ONLY`, conservar la parte factual grounded y eliminar la pregunta. Volver a validar.

NO suavizar otras barreras:

- producto inventado;
- precio no solicitado;
- stock crudo;
- superlativo sin evidencia;
- side effect falso;
- especulación factual.

## 9. Recomendación — todos los candidatos elegibles deben competir

### Hallazgo LIVE-REC-001 — sesgo aparente hacia X12/X12 Pro

Estado: `OPEN / EN DIAGNÓSTICO CON TRACE`

En la corrida `qa-20260821-201630-91e5` se observó alta frecuencia de X12/X12 Pro y ausencia de 25T Pro como recomendado.

No hardcodear productos para corregirlo.

Auditar con:

- candidatos SQL;
- filtros por stock/presupuesto;
- secciones RAG pedidas;
- evidencia recuperada;
- criterios derivados;
- score por criterio;
- cobertura/confianza;
- ganador;
- descarte y motivo.

Regla:

El precio NO debe convertirse en desempate silencioso si el cliente no indicó precio/presupuesto como criterio relevante.

## 10. TERMICA / Armor 25T Pro y capacidades diferenciales

### Hallazgo LIVE-REC-002 — TERMICA existía en RAG pero no pesaba en ranking

Estado: `FIXED-CODE`, pendiente Live.

`TERMICA` debe ser criterio de primera clase cuando la necesidad incluya:

- temperatura;
- inspección térmica;
- mantenimiento eléctrico/mecánico relevante;
- calor/frío;
- detección térmica;
- uso profesional donde esa capacidad cambie la decisión.

Esto NO significa que 25T Pro deba ganar siempre.

Significa que una capacidad real documentada no puede valer cero en el RecommendationPolicy.

## 11. Cámara — separar dimensiones y evitar inferencias inválidas

### Hallazgo LIVE-TRUTH-001

Estado: `OPEN / parcialmente protegido por WriterGuard`

Respuesta observada afirmaba que mayor MP nocturno implicaba “mucho mejor rendimiento en baja luz”.

Regla:

Separar al menos:

- `CAMARA_FOTO`;
- `CAMARA_NOCTURNA`;
- `VIDEO`;
- `TERMICA`.

Permitido:

`64 MP vs 24 MP` → mayor resolución nominal/nocturna.

No permitido sin evidencia:

`64 MP vs 24 MP` → automáticamente “mucho mejor en baja luz”.

Una comparación de cámara debe aclarar fortalezas distintas cuando existan, en lugar de inventar un ganador universal.

## 12. Observabilidad obligatoria

Cada turno relevante debe poder diagnosticarse con `STECH_TURN_TRACE` y persistencia.

Campos mínimos útiles:

- `sessionId`;
- `messageId`;
- `deterministicIntent`;
- `plannerIntent`;
- `finalIntent`;
- `route`;
- `nextBestAction`;
- `target`;
- `recommendedProduct`;
- `winner`;
- `sectionsRequested`;
- `rankedCandidates`;
- score/confidence/criteria/criterionScores;
- `writerFallback`.

En error:

- `STECH_TURN_ERROR`;
- error sanitizado;
- nunca secretos, embeddings completos, DNI, nombres, dirección o credenciales.

En Supabase, el trace debe ser auditable junto a la conversación/contexto sin crear una fuente de verdad paralela.

## 13. Corrida de referencia actual

`qa-20260821-201630-91e5`

Resumen recibido:

- GREEN=0
- YELLOW=8
- RED=12
- turns=100
- tokens=89574
- productIdentity=21/27
- referenceAccuracy=21/24
- factualAccuracy=33/45
- noFabrication=90/100
- memoryConsistency=99/100
- questionResolved=100/100
- nbaQuality=95/100
- purchaseProgression=2/7
- persistence=100/100

Lectura:

- persistencia: fuerte;
- memoria: fuerte;
- resolución inmediata: fuerte;
- verdad/no fabricación: mejoró pero no está cerrada;
- identidad/referencias: pendiente;
- N+1: métrica alta no basta; revisar calidad real turno por turno;
- purchase progression: bloqueante principal;
- writer/FAB/recommendation: revisar con trazas y respuestas persistidas.

## 14. Checklist para cada nueva prueba Live

Por sesión problemática revisar:

1. ¿Qué entendió el determinístico?
2. ¿Qué propuso el planner?
3. ¿Cuál fue el intent final?
4. ¿Qué producto/referencia quedó activa?
5. ¿Qué necesidad/prioridades existían ya en memoria?
6. ¿Repitió SPIN innecesariamente?
7. ¿Qué candidatos SQL compitieron?
8. ¿Qué secciones RAG se consultaron por candidato?
9. ¿Qué criterio ganó y por qué?
10. ¿FAB convirtió el dato en beneficio seguro?
11. ¿Hubo inferencia no soportada?
12. ¿N+1 fue coherente con buying stage y acción pendiente?
13. ¿El writer respetó N+1?
14. ¿Hubo repetición textual/factual?
15. ¿La respuesta fue corta y ordenada?
16. ¿`ia_conversaciones` persistió el turno correcto?
17. ¿`ia_contexto` conservó producto, necesidad, etapa y pending action?
18. ¿`STECH_TURN_TRACE` coincide con la respuesta y el estado persistido?

## 15. Regla de evolución

Cada nuevo hallazgo Live debe corregirse como **familia de comportamiento**, nunca mediante hardcode por frase, modelo o journey específico salvo una whitelist/autorización contractual explícita.

Ejemplos:

- si se repite peso, corregir deduplicación factual general;
- si se pierde cámara térmica, corregir criterio/cobertura general;
- si N+1 pregunta de más, corregir autoridad del N+1/writer;
- si falla `el otro`, corregir resolución contextual general;
- si un producto aparece demasiado, auditar ranking y cobertura antes de penalizar ese modelo por nombre.

## 16. Próximos focos activos

1. `LIVE-WRITER-001` deduplicación factual y formato conciso;
2. `LIVE-N1-001` N+1 real vs N+1 persistido;
3. `LIVE-SPIN-001` no repetir discovery conocido;
4. `LIVE-REC-001` sesgo/ranking con trace;
5. `LIVE-TRUTH-001` FAB/cámara sin inferencias;
6. cierre personal/reserva `purchaseProgression`;
7. nueva evidencia Live + Supabase antes de certificar.

Producción: **NO TOCAR / NO MERGE / NO DEPLOY** sin gate explícito.
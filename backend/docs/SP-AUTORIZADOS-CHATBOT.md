# SP autorizados para el chatbot STECH

Fecha de congelamiento: 2026-08-21
Estado: **CONTRATO PROVISIONAL AUTORIZADO POR EL USUARIO**
Rama: `feat/stech-backend`

## Regla principal

Hasta nueva aprobación explícita, el backend/chatbot puede diseñarse e integrarse **solo** alrededor de los siguientes Stored Procedures de negocio.

No se debe incorporar otro SP del script SQL adjunto aunque exista, parezca útil o tenga funcionalidad relacionada. Cualquier ampliación de esta whitelist requiere revisión y aprobación previa.

## Whitelist autorizada

1. `dbo.sp_BuscarImagenesProductoVenta`
   - Uso previsto: obtener imágenes reales del producto resuelto.
   - Autoridad: catálogo SQL para URLs de imágenes.

2. `dbo.sp_BuscarProductosVenta`
   - Uso previsto: resolver/buscar productos y obtener datos comerciales autoritativos como precio, moneda, stock, garantía y estado comercial.
   - Autoridad principal para precio/stock del producto.

3. `dbo.sp_ConsultarPedido`
   - Uso previsto: consulta protegida del estado de un pedido.
   - Regla de seguridad: requiere número de pedido + correo exactos; no debe revelar información si no coinciden ambos datos.

4. `dbo.sp_IA_RegistrarReserva24h_Idempotente`
   - Uso previsto: cierre comercial con reserva de 24 horas cuando el flujo de compra realmente corresponda y estén disponibles/confirmados los datos requeridos.
   - Es el SP autorizado para registrar la reserva desde el chatbot.
   - Debe utilizar una `IdempotencyKey` válida para evitar duplicados.
   - Si ya existe una reserva para la misma clave idempotente, debe reutilizar/devolver esa reserva en vez de crear otra.
   - **Regla de verdad:** el chatbot solo puede afirmar que la reserva fue creada/registrada si este SP terminó correctamente y devolvió evidencia de la reserva. Nunca anticipar una reserva antes de ejecutarla con éxito.

5. `dbo.sp_ListarCatalogoVenta`
   - Uso previsto: navegación/listado general del catálogo de venta, con filtros autorizados.

6. `dbo.sp_ListarCategoriasVenta`
   - Uso previsto: listar categorías activas disponibles para la navegación comercial.

7. `dbo.sp_ListarSubcategoriasVenta`
   - Uso previsto: listar subcategorías activas, opcionalmente filtradas por categoría.

8. `dbo.sp_ResolverContextoCatalogoVenta`
   - Uso previsto: resolver texto del cliente contra contexto de catálogo antes de decidir navegación/producto.

## SP explícitamente fuera de alcance por ahora

Aunque aparezcan en el dump SQL enviado, **NO quedan autorizados para integración en esta etapa** otros procedimientos como:

- `dbo.IA_STECH_ATENDER_CATALOGO`
- `dbo.sp_BuscarAlternativasProductoVenta`
- `dbo.sp_BuscarProductoEspecificacionesVenta`
- SP de cotización distintos de los ocho autorizados
- SP de conversión de cotización a pedido
- SP de cierre/marcado de reservas
- cualquier otro SP no incluido expresamente en la whitelist anterior

Esto no significa que sean incorrectos; solamente están fuera del contrato actual hasta nueva autorización.

## Regla comercial para cierre / reserva

Cuando el cliente manifieste una intención fuerte de compra, el sistema no debe limitarse automáticamente a una frase genérica como:

> "Listo, te paso con un asesor para continuar la compra."

El diseño de cierre deberá contemplar el flujo de **reserva 24h** usando `dbo.sp_IA_RegistrarReserva24h_Idempotente` cuando corresponda, respetando validaciones, datos obligatorios, idempotencia y confirmación real del resultado.

Hasta implementar y probar ese flujo, no se debe afirmar que una reserva ya fue creada.

### Contrato de captura de datos para reserva normal de 1 unidad

Cuando el cliente ya haya manifestado una intención clara de compra y el producto esté resuelto por el contexto, el chatbot deberá solicitar **sí o sí** únicamente estos tres datos visibles al cliente, en este orden lógico:

1. **DNI o Carné de Extranjería**
2. **Nombres y apellidos**
3. **Dirección**

Reglas asociadas:

- Estos tres datos deben persistirse/enviarse al flujo de reserva conforme al contrato del SP autorizado.
- No volver a preguntar el producto si ya está resuelto por la conversación.
- Para el flujo normal de reserva se asume **1 unidad**; no se debe preguntar cantidad como parte de la captura estándar.
- Si el cliente expresa que desea **2 o más unidades**, salir del flujo estándar de reserva de una unidad y derivar a un asesor para continuar condiciones/cantidad/cotización.
- Teléfono/WhatsApp **no se solicita por ahora en este flujo conversacional**. En producción se prevé obtenerlo automáticamente desde el canal de WhatsApp; durante QA/local debe omitirse como pregunta al cliente hasta definir el mecanismo técnico correspondiente.
- Los campos técnicos adicionales que el SP pueda requerir no deben convertirse automáticamente en preguntas al cliente. Deben completarse desde contexto, configuración del canal o lógica interna cuando corresponda.
- No pedir nuevamente un dato que ya esté disponible y validado en el estado de la conversación.
- La reserva solo puede declararse creada después de una ejecución exitosa y verificable de `dbo.sp_IA_RegistrarReserva24h_Idempotente`.

### Secuencia comercial esperada para 1 unidad

`señal fuerte de compra → producto ya resuelto → pedir DNI/CE → pedir nombres y apellidos → pedir dirección → ejecutar reserva idempotente → confirmar resultado real`

Si el cliente pide 2 o más unidades:

`señal fuerte de compra + cantidad >= 2 → handoff a asesor con contexto preservado`

## Regla global de N+1 contextual / Next Best Action

El N+1 debe evaluarse **en cada respuesta del bot**, pero eso no significa que cada respuesta deba terminar obligatoriamente con una pregunta.

La regla es: después de resolver correctamente la intención actual, el sistema debe decidir inteligentemente cuál es el mejor siguiente paso comercial utilizando intención, estado de conversación, producto activo/recomendado/seleccionado, presupuesto, necesidad, objeciones y señales de compra ya conocidas.

El N+1 puede ser cualquiera de estas formas según el caso:

- **Responder y terminar (`ANSWER_ONLY`)** cuando la consulta factual ya quedó resuelta y añadir otra pregunta solo generaría ruido.
- **Hacer una sola pregunta útil** cuando falta un dato que realmente cambia la recomendación o la decisión.
- **Acercar naturalmente al producto** cuando el cliente todavía está en una consulta institucional/general y existe una oportunidad comercial razonable.
- **Recomendar o comparar** cuando ya existe suficiente contexto de necesidad, presupuesto o prioridad.
- **Hacer un soft close** cuando el cliente ya está evaluando un producto concreto.
- **Avanzar a reserva/asesor** cuando existe señal fuerte de compra, sin devolver al cliente a preguntas de discovery ya superadas.

### Aplicación por tipo de conversación

#### Consultas institucionales: horario, ubicación, garantía, pagos, envío, etc.

Primero se responde la consulta concreta de forma clara y breve. Después, si tiene sentido comercial, el bot puede generar un puente suave hacia producto o compra sin sonar forzado.

Ejemplo conceptual:

`pregunta por horario → responder horario → si no hay compra avanzada, ofrecer ayuda para elegir/encontrar un equipo adecuado`

No utilizar siempre la misma frase ni convertir toda consulta institucional en una venta agresiva. El puente debe depender del contexto.

#### Consultas de producto: precio, stock, imágenes, especificaciones

Primero se responde exactamente lo solicitado con la fuente autoritativa correspondiente. Luego el N+1 solo aparece si aporta valor.

Ejemplos conceptuales:

- `pregunta precio → responder precio → si está evaluando compra, avanzar a disponibilidad/cierre`
- `pregunta resistencia → responder resistencia → si conocemos el uso, conectar el beneficio con ese uso`
- `pregunta imagen → entregar imagen → no obligar a una pregunta artificial si no hace falta`

#### Cliente que piensa comprar

Si aparecen señales como “estoy pensando comprarlo”, “me interesa”, “creo que me quedo con ese”, el N+1 debe avanzar la conversación hacia decisión/cierre de forma progresiva, usando lo que ya se conoce y evitando reiniciar discovery.

#### Cliente que ya decidió comprar

Si aparece una señal fuerte como “ya lo compro”, “me llevo ese”, “quiero ese”, “separa ese”, el N+1 deja de ser discovery y pasa al flujo de compra/reserva definido en este documento.

Para una unidad y producto resuelto:

`compra clara → pedir únicamente el siguiente dato faltante entre DNI/CE, nombres y apellidos, dirección → reserva`

Para 2 o más unidades:

`compra clara + cantidad >= 2 → asesor con contexto preservado`

#### Objeciones o dudas

El N+1 debe resolver primero la objeción y luego elegir el siguiente paso comercial adecuado: reforzar ajuste al uso, ofrecer alternativa, comparar o acercar al cierre. No responder con guiones rígidos ni técnicas nombradas explícitamente.

### Reglas de calidad N+1

- Máximo **una pregunta útil por turno** salvo que una operación transaccional requiera explícitamente un bloque de datos y se haya definido así.
- Nunca preguntar algo que ya se sabe por memoria/estado.
- No preguntar por preguntar.
- No forzar producto si el usuario solo necesita una respuesta institucional y el puente comercial sería inoportuno.
- No usar siempre CTA genéricos como “¿en qué más te ayudo?”.
- No usar siempre “¿quieres que te recomiende...?”; variar según la etapa real.
- El siguiente paso debe sentirse como continuidad natural de la conversación, no como un árbol de decisiones visible.
- SPIN, FAB, empatía, neuroventas y manejo de objeciones deben influir en la decisión y redacción, pero nunca mencionarse como técnicas al cliente.
- La empatía debe ser principalmente **implícita y contextual**, no una muletilla repetitiva como “te entiendo”.
- Si ya existe una intención de compra, priorizar progresión comercial sobre discovery.
- Si la mejor acción es no preguntar nada, `ANSWER_ONLY` es una respuesta correcta y profesional.

## Observaciones comerciales pendientes para la próxima iteración

Estas observaciones quedan anotadas, **pero no se implementan en este cambio documental**:

- Reducir muletillas como "Te entiendo" cuando no aportan valor.
- Evitar lenguaje interno/robótico como "del catálogo verificado" o explicaciones del mecanismo interno.
- Responder más comercial y naturalmente, con empatía contextual en lugar de empatía declarativa.
- Aplicar SPIN, FAB, manejo de objeciones, neuroventas y cierre de manera natural, sin nombrar las técnicas.
- Evitar respuestas negativas del tipo "no hay un celular para delivery genérico" cuando existen alternativas reales que pueden presentarse de forma positiva.
- En señales claras de compra, avanzar el proceso comercial sin devolver al cliente a discovery innecesario.

## Estado de implementación

- Whitelist documentada: **SÍ**
- Contrato de captura de reserva documentado: **SÍ**
- Contrato N+1 contextual documentado: **SÍ**
- Código modificado en este cambio: **NO**
- Flujo de reserva conectado al backend: **PENDIENTE DE LA SIGUIENTE ITERACIÓN**
- Writer comercial/neuroventas ajustado: **PENDIENTE DE LA SIGUIENTE ITERACIÓN**
- N+1 contextual validado con Golden 100: **PENDIENTE**
- Golden 100 modificado: **NO**
- Producción modificada: **NO**

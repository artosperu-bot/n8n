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
- Código modificado en este cambio: **NO**
- Flujo de reserva conectado al backend: **PENDIENTE DE LA SIGUIENTE ITERACIÓN**
- Writer comercial/neuroventas ajustado: **PENDIENTE DE LA SIGUIENTE ITERACIÓN**
- Golden 100 modificado: **NO**
- Producción modificada: **NO**

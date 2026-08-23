# STECH BACKEND — MASTER ARCHITECTURE & AUTHORITY GUIDE

**Estado:** documento maestro vigente del backend conversacional STECH  
**Branch de referencia:** `feat/stech-backend`  
**Objetivo:** explicar la estructura real del backend, sus autoridades, sus límites y el flujo correcto para modificarlo sin romper comportamiento ya estabilizado.

> Este archivo NO reemplaza los contratos existentes. Los organiza y define el orden en que deben leerse antes de tocar código.

---

## 1. Regla principal antes de modificar el backend

Antes de corregir cualquier comportamiento:

1. Identificar la frontera exacta donde ocurre el defecto.
2. Identificar qué `.md` gobierna esa frontera.
3. Identificar qué módulo implementa esa autoridad.
4. Confirmar qué partes adyacentes ya están cerradas o funcionando.
5. Corregir la causa raíz en esa frontera.
6. No parchear frases de salida cuando el defecto pertenece a evidencia, estado, N+1, selección, writer o persistencia.
7. No modificar SQL, ranking, memoria, SPIN, RAG, Writer o n8n si la evidencia no apunta allí.
8. La conversación LIVE real (`npm run chat`) es la autoridad final de comportamiento.

Nunca debe ocurrir este flujo:

```text
respuesta fea
→ agregar regex/frase especial
→ ocultar síntoma
→ romper otro flujo
```

El flujo correcto es:

```text
síntoma LIVE
→ localizar primera frontera rota
→ revisar contrato
→ revisar autoridad de código
→ fix general y acotado
→ build
→ LIVE externo
```

---

## 2. Jerarquía de documentación

### Autoridades principales

1. `STECH_CONVERSATION_COMMERCIAL_CONTRACT.md`
   - contrato conversacional general;
   - SPIN;
   - N+1;
   - FAB;
   - CAN_EXECUTE;
   - estado comercial;
   - señales de compra;
   - reserva;
   - Writer.

2. `STECH_BACKEND_AUTHORITY.md`
   - autoridad operativa del backend;
   - qué capa puede decidir qué cosa;
   - límites SQL / RAG / memoria / Writer.

3. `CONVERSATION-CODE-AUTHORITY-MAP.md`
   - mapa contrato → archivo de código;
   - usarlo antes de cambiar lógica conversacional.

4. `SPIN-FAB-N1-POLITICA-COMERCIAL.md`
   - política comercial complementaria;
   - cualquier regla antigua de `ANSWER_ONLY` que contradiga el contrato maestro se considera histórica.

### Documentación de soporte

- `ARQUITECTURA.md`: visión de alto nivel.
- `CONEXIONES-REALES.md`: integraciones reales.
- `CONFIGURACION.md`: variables y configuración.
- `COMO-PROBAR-EL-BOT.md`: ejecución local.
- `MIGRACION-N8N.md`: relación backend ↔ n8n.
- `LIVE-QA-*`, `AUDIT-*`, `IMPLEMENTACION-*`: evidencia histórica; NO autoridad actual por sí sola.

### Regla de conflicto

Si dos documentos contradicen el comportamiento actual:

```text
contrato maestro actual
> mapa de autoridad de código
> arquitectura actual
> documentos históricos / auditorías / QA anteriores
```

---

## 3. Arquitectura general

```text
CLIENTE
  ↓
INPUT
  ↓
INTERPRETACIÓN DETERMINÍSTICA + SEMÁNTICA
  ↓
INTENT + REFERENCE RESOLUTION
  ↓
CONVERSATIONAL STATE
  ↓
FACTUAL AUTHORITIES
  ├─ SQL ERP
  ├─ Product RAG
  └─ Institutional RAG
  ↓
COMMERCIAL DECISION
  ├─ SPIN cuando aporta información faltante
  ├─ Recommendation / Ranking
  └─ Purchase / Reservation
  ↓
N+1 / NEXT BEST ACTION
  ↓
CAN_EXECUTE
  ↓
FAB cuando corresponde
  ↓
WRITER
  ↓
WRITER GUARD
  ↓
RESPONSE
  ↓
PERSISTENCE / MEMORY / TELEMETRY
  ↓
N8N SECONDARY AUTOMATION
```

Ninguna capa inferior puede inventar autoridad que no recibió de una capa superior.

---

## 4. Estructura real de `backend/src/conversation`

### `HybridConversationEngine.ts`

Orquestador principal del turno.

Responsabilidades:

- cargar estado anterior;
- procesar reserva activa;
- extraer hechos comerciales;
- invocar planner semántico;
- aplicar decisión determinística;
- resolver referencia de producto;
- consultar ERP/RAG;
- ejecutar ranking;
- calcular N+1;
- construir respuesta;
- persistir estado;
- emitir telemetría/automatización.

**No debe convertirse en un archivo de parches de presentación.** La lógica debe vivir en los módulos especializados cuando exista una autoridad dedicada.

---

### `budget/`

Autoridad de presupuesto y objeción económica.

Debe distinguir:

- presupuesto informado;
- objeción de precio;
- cambio de presupuesto;
- recomendación dentro de presupuesto.

No decide por sí solo qué producto recomendar.

---

### `commercial/`

Autoridad comercial y de presentación grounded.

Incluye, entre otros:

- extracción de hechos comerciales;
- interés / purchase signal;
- Product Evidence Policy;
- `VerifiedFact` / contratos comerciales;
- respuestas directas grounded;
- FAB / contextual benefit;
- reserva y captura de datos;
- ResponsePolicy.

Principio:

```text
RAW RAG
→ NORMALIZED EVIDENCE
→ ATOMIC VERIFIED FACT
→ CUSTOMER DISPLAY FACT
```

Nunca:

```text
RAW RAG ROW
→ Writer directamente
```

---

### `decision/`

Autoridad de validación de la decisión del turno.

El planner LLM propone; el validador protege:

- intención canónica;
- selección de producto;
- referencias;
- cambios explícitos;
- compra;
- compatibilidad N+1;
- identidad real del catálogo.

El planner NO puede degradar una señal determinística de compra ni inventar selección.

---

### `evidence/`

Autoridad de normalización de evidencia.

Debe convertir SQL/RAG a hechos pequeños, tipados y verificables.

Ejemplo resistencia:

```text
RESISTENCIA_CAIDAS = 1.5 m
IP68 = Sí
IP69K = Sí
MIL_STD_810H = Sí
```

No guardar un párrafo técnico completo como una única Feature.

---

### `history/`

Responsabilidad sobre historial conversacional cuando corresponda.

La historia ayuda a interpretar el turno, pero no reemplaza el estado operativo actual ni una autoridad factual.

---

### `institutional/`

Resuelve intención/pregunta institucional:

- garantía;
- delivery;
- pagos;
- ubicación;
- políticas;
- postventa.

Fuente factual: Institutional RAG.

---

### `intent/`

Autoridad determinística de intención básica.

Debe reconocer señales explícitas y declarativas sin depender completamente del LLM.

Ejemplos:

- precio;
- stock;
- RAM;
- resistencia;
- comparación;
- uso;
- compra.

---

### `nba/`

Autoridad de Next Best Action.

Pregunta que debe responder:

> Después de resolver lo actual, ¿cuál es la ÚNICA continuación útil, relacionada, ejecutable y no repetitiva?

Ejemplos:

```text
PRICE → responder precio + revisar stock
STOCK → responder disponibilidad + avanzar
ATTRIBUTE → responder atributo + un valor relacionado
RECOMMEND → recomendar + soft close
PURCHASE → COLLECT_RESERVATION_DATA
```

N+1 no significa hacer siempre una pregunta.

N+1 no puede:

- repetir el N;
- abrir discovery innecesario;
- inventar capacidades;
- ofrecer demo/visita/agendamiento no implementado;
- contradecir purchaseSignal.

---

### `recommendation/`

Autoridad de candidatos y ranking.

Separar siempre:

```text
CATALOG EXISTS
AVAILABLE
ELIGIBLE
RANKED
WINNER / TIE / NO COMPARABLE EVIDENCE
```

Un producto con stock 0 sigue existiendo en catálogo.

Una recomendación nunca debe cambiar silenciosamente el producto activo salvo regla autorizada.

---

### `reference/`

Autoridad de referencia conversacional de producto.

Distingue:

- producto mencionado ahora;
- activeProduct;
- selectedProduct;
- recommendedProduct;
- comparisonProducts;
- queryTarget;
- cambio explícito.

Regla:

```text
mención ≠ selección
recomendación ≠ selección
selección explícita / purchase confirmation = selección autorizada
```

---

### `state/`

Autoridad de reducción y persistencia del estado vigente.

Conceptos principales:

- activeProduct;
- selectedProduct;
- recommendedProduct;
- queryTarget;
- budget;
- useCase;
- problem;
- priorities;
- objection;
- purchaseSignal;
- lastIntent;
- lastNba;
- pendingCommercialAction;
- reservationStage.

Regla:

```text
ia_conversaciones = historia de turnos
ia_contexto = estado actual
```

---

### `writer/`

El Writer redacta. NO decide hechos ni negocio.

Debe recibir:

- respuesta directa grounded;
- hechos verificados;
- producto autorizado;
- acción comercial ejecutable;
- contexto comercial autorizado.

`WriterGuard` protege la salida final contra:

- datos no verificados;
- productos no autorizados;
- precio no solicitado;
- mini-catálogos innecesarios;
- duplicación;
- ruptura de recomendación;
- N+1 ausente o inválido;
- promesas no soportadas.

El Writer no puede cambiar la decisión comercial.

---

## 5. Autoridades factuales

### SQL ERP

Autoridad para:

- producto/catalog identity;
- part number / product code cuando aplique;
- precio;
- stock;
- imágenes SQL cuando corresponda;
- datos operativos ERP.

SQL no debe ser reemplazado por una inferencia LLM.

### Product RAG

Autoridad para:

- RAM;
- batería;
- resistencia;
- certificaciones;
- cámara;
- conectividad;
- dimensiones;
- demás especificaciones técnicas documentadas.

### Institutional RAG

Autoridad para:

- garantía;
- políticas;
- entrega;
- pagos;
- ubicación;
- postventa.

### LLM

El LLM puede:

- interpretar;
- redactar;
- resumir;
- generar Advantage/Benefit seguro.

No puede:

- inventar Feature;
- inventar precio/stock;
- inventar política;
- seleccionar arbitrariamente un producto;
- confirmar una reserva no ejecutada.

---

## 6. SPIN

SPIN descubre, no gobierna el cierre.

Se usa solo si:

```text
UNKNOWN
+ DECISION_IMPACT
+ CAN_CONSUME_ANSWER
```

No preguntar uso, presupuesto o prioridad de nuevo si ya se conocen.

No ejecutar SPIN cuando `purchaseSignal=true` salvo necesidad estrictamente operativa del cierre.

---

## 7. N+1

N+1 es la autoridad del único siguiente movimiento.

Regla de salida:

```text
N = responder exactamente lo preguntado
+1 = UNA continuación útil
```

### Atributos

Cuando el cliente pregunta por un atributo, la respuesta directa puede incluir:

- hecho principal solicitado;
- hasta 2–3 hechos verificados de soporte DE LA MISMA FAMILIA;
- luego un +1 contextual o comercial.

Ejemplo:

```text
Cliente: ¿Aguanta caídas?

N:
Armor X12 Pro tiene resistencia a caídas de 1.5 m.
También cuenta con IP68, IP69K y MIL-STD-810H.

+1:
Si te preocupan las caídas frecuentes, esa resistencia es especialmente relevante para tu decisión.
```

No mezclar RAM, NFC, bandas o cámara dentro de una pregunta de resistencia.

### Precio

```text
N: precio confirmado
+1: revisar stock
```

### Stock

```text
N: disponibilidad
+1: avanzar con el modelo
```

### Compra

```text
N: confirmar intención de avanzar
+1: COLLECT_RESERVATION_DATA
```

---

## 8. FAB

Orden:

```text
Feature verificada
→ Advantage segura
→ Benefit contextual
```

FAB debe usar la misma familia semántica del atributo.

No enlazar:

```text
resistencia → WhatsApp
cámara → llamadas
RAM → golpes
```

si no existe una relación comercial demostrable.

Si el contexto no es relevante, usar beneficio neutral o terminar con el hecho.

---

## 9. Producto activo, recomendado y seleccionado

### `activeProduct`
Producto tema actual.

### `recommendedProduct`
Resultado de recomendación vigente.

### `selectedProduct`
Elección explícita/autorizada del cliente.

Reglas:

- recomendar no selecciona;
- mencionar no selecciona;
- preguntar precio no selecciona;
- `sí` después de `¿Quieres avanzar con ese modelo?` puede confirmar selección si existe contexto inequívoco;
- una selección explícita no debe perderse por una pregunta factual posterior.

---

## 10. Reserva

La reserva es determinística y separada del Writer.

Flujo vigente deseado:

```text
PURCHASE
→ COLLECT_RESERVATION_DATA
→ capturar DNI/CE + nombre completo + dirección
→ READY
→ EXECUTE_RESERVATION únicamente mediante operación autorizada
```

Los datos deben poder recibirse juntos:

```text
DNI: 12345678, Nombre: Juan Perez Lopez, Dirección: Av. Arequipa 1234, Lima
```

También se aceptan separadores naturales (`|`, `;`, saltos de línea, comas etiquetadas).

Si falta un campo:

- conservar los válidos;
- pedir únicamente lo faltante;
- no reiniciar el formulario.

Nunca afirmar que la reserva existe antes de que la operación autorizada haya terminado correctamente.

Stored procedure autorizada cuando aplique:

`dbo.sp_IA_RegistrarReserva24h_Idempotente`

No inventar parámetros ni éxito de ejecución.

---

## 11. Persistencia / Supabase

Persistencia operativa principal:

- `ia_sesiones`;
- `ia_conversaciones`;
- `ia_contexto`;
- `ia_clasificaciones_log`;
- vistas de contexto operativo/reciente.

Regla:

- guardar resultado final, no borradores intermedios como autoridad;
- preservar contextVersion/concurrencia;
- no permitir que un Writer cambie silenciosamente el estado comercial.

---

## 12. n8n

n8n es una integración/automatización secundaria del backend actual.

No debe convertirse en autoridad de:

- intención;
- producto activo;
- ranking;
- precio;
- stock;
- SPIN;
- N+1;
- Writer.

Un fallo de n8n no debe convertir una respuesta comercial correcta en un defecto factual del backend.

---

## 13. SQL Bridge

ERP mode vigente puede operar vía SQL bridge.

Cuando el bridge está caído:

```text
ERP_UNAVAILABLE
```

No interpretar caída de infraestructura como `UNKNOWN_PRODUCT`.

No inventar precio/stock durante outage.

---

## 14. Qué NO tocar sin evidencia directa

Si un LIVE demuestra defecto de N+1:

- no modificar SQL;
- no modificar ranking;
- no modificar memoria;
- no modificar RAG factual salvo evidencia de normalización rota.

Si un LIVE demuestra dato técnico incorrecto:

- revisar RAG/evidence primero;
- no maquillar Writer.

Si un LIVE demuestra producto incorrecto:

- revisar reference/decision/recommendation;
- no arreglar con frase especial.

Si un LIVE demuestra reserva rota:

- revisar purchase signal / pending action / reservation;
- no reabrir SPIN.

---

## 15. Debugging por primera frontera rota

Siempre reconstruir:

```text
INPUT
↓
DETERMINISTIC INTENT
↓
PLANNER INTENT
↓
FINAL INTENT
↓
REFERENCE
↓
STATE
↓
SQL/RAG EVIDENCE
↓
VERIFIED FACTS
↓
COMMERCIAL MOVE
↓
EXECUTABLE N+1
↓
WRITER
↓
WRITER GUARD
↓
FINAL RESPONSE
↓
PERSISTED STATE
```

La primera capa que cambia un valor correcto a uno incorrecto es la frontera de fix.

No seguir downstream para culpar al Writer si la corrupción ocurrió antes.

---

## 16. QA y autoridad de comportamiento

### Verificación técnica

Antes de pedir LIVE:

```powershell
npm run build
```

Tests unitarios pueden demostrar contratos acotados, pero NO sustituyen comportamiento real.

### Autoridad final

```powershell
$env:CHAT_SESSION_ID="prueba-stech-real-$(Get-Date -Format 'HHmmss')"
npm run chat
```

Evaluar conversación completa:

- continuidad;
- producto correcto;
- grounded facts;
- N+1;
- SPIN oportunista;
- FAB seguro;
- precio/stock;
- compra/reserva;
- persistencia.

No declarar resuelto un defecto conversacional solo porque un unit test pase.

---

## 17. Regla de cambios futuros

Antes de editar código, dejar explícito:

```text
DEFECTO DEMOSTRADO:

PRIMERA FRONTERA ROTA:

CONTRATO QUE LA GOBIERNA:

ARCHIVO(S) AUTORIZADOS A CAMBIAR:

PARTES CONGELADAS:

CRITERIO DE ÉXITO LIVE:
```

Si no se puede completar esto, todavía no se entiende suficientemente la raíz.

---

## 18. Checklist rápido para cualquier agente/desarrollador

Antes de tocar backend:

- [ ] Leí `STECH_BACKEND_MASTER.md`.
- [ ] Leí el contrato específico de la frontera.
- [ ] Identifiqué primera frontera rota.
- [ ] Sé qué módulo tiene autoridad.
- [ ] Sé qué módulos NO debo tocar.
- [ ] No estoy parcheando una frase aislada.
- [ ] SQL/RAG continúan siendo autoridades factuales.
- [ ] N+1 sigue siendo exactamente una acción.
- [ ] Writer solo redacta.
- [ ] Reserva no se confirma antes de ejecución real.
- [ ] Build será verificado.
- [ ] LIVE será ejecutado externamente.

---

## 19. Resumen de autoridad

```text
IDENTIDAD / PRECIO / STOCK        → SQL ERP
SPEC TÉCNICA                      → Product RAG
POLÍTICAS                         → Institutional RAG
INTENT EXPLÍCITO                  → Deterministic Intent
INTERPRETACIÓN SEMÁNTICA          → Planner LLM + Validator
REFERENCIA DE PRODUCTO            → ReferenceResolver + DecisionValidator
ESTADO                            → StateReducer + ConversationRepository
RECOMENDACIÓN                     → CandidatePool + RecommendationPolicy
SIGUIENTE MOVIMIENTO              → N+1 / CAN_EXECUTE
FEATURE                           → VerifiedFact
ADVANTAGE / BENEFIT               → FAB seguro
REDACCIÓN                         → Writer
SALIDA SEGURA                     → WriterGuard
RESERVA                           → flujo determinístico autorizado
AUTOMATIZACIÓN                    → n8n secondary
VALIDACIÓN CONVERSACIONAL FINAL   → npm run chat LIVE
```

Este mapa debe usarse como punto de entrada antes de cualquier cambio futuro del backend STECH.

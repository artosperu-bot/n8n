# STECH Conversation Code Authority Map

> **AUDITORÍA ESTRUCTURAL COMPLETA — NO CAMBIO DE COMPORTAMIENTO.**  
> Rama auditada: `feat/stech-backend`.  
> Este documento identifica el runtime real, autoridades, duplicados, módulos legacy, causas raíz y orden de remediación antes de volver a modificar comportamiento conversacional.

## 1. Runtime real: qué código sí atiende `/api/chat`

La cadena real de producción/backend actual es:

```text
src/app.ts
  ↓ POST /api/chat
src/bootstrap.ts::buildRuntime()
  ↓
HybridConversationEngine   ← MOTOR REAL
  ├─ SupabaseConversationRepository
  ├─ SqlBridgeErpRepository o SqlServerErpRepository
  ├─ SupabaseRagRepository
  ├─ RecentHistoryLlmProvider
  │    └─ OpenAIProvider
  └─ N8nAutomationBus
```

`bootstrap.ts` instancia explícitamente `new HybridConversationEngine(...)`. Por lo tanto `ConversationEngine.ts` **NO es el motor del runtime actual**.

### Consecuencia crítica

Existe un segundo motor, `ConversationEngine.ts`, con su propia lógica de intención, rutas, recomendación, respuestas y persistencia. Aunque no atiende `/api/chat`, sigue importado por tests y por `scripts/build-check.ts`. Esto mantiene dos arquitecturas vivas y dos contratos de comportamiento distintos.

---

## 2. Flujo completo del motor real

```text
USER MESSAGE
  ↓
CommercialFacts.extractCommercialFacts
BudgetResolver.classifyBudgetTurn
  ↓
baseState
  ↓
IntentPlan.resolveIntentPlan
ReferenceResolver.resolveReference
InstitutionalTopicResolver.resolveInstitutionalTopic
  ↓
fallbackDecision()
NextBestAction.nextBestAction()              [candidato temprano]
  ↓
RecentHistoryLlmProvider
  ↓
OpenAIProvider.decide()                      [propuesta semántica]
  ↓
HybridConversationEngine arbitration
  deterministicOverride / references / budget / comparison
  ↓
DecisionValidator.validateTurnDecision
  intent + reference + selection + candidate NBA validation
  ↓
commercialState merge
  useCase / problem / priorities / objection / recommendation
  ↓
InterestLevel.updateInterestLevel
  ↓
SQL ERP and/or Product RAG / Institutional RAG
  ↓
route-specific branch
  ├─ PRICE/STOCK → deterministic ResponsePolicy
  └─ PRODUCT/COMPARE/RECOMMEND → writer path
  ↓
PostAnswerCommercialProgression
  candidate NBA after N exists
  ↓
CommercialWriteContract.prepareCommercialWriteInput
  ├─ EvidenceNormalizer
  ├─ GroundedDirectAnswer
  ├─ CommercialMove
  ├─ missing facts
  ├─ CommercialCapabilities
  └─ executable NBA
  ↓
OpenAIProvider.write
  ↓
WriterGuard.safeWrite
  ├─ presentation cleanup
  ├─ N preservation
  ├─ NBA execution helpers
  ├─ CommercialMove delivery check
  ├─ safety/factual guards
  ├─ deterministic fallback
  └─ recommendation continuity
  ↓
HybridConversationEngine final answer + state patch
  ↓
StateReducer.reduceState
  product/stage/recommendation continuity
  ↓
SupabaseConversationRepository.completeTurn
  ia_conversaciones + ia_contexto
  ↓
N8nAutomationBus publication
  ↓
QA evaluator/oracle (solo observación, no autoridad de producción)
```

---

## 3. Inventario completo del dominio conversacional

El árbol `src/conversation` actual contiene y fue clasificado así:

| Archivo | Estado | Responsabilidad real |
|---|---|---|
| `HybridConversationEngine.ts` | **KEEP / MOTOR REAL** | Orquestación completa del turno |
| `ConversationEngine.ts` | **DELETE-CANDIDATE / LEGACY** | Segundo motor paralelo no usado por runtime |
| `budget/BudgetResolver.ts` | **KEEP** | Presupuesto, rango y objeción de precio |
| `commercial/CommercialCapabilities.ts` | **KEEP / SIMPLIFY** | Gate `CAN_EXECUTE` |
| `commercial/CommercialFacts.ts` | **KEEP** | Contexto comercial determinístico |
| `commercial/CommercialImplications.ts` | **KEEP** | Implicaciones derivadas conservadoras |
| `commercial/CommercialWriteContract.ts` | **KEEP / SPLIT** | Actualmente mezcla preparación + selección + NBA final |
| `commercial/GroundedDirectAnswer.ts` | **FIX P0** | Construye N; hoy puede filtrar RAG crudo |
| `commercial/InterestLevel.ts` | **KEEP** | Intensidad/interés, no autoridad de compra |
| `commercial/ProductEvidencePolicy.ts` | **KEEP** | Selección de secciones RAG |
| `commercial/ResponsePolicy.ts` | **KEEP / MERGE ROLE** | Render determinístico y algunos +1 |
| `commercial/UseCaseNormalizer.ts` | **KEEP / CANONICAL** | Separa query-purpose de useCase real |
| `decision/DecisionValidator.ts` | **KEEP / NARROW NBA ROLE** | Autoridad de intent/reference/selection; no debería decidir progresión final |
| `evidence/EvidenceNormalizer.ts` | **FIX P0** | Hoy mezcla evidencia cruda con facts presentables |
| `history/RecentHistoryLlmProvider.ts` | **KEEP** | Últimos 4 mensajes al planner semántico |
| `institutional/InstitutionalTopicResolver.ts` | **KEEP** | Tema institucional determinístico |
| `intent/IntentPlan.ts` | **KEEP / CANONICAL** | Intención determinística real |
| `intent/IntentResolver.ts` | **DELETE-CANDIDATE / LEGACY** | Segundo resolver de intención redundante |
| `nba/NbaCompatibility.ts` | **MERGE INTO FINAL NBA** | Compatibilidad temprana; otra autoridad NBA |
| `nba/NextBestAction.ts` | **RENAME/MERGE** | Candidato pre-answer; comentarios todavía reflejan contrato viejo |
| `nba/PostAnswerCommercialProgression.ts` | **KEEP / CORE CANDIDATE** | Selección post-respuesta de progresión |
| `recommendation/RecommendationPolicy.ts` | **KEEP / REMOVE DUP FILTERS** | Ranking técnico por evidencia |
| `reference/ReferenceResolver.ts` | **KEEP / CANONICAL** | Resolución de producto/referencias |
| `router/RoutePlanner.ts` | **DELETE-CANDIDATE / LEGACY** | Solo pertenece al viejo `ConversationEngine` |
| `state/StateReducer.ts` | **KEEP / SAFETY ONLY** | Estado y continuidad; no política comercial general |
| `writer/WriterGuard.ts` | **KEEP / SPLIT** | Hoy es guard + compositor + fallback + continuidad |

---

## 4. Autoridades correctas que deben quedar después de limpiar

| Concepto | Autoridad única deseada |
|---|---|
| Intent determinístico | `IntentPlan` + arbitraje/validación de `DecisionValidator` |
| Interpretación semántica | `OpenAIProvider.decide` como **propuesta**, nunca autoridad factual |
| Producto/referencia | `ReferenceResolver` + `DecisionValidator` |
| Presupuesto | `BudgetResolver` |
| Use case / problema / prioridades | `CommercialFacts` + `UseCaseNormalizer` |
| Precio | SQL/ERP |
| Stock | SQL/ERP |
| Especificaciones producto | Product RAG |
| Política institucional | Institutional RAG |
| Recomendación | `RecommendationPolicy` sobre candidatos elegibles |
| N (respuesta directa) | `GroundedDirectAnswer` usando únicamente facts display-safe |
| Candidato +1 | `PostAnswerCommercialProgression` + semantic CommercialMove |
| Capacidad de ejecutar | `CommercialCapabilities` |
| **FINAL_EXECUTABLE_NBA** | **un resolver único nuevo/extraído** |
| Redacción | Writer: verbaliza, no decide |
| Seguridad de salida | WriterGuard: valida/sanitiza, no redefine estrategia |
| Estado final | StateReducer: continuidad/state safety |
| Persistencia | Supabase repository, representación solamente |
| QA | Observación; jamás autoridad de implementación |

---

## 5. Causas raíz probadas

### C1 — RAG crudo puede transformarse en `directAnswer` inmutable — **P0 / DEFINITE**

`GroundedDirectAnswer.buildGroundedDirectAnswer()` extrae bien algunos casos específicos (peso, RAM), pero si no encuentra una extracción segura termina usando el texto RAG completo mediante un fallback equivalente a `compact(raw)`.

Los documentos de Product RAG pueden contener campos internos como:

- Producto ID
- Código
- SKU
- Sección
- Grupo técnico
- Título
- Contenido

Luego `OpenAIProvider.write()` recibe la instrucción de preservar `RESPUESTA_DIRECTA` como inmutable. El sistema por tanto puede **proteger la fuga** en lugar de eliminarla.

**Primer boundary roto:**

```text
Product RAG raw row
→ GroundedDirectAnswer
→ directAnswer
→ Writer "immutable"
→ customer leak
```

**Solución raíz:** nunca convertir un bloque RAG crudo en N. El N debe construirse solo desde hechos atómicos display-safe.

---

### C2 — `EvidenceNormalizer` confunde evidencia interna con hecho presentable — **P0 / DEFINITE**

Para RAM crea facts atómicos útiles (`RAM_FISICA`, `RAM_VIRTUAL`). Para muchas otras secciones guarda el `row.text` completo como `VerifiedFact.value`.

Eso hace que:

```text
Evidence payload == Display fact
```

cuando deberían ser conceptos diferentes.

**Solución raíz:** separar:

```text
RawEvidence       = autoridad y trazabilidad interna
AtomicVerifiedFact = hecho estructurado verificable
DisplayFact       = valor permitido para N / +1 / writer
```

El writer y `CommercialMove` no deben recibir metadata RAG cruda como si fuera un dato de cliente.

---

### C3 — N+1 tiene demasiados escritores — **P1/P2 / DEFINITE**

Hoy la acción puede cambiar en:

1. `NextBestAction`
2. `DecisionValidator/NbaCompatibility`
3. `PostAnswerCommercialProgression`
4. `CommercialWriteContract`
5. `HybridConversationEngine` branches
6. `WriterGuard`
7. `StateReducer` bajo algunos bloqueos

Por eso históricamente se observó:

```text
candidateNba = RELATED_VALUE
→ ASK_MISSING_FACT
→ ANSWER_ONLY
```

o una acción persistida distinta a la intención post-answer.

**Solución raíz:**

```text
INITIAL_CANDIDATE
→ POST_ANSWER_CANDIDATE
→ CAPABILITY + SAFETY + PRIORITY
→ FINAL_EXECUTABLE_NBA
→ IMMUTABLE downstream
```

Solo un veto explícito de seguridad/continuidad puede invalidarlo y debe registrar `vetoReason`.

---

### C4 — `WriterGuard` es demasiadas cosas al mismo tiempo — **P2/P3 / DEFINITE**

Actualmente:

- ejecuta preguntas
- añade alternativas
- añade soft close
- preserva N
- preserva CommercialMove
- compone fallback
- evalúa facts
- bloquea claims
- maneja continuidad de recomendación
- en ciertos caminos altera acción efectiva

Eso no es solo un guard.

**Solución raíz:**

```text
ResponseComposer = compone N + FINAL +1
Writer            = naturaliza esa composición
WriterGuard        = valida/sanitiza únicamente
```

Si falla el LLM, fallback determinístico debe renderizar **el mismo N y el mismo +1**, no tomar una nueva decisión.

---

### C5 — Existen dos motores conversacionales completos — **P-ARCH / DEFINITE**

`bootstrap.ts` usa `HybridConversationEngine`. Sin embargo `ConversationEngine.ts` sigue en el árbol y tiene su propia implementación completa.

Además:

- `tests/integration/conversation-engine.test.ts` instancia directamente el motor viejo.
- `scripts/build-check.ts` importa expresamente `ConversationEngine.ts` aunque el runtime real usa Hybrid.

Esto crea contratos incompatibles. Un ejemplo directo: el test legacy exige para stock exactamente:

```text
"Sí, está disponible."
```

Eso contradice el contrato nuevo de N + un +1 ligero para un turno comercial factual normal.

**Solución raíz:** retirar el motor viejo una vez validado el grafo de imports y migrar/eliminar tests que solo certifiquen comportamiento legacy.

---

### C6 — Hay dos resolvers determinísticos de intención — **P-ARCH / DEFINITE**

Producción usa `IntentPlan.ts`. `IntentResolver.ts` es otra implementación simplificada.

`domain/types.ts` todavía importa el tipo `Intent` desde `IntentResolver.ts`, pero declara:

```ts
lastIntent?: Intent | string | null
```

`string` ya subsume `Intent`, por lo que esa dependencia no aporta seguridad de tipos y mantiene artificialmente vivo un módulo legacy.

**Solución raíz:** centralizar los tipos de intent en un único contrato y retirar `IntentResolver.ts` si el grafo de imports final confirma que solo quedan tests/typing legacy.

---

### C7 — `RoutePlanner.ts` pertenece a la arquitectura vieja — **P-ARCH / HIGH CONFIDENCE**

El Hybrid no lo usa: decide rutas internamente. `ConversationEngine.ts` sí lo utiliza.

Mantenerlo hace parecer que existe una autoridad de routing compartida cuando el runtime real no pasa por ahí.

**Solución raíz:** eliminarlo junto al viejo engine, o —solo si se decide explícitamente— migrar Hybrid a un único RoutePlanner. No mantener dos sistemas.

---

### C8 — Catálogo real se confunde con catálogo disponible — **P4 / DEFINITE**

`HybridConversationEngine.#rankCandidates()` llama primero:

```ts
erp.listCatalog({ onlyWithStock: true })
```

y luego nombra esos resultados `catalogCandidates`.

Después vuelve a filtrar `stock <= 0`.

Por tanto el trace `catalogCandidates` **no representa todos los productos que existen**. Esto explica por qué un cuarto producto real con stock 0 desaparece y parece que el sistema solo conoce 3.

**Solución raíz:**

```text
catalogCandidates   = todos los productos reales/activos
availableCandidates = stock > 0
eligibleCandidates  = available + presupuesto + exclusiones
rankedCandidates    = evidencia comparable
```

Cero stock excluye al ganador de compra inmediata, pero no borra la existencia del producto.

---

### C9 — Filtro de stock/presupuesto duplicado entre engine y RecommendationPolicy — **P4 / DUPLICATE**

Hybrid ya filtra presupuesto/stock antes de llamar `rankRecommendations`, y `RecommendationPolicy` vuelve a filtrar ambos.

No es el principal fallo funcional, pero mantiene dos autoridades de elegibilidad.

**Solución raíz:** una sola capa de elegibilidad; RecommendationPolicy debe rankear el set que recibe o ser la única capa de elegibilidad, no ambas.

---

### C10 — PRICE/STOCK y Product-RAG usan dos pipelines de respuesta distintos — **P1/P3 / STRUCTURAL**

PRICE/STOCK:

```text
prepareCommercialWriteInput
→ ResponsePolicy deterministic
```

Product/Compare/Recommend:

```text
prepareCommercialWriteInput
→ OpenAI writer
→ WriterGuard
```

Esto produce semánticas diferentes de N/+1 según la ruta.

**Solución raíz:** un contrato de composición único:

```text
DirectAnswer N
+ FinalContinuation +1
→ ResponseComposer
→ optional natural-language writer
→ guard
```

La autoridad del contenido debe ser igual aunque la superficie de redacción cambie.

---

### C11 — QA N+1 puede decir 25/25 sin medir el contrato real — **P6 / DEFINITE**

`qa/evaluators/commercial.ts` no incluye `RELATED_VALUE` en `PROGRESSION_NBAS` y `actionDelivered()` tampoco define adecuadamente su entrega.

Consecuencia: un turno LOW con `lastNba=RELATED_VALUE` puede no contabilizarse como N+1 requerido.

Además `scripts/qa-live.ts` considera `questionResolved` básicamente si existe una respuesta no vacía y no hubo HTTP error. Una respuesta irrelevante puede pasar esa dimensión.

**Solución raíz QA:** medir explícitamente:

- N responde la pregunta actual
- exactamente un +1 existe cuando corresponde
- +1 está relacionado
- +1 es ejecutable/grounded
- +1 no repite datos ni preguntas conocidas
- intensidad corresponde al contexto

QA sigue siendo monitor, no objetivo de implementación.

---

### C12 — QA no detecta bien fuga de metadata RAG — **P6 / DEFINITE**

El detector de lenguaje interno identifica palabras como RAG/oracle/confidence/score, pero no trata como fuga estructural:

`Producto ID`, `Código`, `SKU`, `Sección`, `Grupo técnico`, `Título`, `Contenido`.

Por eso una respuesta con fuga de RAG pudo quedar solo como “demasiado larga”.

---

### C13 — CORE mezcla venta real con una prueba de capacidad no soportada — **P6 / TEST STRUCTURE**

`CORE-SAFE-ACTIONABILITY` incluye:

- `¿Cuánto pesa el Armor 22?`
- `¿Pueden agendarme una prueba del equipo?`

La segunda prueba es válida, pero corresponde a:

```text
SAFETY / UNSUPPORTED_CAPABILITIES
```

No debe ocupar el CORE comercial principal. No eliminar cobertura: reclasificarla.

---

### C14 — Tests legacy pueden empujar el código contra el contrato actual — **P-ARCH/P6 / DEFINITE**

`npm test` ejecuta recursivamente **todos** los `.test.ts` bajo `tests/`.

Hay tests actuales y también tests históricos/versionados (`v03`, `v04`, regresiones por fecha) y un integration test del engine muerto. Algunos congelan respuestas antiguas.

Esto significa que “todos los tests PASS” no garantiza coherencia con la arquitectura actual.

**Solución raíz:** clasificar tests por contrato:

```text
CURRENT_CONTRACT
LEGACY_ENGINE
LEGACY_BEHAVIOR_SNAPSHOT
INTEGRATION_INFRA
QA_EVALUATOR
```

Eliminar/migrar los que solo certifican código retirado o comportamiento contradictorio.

---

### C15 — `build-check.ts` valida un módulo que producción no usa — **P-ARCH / DEFINITE**

Actualmente importa:

```ts
app.ts
bootstrap.ts
ConversationEngine.ts
```

Debe validar el runtime real, no mantener artificialmente compilable el engine legacy.

---

## 6. Componentes revisados que NO son causantes principales actuales

### BudgetResolver — KEEP

Parsea topes/rangos, diferencia presupuesto de objeción y genera `spinResidual`. No aparece como causa del leak/N+1.

### RecentHistoryLlmProvider — KEEP

Solo alimenta al planner con últimos mensajes persistidos. No altera salida del writer ni hechos.

### InstitutionalTopicResolver — KEEP

Clasifica temas institucionales. La ruta institucional en Supabase RAG incluso tiene una extracción más segura de contenido oficial/base que Product RAG.

### SqlBridgeErpRepository — KEEP

`searchProducts` consulta SQL y su fallback de typo usa catálogo completo con `onlyWithStock:false`. El problema de “solo 3” nace en el caller Hybrid que solicita `onlyWithStock:true` para ranking, no en SQL bridge.

### N8nAutomationBus — KEEP / SEPARATE FAILURE DOMAIN

Un HTTP 500 de n8n produce `delivered:false` cuando no está en strict mode. No debe reclasificarse como fallo semántico del bot.

### SupabaseConversationRepository — KEEP

Normaliza y persiste estado. No debe convertirse en autoridad comercial. La persistencia refleja el estado que recibe; no origina el N+1 defectuoso.

---

## 7. Matriz final KEEP / FIX / MERGE / DELETE-CANDIDATE

### KEEP como autoridad

- `HybridConversationEngine.ts`
- `BudgetResolver.ts`
- `CommercialFacts.ts`
- `CommercialImplications.ts`
- `UseCaseNormalizer.ts`
- `InterestLevel.ts`
- `ProductEvidencePolicy.ts`
- `DecisionValidator.ts` (quitándole autoridad NBA final)
- `ReferenceResolver.ts`
- `InstitutionalTopicResolver.ts`
- `RecommendationPolicy.ts` (una sola capa de ranking)
- `RecentHistoryLlmProvider.ts`
- `CommercialCapabilities.ts`
- `StateReducer.ts` (safety/state only)
- adapters SQL/RAG/Supabase/n8n

### FIX

- `GroundedDirectAnswer.ts` — P0
- `EvidenceNormalizer.ts` — P0
- `CommercialWriteContract.ts` — separar responsabilidades
- `ResponsePolicy.ts` — integrarlo con compositor único
- `WriterGuard.ts` — reducir a guard/sanitizer
- `HybridConversationEngine.ts` — catálogo completo + pipeline N/+1 único
- `domain/types.ts` — nuevos tipos de hechos/Final NBA + quitar coupling legacy
- QA commercial evaluator / runner / metadata leak checks

### MERGE / CONSOLIDATE

- `NextBestAction.ts`
- `PostAnswerCommercialProgression.ts`
- `NbaCompatibility.ts`
- parte NBA de `CommercialWriteContract.ts`

Objetivo: un pipeline con **un solo `FinalNbaResolver`**, no cuatro políticas independientes.

### DELETE-CANDIDATE después de verificar imports y migrar tests

- `ConversationEngine.ts`
- `intent/IntentResolver.ts`
- `router/RoutePlanner.ts`
- `tests/integration/conversation-engine.test.ts`
- tests exclusivamente ligados al resolver/router/engine legacy
- import legacy de `ConversationEngine.ts` en `scripts/build-check.ts`

**Importante:** “DELETE-CANDIDATE” no significa borrar a ciegas. Primero cambiar imports/tests, ejecutar build y tests determinísticos pertinentes, luego borrar.

---

## 8. Arquitectura objetivo mínima — sin otro rediseño gigante

```text
MESSAGE
  ↓
Intent + Reference + State
  ↓
Evidence retrieval
  ↓
EvidenceNormalizer
  ├─ RawEvidence             (internal only)
  └─ AtomicVerifiedFacts     (safe semantic facts)
  ↓
DirectAnswerBuilder
  → N
  ↓
PostAnswerProgression
  → candidate +1
  ↓
CommercialMoveBuilder
  → exact semantic +1 payload
  ↓
CommercialCapabilities
  ↓
FinalNbaResolver
  → FINAL_EXECUTABLE_NBA
  ↓
ResponseComposer
  → N + exactly one +1
  ↓
Writer (optional naturalization only)
  ↓
WriterGuard (safety only)
  ↓
StateReducer
  ↓
Persistence
```

No hace falta otro motor. Hace falta **reducir autoridades**.

---

## 9. Orden exacto de remediación de raíz

### P-ARCH0 — Retirar arquitectura muerta antes de seguir expandiendo

**Root:** dos motores + dos intent resolvers + router legacy + tests legacy.

**Acciones:**
1. confirmar grafo de imports final;
2. migrar cualquier test útil de `ConversationEngine` a Hybrid;
3. retirar `ConversationEngine.ts`;
4. retirar `RoutePlanner.ts` si queda sin consumidores;
5. retirar `IntentResolver.ts` y mover/eliminar su tipo legacy;
6. actualizar `build-check.ts` para runtime real.

**Preservar:** comportamiento de Hybrid; no usar esta limpieza para cambiar conversación.

### P0 — Separar RAG interno de facts display-safe

**Root:** raw RAG → VerifiedFact/directAnswer.

**Acciones:**
- prohibir `compact(raw)` como respuesta general;
- extraer facts atómicos por sección/labels;
- mantener raw evidence solo para grounding/trazabilidad;
- bloquear metadata interna de cara al cliente.

**Impacto esperado:** elimina fuga `Producto ID/SKU/Sección/...` y evita +1 basados en párrafos crudos.

### P1 — Hacer N explícito e inmutable de verdad

`N` se produce una vez desde SQL/RAG safe facts. Ningún fallo de +1 puede sustituirlo.

### P2 — Un único Final NBA Resolver

Consolidar NextBestAction + Compatibility + PostAnswer + capability-resolution en una secuencia clara.

`ANSWER_ONLY` solo como fallback realmente excepcional para turnos comerciales normales cuando no existe +1 seguro.

### P3 — Un único compositor N + 1

ResponseComposer recibe:

```text
DirectAnswer
FinalCommercialMove
```

y genera exactamente una continuación. Writer naturaliza; guard no decide.

### P4 — Corregir universo de recomendación

Obtener catálogo con `onlyWithStock:false`, luego derivar available/eligible/ranked. Centralizar filtros.

### P5 — Recién entonces mejorar FAB/SPIN/N+1 quality

Sin frases hardcodeadas por modelo/atributo. Usar facts + contexto + CommercialMove.

### P6 — Reparar QA para observar el contrato real

- `RELATED_VALUE` explícito
- `questionResolved` semántico, no “answer non-empty”
- detector de raw metadata
- Safety fuera de CORE
- retirar snapshots legacy contradictorios

---

## 10. Qué NO eliminar ni tocar por estos defectos

No son raíz del problema actual y deben preservarse durante la remediación:

- autoridad SQL de precio/stock
- Supabase atomic locks/persistence
- n8n como delivery secundario
- reserva determinística y regla “no confirmar hasta operación autorizada”
- explicit product selection/reference rules
- recommendation continuity guard
- stage non-regression
- RAM física vs RAM virtual
- useCase normalization
- unsupported capability guard

---

## 11. Diagnóstico final

Los malos resultados no vienen de que el prompt “no diga N+1 suficientemente fuerte”. El backend acumuló **dos arquitecturas y múltiples autoridades solapadas**.

Los tres causantes estructurales más importantes son:

```text
1. RAW PRODUCT RAG
   → VerifiedFact/directAnswer inseguro

2. NBA/N+1
   → demasiados escritores/overrides

3. RESPONSE
   → WriterGuard mezcla composición, decisión y seguridad
```

Y hay una causa organizacional que multiplica el problema:

```text
LEGACY ENGINE + LEGACY TESTS
→ contratos viejos siguen compilando/ejecutándose
→ arreglos nuevos pueden verse presionados por expectativas antiguas
```

### Regla de remediación

No volver a hacer patches por frase ni por modelo.  
No volver a modificar el prompt como solución principal.  
No hacer `PRICE => frase`, `RAM => frase`, etc.

La solución es reducir el sistema a **una autoridad por responsabilidad**.

---

## 12. Estado de auditoría

**CÓDIGO DE PRODUCCIÓN CONVERSACIONAL:** mapeado.  
**BOOTSTRAP/RUNTIME:** mapeado.  
**ERP SQL bridge / Product RAG / Supabase / n8n:** mapeados en sus fronteras relevantes.  
**QA CORE / commercial evaluator / hard evaluator / oracle / runner:** mapeados.  
**TEST DEUDA LEGACY:** identificada y clasificada estructuralmente.  
**CAMBIO DE COMPORTAMIENTO EN ESTA AUDITORÍA:** NO.  
**QA LIVE EJECUTADO POR ESTA AUDITORÍA:** NO.

El siguiente trabajo autorizado debe empezar por **P-ARCH0 + P0**, no por otro cambio de prompt/N+1 superficial.

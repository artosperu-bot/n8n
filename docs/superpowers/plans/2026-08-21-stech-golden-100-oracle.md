# STECH Golden 100 + Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el backend STECH en un vendedor híbrido con prompt mínimo, memoria reciente real, evidencia normalizada y un Golden 100 de 20 conversaciones × 5 turnos evaluado contra un Oracle independiente de SQL/RAG.

**Architecture:** GPT-5 mini entiende semántica, referentes, necesidad, objeción y N+1; el código deriva routing y herramientas; SQL/RAG son autoridad factual; un EvidenceNormalizer entrega hechos compactos al writer; el QA construye un OracleCard independiente antes de llamar al chatbot y compara respuesta + estado contra ese Oracle.

**Tech Stack:** Node.js 22, TypeScript strip-types, OpenAI Responses API, SQL Server vía ErpRepository, Supabase PostgreSQL/RAG, node:test, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-21-stech-golden-100-oracle-design.md`

## Global Constraints

- Modelo canónico: `OPENAI_MODEL=gpt-5-mini-2025-08-07`.
- No hardcodear productos, precios, stock ni respuestas para pasar QA.
- SQL manda sobre identidad comercial, precio, stock, catálogo, imágenes y pedido protegido.
- RAG producto manda sobre especificaciones del `producto_id` canónico.
- RAG institucional manda sobre políticas y debe resolver categoría/subcategoría antes de recuperar contenido.
- `ia_conversaciones` es verdad del turno; `ia_contexto` es memoria acumulada; persistencia atómica por turno.
- `producto consultado ≠ producto activo ≠ producto seleccionado`.
- Prompt contiene conducta conversacional; código/RAG/schema contienen routing, verdad, estado y seguridad.
- Respuesta normal: 1–3 frases, máximo una pregunta útil.
- Hard RED: producto/referente/precio/stock/spec/política incorrectos, fabricación, switch falso, respuesta nula, lock abandonado, compra que vuelve a discovery, acción falsa.

---

### Task 1: Prompt mínimo + historia reciente real

**Files:**
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/test/openai-provider.test.ts`
- Test: `backend/test/hybrid-conversation-engine.test.ts`

**Interfaces:**
- Consumes: `ConversationRepository.getMessages(sessionId)` y `ConversationState`.
- Produces: `LlmDecisionInput.history?: Array<{role:'user'|'assistant';content:string}>` y planner compacto que no decide routing SQL/RAG.

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(decisionRequest.input.includes('STORED PROCEDURE'), false);
assert.equal(decisionRequest.input.includes('HISTORIA_RECIENTE'), true);
assert.equal(decisionRequest.input.includes('respuesta anterior del vendedor'), true);
```

Añadir un test multi-turno donde el bot recomienda un producto y el siguiente mensaje `¿y ese cuánto está?` se resuelve usando la última respuesta del asistente.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

Expected: FAIL porque `LlmDecisionInput` no incluye historia y el engine no llama `getMessages()` para el planner.

- [ ] **Step 3: Add history to the LLM contract**

```ts
export type LlmDecisionInput = {
  message: string;
  state: ConversationState;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};
```

- [ ] **Step 4: Feed only the last 3 complete turns**

En `HybridConversationEngine.processTurn()`:

```ts
const history = (await this.#deps.conversations.getMessages(input.sessionId))
  .slice(-6)
  .map(({ role, content }) => ({ role, content }));

planner = await this.#deps.llm.decide?.({
  message: input.message,
  state: baseState,
  history,
});
```

Si `getMessages` falla, degradar a `history=[]` sin destruir el turno.

- [ ] **Step 5: Simplify planner prompt**

El system prompt debe limitarse a conducta semántica:

```text
Eres el analista conversacional de STECH.
Entiende qué quiere el cliente AHORA usando historia reciente y memoria.
No inventes hechos.
Mencionar otro producto no significa cambiar; preferir un atributo tampoco; una selección explícita sí.
No repitas preguntas ya resueltas.
Propón el siguiente paso comercial más útil; si quiere comprar, avanza.
Devuelve solo JSON del schema.
```

Eliminar del output del planner como autoridad efectiva: `needsSql`, `needsProductRag`, `needsInstitutionalRag`; mantenerlos temporalmente en el type si compatibilidad lo exige, pero `DecisionValidator/engine` debe ignorarlos para routing.

- [ ] **Step 6: Run focused + full tests**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ports/LlmProvider.ts backend/src/adapters/openai/OpenAIProvider.ts backend/src/conversation/HybridConversationEngine.ts backend/test
git commit -m "feat: give planner recent dialogue without overprompting"
```

---

### Task 2: EvidenceNormalizer + cobertura técnica real

**Files:**
- Create: `backend/src/conversation/evidence/EvidenceNormalizer.ts`
- Modify: `backend/src/conversation/commercial/ProductEvidencePolicy.ts`
- Modify: `backend/src/ports/LlmProvider.ts`
- Modify: `backend/src/adapters/openai/OpenAIProvider.ts`
- Modify: `backend/src/conversation/HybridConversationEngine.ts`
- Test: `backend/test/evidence-normalizer.test.ts`
- Test: `backend/test/product-evidence-policy.test.ts`

**Interfaces:**
- Produces:

```ts
export type VerifiedFact = {
  domain: 'SQL'|'PRODUCT_RAG'|'INSTITUTIONAL_RAG';
  key: string;
  value: string;
  productId?: string | null;
  source: string;
};

export function normalizeEvidence(input: {
  quote?: ProductQuote | null;
  rag?: RagEvidence[];
  allowPrice?: boolean;
  allowStock?: boolean;
}): VerifiedFact[];
```

- [ ] **Step 1: Write failing tests**

Cubrir:

```ts
assert.deepEqual(productEvidenceSections({primary:'ATTRIBUTE', attributes:['NFC']}, state), ['CONECTIVIDAD','FUNCIONES']);
assert.deepEqual(productEvidenceSections({primary:'ATTRIBUTE', attributes:['5G']}, state), ['REDES','CONECTIVIDAD']);
assert.deepEqual(productEvidenceSections({primary:'ATTRIBUTE', attributes:['TERMICA']}, state), ['TERMICA','CAMARA']);
```

Y verificar que el writer recibe hechos compactos, no 8 documentos de 700 caracteres.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

- [ ] **Step 3: Expand technical section mapping**

Agregar aliases normalizados para AUDIO, BATERIA, CAMARA, CONECTIVIDAD, FISICO, FUNCIONES, MEMORIA, PANTALLA, REDES, RENDIMIENTO, RESISTENCIA, SEGURIDAD, SENSORES, SIM, SISTEMA, TERMICA.

- [ ] **Step 4: Implement EvidenceNormalizer**

SQL facts solo cuando están autorizados por intent; RAG facts se compactan por `source/section`, eliminando duplicados y limitando cada hecho a una oración útil. El normalizador nunca inventa valores ausentes.

- [ ] **Step 5: Change writer input**

Extender `LlmWriteInput` con:

```ts
verifiedFacts?: VerifiedFact[];
```

El writer construye `EVIDENCIA_VERIFICADA` desde `verifiedFacts` y no desde documentos crudos; `rag` queda solo por compatibilidad temporal.

- [ ] **Step 6: Run tests**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/conversation/evidence backend/src/conversation/commercial/ProductEvidencePolicy.ts backend/src/ports/LlmProvider.ts backend/src/adapters/openai/OpenAIProvider.ts backend/src/conversation/HybridConversationEngine.ts backend/test
git commit -m "feat: normalize verified evidence before writing"
```

---

### Task 3: InstitutionalTopicResolver completo

**Files:**
- Create: `backend/src/conversation/institutional/InstitutionalTopicResolver.ts`
- Modify: `backend/src/adapters/supabase/SupabaseRagRepository.ts`
- Test: `backend/test/institutional-topic-resolver.test.ts`

**Interfaces:**
- Produces:

```ts
export type InstitutionalTopic = { category: string; subcategory?: string };
export function resolveInstitutionalTopic(query: string): InstitutionalTopic | null;
```

- [ ] **Step 1: Write failing table-driven tests**

Cubrir al menos: recojo, envío disponible/gratis/plazo, garantía general/evaluación, medios de pago, contraentrega, confirmación/cancelación, reserva, cambios/devolución/reembolso, dirección/horario, privacidad general/datos/derechos/cookies/contacto, términos precios/compra/información producto/general.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

- [ ] **Step 3: Extract resolver from adapter and expand categories**

`SupabaseRagRepository.searchInstitutional()` debe llamar al resolver central y filtrar primero por categoría/subcategoría; solo fallback por categoría si no hay fila exacta.

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/conversation/institutional backend/src/adapters/supabase/SupabaseRagRepository.ts backend/test
git commit -m "feat: route institutional policy by canonical topic"
```

---

### Task 4: OracleResolver independiente

**Files:**
- Create: `backend/qa/oracle/types.ts`
- Create: `backend/qa/oracle/OracleResolver.ts`
- Create: `backend/qa/oracle/OracleEvidence.ts`
- Test: `backend/test/oracle-resolver.test.ts`

**Interfaces:**

```ts
export type OracleCard = {
  intentClass: string;
  authoritativeDomain: 'SQL'|'PRODUCT_RAG'|'INSTITUTIONAL_RAG'|'MEMORY'|'HANDOFF';
  expectedProductId: string | null;
  expectedProductName: string | null;
  allowedFacts: string[];
  forbiddenFacts: string[];
  expectedReferenceBehavior: string | null;
  expectedStateDelta: Record<string, unknown>;
  expectedNbaClass: string | null;
  requiresHandoff: boolean;
  sourceRefs: string[];
};
```

`OracleResolver` recibe el mensaje + oracleSpec + memoria esperada y consulta los mismos adapters autoritativos, pero **nunca** llama al endpoint del chatbot ni usa su output.

- [ ] **Step 1: Write failing tests**

Casos: precio X13 → SQL; NFC X13 → PRODUCT_RAG; envío Lima → INSTITUTIONAL_RAG; `ese` después de selección → MEMORY; compra explícita → HANDOFF.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

- [ ] **Step 3: Implement OracleResolver**

Resolver producto por ERP; specs por `productRagId`; políticas por topic canónico; crear allowed/forbidden facts sin redactar respuesta final.

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/qa/oracle backend/test/oracle-resolver.test.ts
git commit -m "feat: add independent SQL RAG oracle for QA"
```

---

### Task 5: Golden 100 — 20 journeys × 5 turns

**Files:**
- Create: `backend/qa/scenarios/golden100.ts`
- Modify: `backend/qa/types.ts`
- Test: `backend/test/golden100-scenarios.test.ts`

**Interfaces:**

```ts
type OracleSpec = {
  domain?: 'SQL'|'PRODUCT_RAG'|'INSTITUTIONAL_RAG'|'MEMORY'|'HANDOFF';
  product?: string;
  sections?: string[];
  institutionalTopic?: { category:string; subcategory?:string };
  expectedState?: Record<string, unknown>;
  expectedNba?: string;
};
```

- [ ] **Step 1: Write failing structural test**

```ts
assert.equal(golden100Scenarios.length, 20);
assert.equal(golden100Scenarios.flatMap(x => x.turns).length, 100);
assert.ok(golden100Scenarios.every(x => x.turns.length === 5));
```

También verificar cobertura mínima por familias y presencia de lenguaje real corto/typos.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

- [ ] **Step 3: Add 20 fixed journeys**

Distribuir exactamente 100 turnos entre: necesidad/recomendación/presupuesto, specs/uso, comparación/referentes, precio/stock/imágenes, institucional, objeciones/alternativas, compra/handoff/empresa, unknown/seguridad.

No fijar respuestas textuales; fijar semántica/oracleSpec.

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/qa/scenarios/golden100.ts backend/qa/types.ts backend/test/golden100-scenarios.test.ts
git commit -m "test: add STECH Golden 100 customer journeys"
```

---

### Task 6: QA runner Oracle + métricas por dimensión

**Files:**
- Modify: `backend/scripts/qa-live.ts`
- Create: `backend/qa/evaluators/oracle.ts`
- Modify: `backend/qa/report/render.ts`
- Modify: `backend/qa/types.ts`
- Modify: `backend/package.json`
- Test: `backend/test/qa-oracle-runner.test.ts`

**Interfaces:**
- Nueva suite: `golden100`.
- Nuevo script: `npm run qa:golden100`.

- [ ] **Step 1: Write failing tests**

Verificar que el runner:

1. construye OracleCard antes del POST a `/api/chat`;
2. no usa respuesta del chatbot para construir Oracle;
3. agrega métricas `productIdentity`, `referenceAccuracy`, `factualAccuracy`, `noFabrication`, `memoryConsistency`, `questionResolved`, `nbaQuality`, `purchaseProgression`, `persistence`;
4. agrupa fallos por `SEMANTIC|REFERENCE|STATE|SQL|PRODUCT_RAG|INSTITUTIONAL_RAG|WRITER|NBA|PERSISTENCE|HANDOFF`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && npm test`

- [ ] **Step 3: Implement oracle evaluator**

Comparar producto/estado/facts y hard gates de forma determinística. Calidad comercial puede seguir usando el evaluador actual como YELLOW, pero nunca sobreescribir un Hard RED.

- [ ] **Step 4: Add golden100 suite and report**

`package.json`:

```json
"qa:golden100": "node --env-file-if-exists=.env --experimental-strip-types scripts/qa-live.ts --suite=golden100"
```

Reporte debe imprimir 100 turnos y métricas por dimensión además de GREEN/YELLOW/RED.

- [ ] **Step 5: Run tests + build**

Run:

```bash
cd backend
npm test
npm run build
```

Expected: all PASS and `BUILD CHECK PASS`.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/qa-live.ts backend/qa/evaluators/oracle.ts backend/qa/report/render.ts backend/qa/types.ts backend/package.json backend/test/qa-oracle-runner.test.ts
git commit -m "feat: evaluate Golden 100 against independent oracle"
```

---

### Task 7: Final verification and live execution gate

**Files:**
- Verify only; no production workflow changes.

**Interfaces:**
- Consumes completed tasks 1–6.
- Produces a reproducible live QA command and evidence.

- [ ] **Step 1: Run complete test suite**

```bash
cd backend
npm test
```

Expected: zero failures.

- [ ] **Step 2: Run build check**

```bash
npm run build
```

Expected: `BUILD CHECK PASS`.

- [ ] **Step 3: Verify repository secret scan and Backend QA on the same head**

Expected: both SUCCESS.

- [ ] **Step 4: User pulls and runs live Golden 100**

```powershell
cd C:\Users\stech\OneDrive\Desktop\n8n
git pull origin feat/stech-backend
cd backend
npm install
npm test
npm run build
npm start
```

En otra PowerShell:

```powershell
cd C:\Users\stech\OneDrive\Desktop\n8n\backend
npm run qa:golden100
```

- [ ] **Step 5: Audit run in Supabase**

Comprobar 100/100 persistidos, `ia_conversaciones ↔ ia_contexto`, sin PROCESSING abandonados, producto/referente/estado correctos, y clasificar los fallos por causa raíz antes de cualquier siguiente cambio.

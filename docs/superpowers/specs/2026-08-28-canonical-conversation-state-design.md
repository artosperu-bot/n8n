# Canonical Conversation State — Design

Date: 2026-08-28
Status: APPROVED FOR IMPLEMENTATION
Base branch: `feat/crm-automation-engine`
Implementation branch: `refactor/canonical-conversation-state`

## Problem

The runtime already has a useful canonical model (`ConversationState`), but `ia_contexto.contexto` currently persists several representations of the same facts at once. Examples observed in live Supabase include `activeProduct` + `producto_activo`, `queryTarget` + `producto_objetivo_turno`, `recommendedProduct` + `producto_recomendado`, `problem` + `problema_activo`, `purchaseSignal` + `senal_compra`, `contextVersion` + `context_version`, and several pending-action representations.

This creates multiple apparent authorities for one semantic fact. Different consumers can read different aliases and produce state drift even when the underlying conversational logic is correct.

## Goal

Make `ConversationState` the single canonical accumulated-memory contract for the backend while preserving compatibility with existing rows and existing CRM/reporting consumers.

The target rule is:

`runtime decision -> StateReducer -> ConversationState -> PersistenceProjection -> table-specific projections`

No persistence adapter, LLM, RAG result, CRM view, or legacy alias may become an independent state authority.

## Authority boundaries

### SQL / ERP

Authoritative for dynamic commercial and operational truth: canonical catalog identity, price, stock, availability, product lookup and order operations.

### RAG

Authoritative evidence source for non-dynamic product specifications and controlled institutional policy content. RAG never replaces SQL for dynamic price/stock.

### LLM

Interprets language and proposes conversational/commercial behavior. It does not create product IDs, price, stock, guaranteed availability, persisted system codes, or final state truth.

### StateReducer

The only component that consolidates previous accumulated state plus the current turn patch into the next `ConversationState`.

### ConversationState

The only canonical in-memory accumulated conversation state.

### ia_conversaciones

Immutable truth of one completed turn: customer message, assistant answer, current intent/route, current product target/resolution, evidence/tool usage, SPIN deltas, final N+1 and a turn snapshot.

It is not the accumulated-memory source for the next turn.

### ia_contexto

Accumulated confirmed memory for the session. Its `contexto` JSON stores the canonical `ConversationState` representation only. Physical columns remain derived projections for CRM/query/reporting compatibility and indexing.

### ia_sesiones

Session lifecycle and attention-mode authority only (BOT/HUMANO/ESPERANDO_ASESOR/CERRADO and handoff lifecycle metadata). It is not product or commercial-reasoning memory.

## Canonical persistence contract

### New writes

`ia_contexto.contexto` must contain only canonical `ConversationState` fields.

It must not persist compatibility aliases such as:

- `producto_activo`
- `producto_objetivo_turno`
- `producto_recomendado`
- `cliente`
- `venta`
- `conversacion`
- `debug_trace`
- `actividad_activa`
- `problema_activo`
- `senal_compra`
- `context_version`
- derived `customer`, `commercial`, `pendingQuestion` or `pendingAction` views when those duplicate canonical state.

Those values may continue to exist as physical table projections where the database/CRM contract requires them.

### Legacy reads

Existing rows that already contain legacy aliases remain readable. Hydration maps legacy aliases into canonical fields only when the canonical field is absent.

Priority is always:

`canonical field > legacy fallback`

A legacy value can never overwrite a canonical value that is already present.

### Serializer/hydrator

A dedicated codec owns this boundary:

- `hydrateConversationState(value)` — accepts canonical or historical legacy JSON and returns canonical `ConversationState`.
- `serializeConversationState(state)` — emits only approved canonical fields.

The serializer is allow-list based so arbitrary adapter/projection keys cannot leak into persisted memory.

## Pending-action contract

Runtime state uses canonical control codes (`lastNba`, `pendingCommercialAction`, `pendingMissingFact`). Persistence may derive typed turn-level objects for observability, but those objects are projections, not additional state authorities.

Rules:

- `ANSWER_ONLY` creates no pending action.
- `ASK_MISSING_FACT` creates at most one typed pending discovery question when a genuine missing fact exists.
- Executable commercial actions may create one typed pending action.
- A later affirmative such as `sí` must consume the semantic pending action, not be interpreted as arbitrary purchase intent.
- Current explicit user intent still outranks stale pending state.

## Product identity contract

These fields remain distinct:

- `activeProduct`
- `queryTarget`
- `salientProduct`
- `recommendedProduct`
- `selectedProduct`
- `comparisonProducts`

Mentioning or asking about a second product does not imply an active-product switch. Only an explicit switch or a validated recommendation transition may change active focus according to the existing reducer contract.

## CRM compatibility

Database storage will stop duplicating legacy nested aliases. If a CRM/API consumer still requires the old shape, compatibility must be reconstructed at the API/read boundary from canonical state and physical columns. Compatibility is a presentation concern, not a second persistence model.

No frontend consumer is allowed to write legacy aliases back as authoritative state.

## Atomicity and P0 protection

The existing concurrency/atomic persistence sequence remains unchanged:

`ia_adquirir_turno -> ia_persistir_turno_atomico -> ia_liberar_turno`

This refactor must not alter P0 lease/fencing semantics or introduce split persistence.

`ia_conversaciones` and `ia_contexto` must still represent the same committed turn.

## Failure behavior

- Invalid or unknown legacy shapes hydrate conservatively.
- Unsupported fields are ignored by the canonical serializer.
- A failed turn must still invoke the existing failure cleanup.
- Dynamic SQL truth is never recovered from stale conversational memory.
- UNKNOWN capability truth remains UNKNOWN.

## Migration strategy

1. Add codec and tests without changing Supabase schema.
2. Make atomic and legacy state writes use the same canonical serializer.
3. Stop merging derived/legacy projections into `ia_contexto.contexto`.
4. Preserve physical context columns as derived projections.
5. Preserve legacy read compatibility.
6. Add CRM edge compatibility only if existing tests/consumer contract require it.
7. Run focused persistence/state tests, salesperson regressions, build and full suite.
8. Do not mutate production Supabase data in this change.

Historical rows may be normalized later in a separate, measured migration after application compatibility is proven.

## Acceptance criteria

1. New `contexto` writes contain canonical keys only.
2. Legacy rows hydrate correctly.
3. Canonical values win when canonical and legacy values conflict.
4. `saveState` and `completeTurn` serialize the same state shape.
5. Physical `ia_contexto` columns still mirror the canonical state needed by CRM/reporting.
6. `ia_conversaciones` remains turn truth and retains typed turn-level pending/observability data.
7. No P0/atomic persistence regression.
8. Existing PRODUCT_INFO/factual-answer/commercial-progression behavior is not broadened or changed by this refactor.
9. Focused tests and build pass; any full-suite failures are compared against the base branch before classification.

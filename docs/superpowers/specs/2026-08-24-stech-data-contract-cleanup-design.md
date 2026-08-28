# STECH Canonical Persistence Contract — Design

## Goal

Simplify the chatbot persistence model so every stored field has one meaning, one authority and one concrete use. `ia_conversaciones` stores the event/delta of one turn; `ia_contexto` stores the current canonical memory; `ia_sesiones` stores only operational session state. Fields with no real use are removed from the contract and later dropped only after all dependencies are removed.

## Core rules

1. `ia_conversaciones` = what happened THIS TURN.
2. `ia_contexto.contexto` = what STECH knows NOW for the next turn.
3. `ia_sesiones` = operational session / human takeover state only.
4. Catalog is authority for product identity, brand and category.
5. SQL is authority for price, stock and current availability.
6. RAG is authority for product specifications and institutional policies.
7. Customer message is the only authority for customer facts: use, problem, implication, priority, budget, quantity.
8. Commercial Engine is authority for stage, interest score, objection state, N+1 and purchase state.
9. LLM may word the answer; it does not become authority for product, price, stock or customer facts.
10. `purchaseSignal=true` requires explicit purchase evidence or confirmation of a typed purchase pending action. It is never derived from interest score or stage.

## Catalog normalization

For the current rugged phone catalog:

- C001 = `Celulares y Teléfonos`
- S001 = `Celulares Smartphones`
- P000047 = Armor X12 Pro / ULEFONE
- P000048 = Armor X13 / ULEFONE
- P000049 = Armor 22 / ULEFONE
- P000050 = Armor 25T Pro / ULEFONE

When `producto_id_resuelto` is confirmed, `categoria`, `marca_detectada` and display product data are derived from `catalogo_productos` + `catalogo_categorias`, never guessed by the LLM.

## ia_conversaciones — canonical fields

### KEEP — identity / message
- `id`
- `session_id`
- `cliente_id`
- `message_id`
- `request_id`
- `fecha`
- `mensaje_cliente`
- `respuesta_bot`

### KEEP — turn interpretation / routing
- `intencion`
- `categoria` — DERIVED from catalog when product is confirmed; for current phones: `Celulares y Teléfonos`
- `ruta`
- `producto_detectado`
- `marca_detectada` — DERIVED from catalog
- `presupuesto_detectado` — EVENT_ONLY; only if newly stated in this turn
- `requiere_sql`
- `requiere_rag`
- `sql_tool_sugerido`
- `sql_tool_disponible`
- `atributo_detectado`
- `requiere_aclaracion`

### KEEP — product resolution audit
- `producto_id_resuelto`
- `producto_codigo_resuelto`
- `estado_resolucion_producto`
- `origen_resolucion_producto`
- `confianza_producto`
- `cambio_producto_explicito`
- `producto_objetivo_turno`
- `productos_candidatos`

### KEEP — commercial turn audit
- `etapa_comercial`
- `nivel_interes` — explainable score, not probability
- `objecion_principal`
- `objecion_detectada`
- `estrategia_recomendada`
- `siguiente_accion` — N+1 selected for this turn
- `derivar_humano`
- `tipo_conversacion`

### KEEP — customer-fact turn delta
- `spin_aporte`
- `spin_fase_actual` — audit only; never drives the sales state machine
- `actividad_detectada`
- `problemas_detectados`
- `implicaciones_detectadas`
- `prioridades_detectadas`

These four detected fields store only facts added in THIS turn. Problem never fabricates implication. A factual attribute question never fabricates a priority.

### KEEP — continuity / audit
- `pregunta_pendiente_turno`
- `accion_pendiente_turno`
- `contexto_comercial_snapshot`

### KEEP — telemetry
- `modelo`
- `tokens_entrada`
- `tokens_salida`
- `tokens_totales`
- `total_prompts`
- `metricas_tokens_detalle`
- `error_detectado`

`metricas_tokens_detalle` remains because the current insert trigger expands it into `ia_metricas_tokens`.

### REMOVE FROM CONTRACT, THEN DROP AFTER DEPENDENCY CLEANUP
- `objetivo` — duplicates `siguiente_accion` in current backend
- `confianza` — ambiguous generic confidence; keep only `confianza_producto`
- `costo_prompt_estimado` — not authoritative
- `costo_estimado_usd` — not authoritative; CRM currently references it and must be changed first
- `intent_score` — no stable contract/source
- `estado_emocional` — no reliable definition/authority
- `probabilidad_compra` — pseudo-probability; current RPC fabricates values from stage
- `perfil_cliente` — no stable definition; customer facts live in canonical context
- `urgencia` — no stable definition; real urgency remains an event/fact if explicitly expressed
- `limitacion_agente` — duplicates explicit clarification/handoff/error mechanisms
- `alcance_consulta` — currently duplicates `ruta`; remove after confirming no external consumer

## ia_contexto — canonical current memory

### KEEP — operational identity
- `session_id`
- `cliente_id`
- `canal`
- `created_at`
- `updated_at`
- `updated_by`
- `contrato_version`
- `context_version`
- `ultimo_message_id`
- `ultimo_request_id`
- `ultimo_conversacion_id`
- `ultimo_turno_fecha`

### KEEP — last-turn projections
- `ultima_intencion`
- `ultima_accion`
- `ultima_ruta`
- `ultimo_mensaje_cliente`
- `ultima_respuesta_bot`

### KEEP — product / routing projections
- `producto_activo_id`
- `producto_activo_confianza`
- `producto_activo_origen`
- `productos_candidatos`
- `atributo_activo`
- `requiere_aclaracion`

### KEEP — customer-state projections
- `actividad_activa`
- `problema_activo`
- `presupuesto_activo`
- `cantidad_activa`
- `objecion_activa`

### KEEP — commercial / handoff projections
- `etapa_conversacion`
- `senal_compra`
- `accion_pendiente`
- `derivacion_activa`
- `bloquear_respuesta_automatica`
- `motivo_derivacion`
- `memoria_resumen` — keep because CRM currently reads it

### KEEP — canonical authority
- `contexto` JSONB

Canonical JSON shape:

```json
{
  "product": {
    "activeProduct": null,
    "productId": null,
    "productCode": null,
    "brand": null,
    "category": null,
    "subcategory": null,
    "selectedProduct": null,
    "recommendedProduct": null,
    "comparisonProducts": []
  },
  "customer": {
    "sector": null,
    "useCase": null,
    "problem": null,
    "implications": [],
    "priorities": [],
    "explicitPriorities": [],
    "budget": null,
    "quantity": null,
    "invoiceRequired": null
  },
  "commercial": {
    "readiness": "EXPLORING",
    "stage": null,
    "strategy": null,
    "interestLevel": 0,
    "interestEvents": [],
    "objection": null,
    "purchaseSignal": false
  },
  "pendingQuestion": null,
  "pendingAction": null,
  "reservation": {},
  "handoff": {},
  "lastIntent": null,
  "lastRoute": null,
  "lastNba": null
}
```

### REMOVE FROM CONTRACT, THEN DROP AFTER DEPENDENCY CLEANUP
- `ultimo_tipo_mensaje`
- `ultimo_oficio_detectado`
- `ultimo_sector_detectado`
- `necesita_clasificacion_ia`
- `version` — `context_version` is the canonical context concurrency/version field
- `alcance_consulta` — redundant with last route in current backend; remove after dependency check

## ia_sesiones — operational only

### KEEP
- `id`
- `cliente_id`
- `session_id`
- `canal`
- `estado`
- `etapa_comercial`
- `fecha_inicio`
- `fecha_fin`
- `resumen`
- `version` — used for CRM optimistic concurrency / mode changes
- `modo_atencion`
- `asesor_id`
- `motivo_derivacion`
- `solicitud_asesor_at`
- `tomada_at`
- `devuelta_bot_at`
- `cerrada_at`
- `modo_actualizado_at`

### REMOVE FROM CONTRACT, THEN DROP
- `probabilidad_compra`

The current atomic RPC fabricates `probabilidad_compra` from stage (`CIERRE=85`, `EVALUACION=55`, etc.). This is explicitly forbidden in the new contract.

## CRM replacement contract

Before dropping `probabilidad_compra` or `costo_estimado_usd`, update `crm_api`:

- replace session `probabilidad_compra` with `nivel_interes` read from `ia_contexto.contexto.commercial.interestLevel`
- expose `senal_compra` separately as boolean
- replace dashboard `buying_signals = probabilidad_compra >= 60` with two real metrics:
  - `purchase_signals`: sessions with `senal_compra=true`
  - `high_interest`: sessions whose canonical `interestLevel` crosses the configured interest threshold
- remove `cost_usd` from `ia_conversaciones.costo_estimado_usd`; token usage is authoritative in `ia_metricas_tokens`. Cost calculation can be added later only with an explicit model-price table/version.

## Commercial readiness

Persist under `ia_contexto.contexto.commercial.readiness`:

- `EXPLORING`
- `DISCOVERY_NEEDED`
- `FIT_READY`
- `OFFER_READY`
- `EVALUATING_PURCHASE`
- `CLOSE_READY`
- `PURCHASE`

SPIN remains diagnostic/discovery support. It does not block progression when sufficient customer evidence already exists.

## Typed pending contracts

`pendingQuestion` and `pendingAction` are context authority for short replies.

Example:

```json
{
  "type": "CONFIRM_PRICE_AVAILABILITY",
  "productId": "P-ARMOR-22-256G",
  "status": "PENDING",
  "createdMessageId": "..."
}
```

A later `sí` confirms this action but does not mean purchase.

Only a pending action such as `CONFIRM_PURCHASE`, or an explicit strong purchase utterance, may produce `purchaseSignal=true`.

## Migration safety

No column is physically dropped until:

1. backend stops writing it;
2. atomic RPC stops reading/writing it;
3. CRM/API/views/functions stop referencing it;
4. focused persistence tests pass;
5. build passes;
6. live test session proves `ia_conversaciones` and `ia_contexto` agree.

Production SQL/RAG truth and catalog values are not changed by this cleanup.

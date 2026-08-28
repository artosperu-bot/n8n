# STECH A20 — ROOT FIX BATCH 2026-08-23

## Scope

Source of truth for this batch: `STECH_QA_ACCEPTANCE_20_BACKEND_SUPABASE.md` plus LIVE run `qa-20260823-190122-e189`.

The purpose of this batch is to correct first broken boundaries demonstrated by LIVE evidence. It does not certify the 20 conversations; certification requires a new user-run LIVE execution.

## Changes applied

1. **Budget authority**
   - Parse amounts followed by punctuation (`S/900,`).
   - Accept postfixed caps (`S/1000 como máximo`).
   - A message that contains both explicit budget and a recommendation request keeps price/budget as decision context and can become `RECOMMEND_WITHIN_BUDGET`.

2. **Comparison authority**
   - Direct model choice (`modelo A o modelo B`) is comparative intent.
   - Explicit comparative price/value questions take `COMPARE` authority over a plain price lookup.
   - Existing explicit `compara`, `vs`, `diferencia` language remains supported.

3. **Reference resolution**
   - `el mío` / `el que estábamos viendo` resolves to `activeProduct`.
   - Pronoun purchase language such as `quiero comprarlo` is a selection referent and can persist `selectedProduct`.
   - Explicit topic switch language such as `mejor hablemos del ...` changes active focus.
   - Attribute preference remains distinct from product switching.

4. **Product state**
   - A recommendation winner may become active when no prior active product exists.
   - A recommendation/objection does not silently replace an already-active product without explicit switch.
   - A topic switch changes active focus without being retained as a purchase selection unless the turn is actually PURCHASE.

5. **Requirement follow-ups**
   - `¿este cumple?` / equivalent follow-up can be treated as an attribute question.
   - When the current turn omits the attribute name, product evidence can inherit the known current attribute/priorities (e.g. NFC) rather than dropping to generic `OTHER`.
   - `¿cuál sí tiene ...?` is treated as recommendation language rather than a factual repetition on the prior product.

6. **Price + availability**
   - When SQL already provides current stock together with current price, the price response surfaces availability as the single related verified continuation instead of promising to check information that is already known.

## Explicitly not changed

- SQL price/stock authority.
- Product RAG source authority.
- Institutional RAG authority.
- Reservation grouped-data contract.
- Reservation execution semantics.
- n8n webhook configuration.
- Supabase schema/RPCs.
- Production publication/deployment.

## Required verification

Run externally by the user:

```powershell
npm run qa:acceptance20
```

Then compare the new run against:

- backend response/debug state;
- `ia_conversaciones`;
- `ia_contexto` / persisted session state;
- `STECH_QA_ACCEPTANCE_20_BACKEND_SUPABASE.md`.

A scenario is not considered fixed solely because its final text looks better. The backend state and persistence must agree with the acceptance contract.

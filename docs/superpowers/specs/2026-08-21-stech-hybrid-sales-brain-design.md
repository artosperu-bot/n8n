# STECH Hybrid Sales Brain Design

## Objective
Build one general conversation pipeline where GPT-5 mini is the semantic/commercial brain, while SQL/RAG and deterministic guards remain the authority for facts and side effects.

## Core Rule
The model may decide meaning, references, commercial stage, SPIN contribution, objection handling and N+1. The model may NOT invent or override factual truth from SQL/RAG, expose raw stock counts, fabricate actions, or silently switch products without a defensible conversational referent.

## Turn Pipeline
1. Load canonical session state from Supabase.
2. Fast-path only truly unambiguous factual commands whose target is already resolved (direct PRICE/STOCK/IMAGES).
3. Otherwise call GPT-5 mini once for a structured `TurnDecision`.
4. Validate/normalize the decision against current state and catalog identities.
5. Execute the requested factual tools: SQL catalog/price/stock/images/order and/or product/institutional RAG.
6. If a requested product does not exist, query available catalog alternatives and let the commercial brain choose a relevant fallback using known need/budget/priorities.
7. Build the N+1 from the model decision plus verified tool results. N+1 is dynamic, not a fixed intent table.
8. For deterministic outputs (price, stock availability, image links) return a guarded response directly. For consultative/comparison/objection/recommendation/policy explanation, call GPT-5 mini with compact verified evidence and the validated decision.
9. Run hard guards over the final response.
10. Persist the full canonical state and projections to Supabase; emit handoff only when requested/required.

## TurnDecision
`TurnDecision` is structured JSON produced by GPT-5 mini:

- primaryIntent
- secondaryIntents[]
- targetProduct
- mentionedProducts[]
- referenceType
- explicitSwitch
- selectedProduct
- comparisonProducts[]
- attributes[]
- customerNeed
- customerProblem
- priorities[]
- objection
- commercialStage
- spinContribution
- nextBestAction
- needsSql
- needsProductRag
- needsInstitutionalRag
- confidence

The model sees only the current message plus a compact canonical state. It does not receive secrets.

## Deterministic Hard Guards
- SQL owns price, stock, product identity, images, catalog and order truth.
- Product RAG owns technical specifications.
- Institutional RAG owns policies/warranty/shipping/payment truth.
- Never reveal raw stock quantity; customer sees availability or validation-needed for requested volume.
- Never provide price unless requested or required by an explicit quote flow.
- Images response is only verified URLs.
- Never claim reservation/order/quote/handoff side effects unless actually emitted/executed.
- A stale recommendation cannot override a later explicit selection.
- Product mention != product switch.

## Dynamic N+1
N+1 uses the whole commercial state, not only current intent. Examples:
- Unknown/unavailable requested model -> search real alternatives; propose the best relevant one(s), not a dead end.
- Price + strong purchase signal -> advance purchase/handoff, not generic stock upsell.
- Price while comparing -> help decision, not forced close.
- Stock available + purchase signal -> advance purchase.
- Budget + known need -> recommend without repeating discovery.
- Price objection -> resolve value or offer verified alternative.
- `Ya entendí` -> no unnecessary question.
- `Quiero comprarlo` -> preserve correct referent and advance purchase.

## Product References
Maintain separate state for activeProduct, queryTarget, salientProduct, selectedProduct, recommendedProduct and comparisonProducts. Selection priority for `ese/me quedo con ese`: recent explicit selection > recent salient referent > current recommendation > active product. `el otro` is resolved relative to the current comparison pair and recent salient product.

## RAG
Product RAG is always filtered by resolved product id and relevant sections. Comparison retrieves symmetric sections for both products. Institutional RAG routes by policy topic before retrieval to prevent cross-topic answers such as shipping -> refunds.

## Model Usage / Cost
Do not create a swarm of agents. Use GPT-5 mini as:
- semantic planner on ambiguous/consultative turns;
- commercial writer only when natural generation adds value.
Direct deterministic factual answers avoid the second LLM call.
Prompts use compact state/evidence, not full raw history.

## Persistence
`ia_contexto.contexto` remains canonical state. Existing scalar columns are projections for audit/search. Every turn persists route, product resolution, commercial stage, N+1, SPIN contribution, handoff state and trace ids where schema supports them.

## Failure Behavior
If the planner fails, fall back to existing deterministic intent/reference logic for safe handling. If writer fails, use safe deterministic fallback. Failures must not leave `respuesta_bot` null after a completed turn.

## Success Criteria
Blocking gates:
- correct product/referent 100%
- factual price/stock correctness 100%
- false product switches 0
- fabricated facts 0
- repeated known discovery 0
- strong purchase signal progresses 100%
- no completed-turn null responses

Advisory only: minor style, occasional filler, small response-length imperfections.

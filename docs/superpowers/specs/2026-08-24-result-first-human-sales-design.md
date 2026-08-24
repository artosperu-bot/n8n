# STECH Result-First Human Sales Design

## Goal
Make STECH lead the commercial conversation instead of waiting for the customer to ask price, stock, delivery, or reservation, while preserving factual authority and the v46 persistence contract.

## Core flow
1. Customer states need, pain, use case, or asks a direct factual question.
2. If enough context exists to recommend, STECH recommends one grounded product with 1–2 relevant facts only.
3. If SQL already resolved that recommended product, STECH includes price + availability/stock immediately in the same response. It does not ask whether the customer wants to know them.
4. STECH asks delivery vs pickup/local as the single next question.
5. After delivery/pickup is chosen, STECH asks whether to reserve.
6. Only a short affirmative to the explicit reservation question activates purchaseSignal and reservation-data collection.
7. If price/stock cannot be verified in that turn, STECH does not invent them and may offer to verify them as a fallback path.

## Conversation rules
- SPIN is diagnostic memory, not a mandatory questionnaire.
- Only explicit customer facts may become SPIN/customer memory. Planner prose cannot persist as problem, implication, need, or priority.
- Do not ask a fact already supplied.
- Direct factual questions remain direct.
- Pain/fit turns use simple everyday language, one short human scene when useful, and 1–2 verified facts translated to practical value.
- Never invent personal anecdotes, social proof, fear, urgency, scarcity, or customer consequences.
- Do not expose sales-framework jargon.

## Result-first commercial stages
The externally visible progression is:
- FIT + VERIFIED PRICE/STOCK -> OFFER_FULFILLMENT
- OFFER_FULFILLMENT -> OFFER_RESERVATION
- OFFER_RESERVATION + affirmative -> COLLECT_RESERVATION_DATA

The existing internal `SOFT_CLOSE` token may remain temporarily as implementation compatibility, but its visible behavior must be unambiguous at each stage and QA must validate the concrete result, not the token name.

SQL remains authority for price/stock; RAG remains authority for product facts; Supabase v46 persistence remains unchanged.

## Pain writer contract
Before the LLM writer receives factual content on pain/fit turns, reduce the evidence to at most two relevant verified facts. The writer receives:
- explicit customer use/problem/implications/priorities,
- selected verified facts,
- product recommendation,
- verified price/stock when already resolved,
- exact next commercial stage.

A long product-spec summary is not a valid fallback for a pain/fit response.

## Runtime traceability
Live QA must expose the running build/commit identifier so a stale Node process cannot be mistaken for the current branch.

## QA contract
The main live sales scenarios must be seller-led. They must not require customer turns such as “¿Cuánto está?” or “¿Hay stock?” after a fit has already been established. Required paths include:
- pain/use -> grounded recommendation + price + availability -> fulfillment question,
- delivery/pickup choice -> reservation question,
- short yes/dale to reservation -> purchaseSignal -> COLLECT_RESERVATION_DATA,
- direct price -> price + availability + fulfillment question,
- factual NFC stays direct,
- price objection acknowledges the objection before alternatives,
- no planner-authored SPIN facts persist.

## Out of scope
- No Supabase schema changes.
- No SQL price/stock authority changes.
- No RAG corpus changes.
- No n8n authentication fix in this block.
- No physical column drops.

# STECH Result-First Human Sales Design

## Goal
Make STECH lead the commercial conversation instead of waiting for the customer to ask price, stock, delivery, or reservation, while preserving factual authority and the v46 persistence contract.

## Core flow
1. Customer states need, pain, use case, or asks a direct factual question.
2. If enough context exists to recommend, STECH recommends one grounded product with 1–2 relevant facts only.
3. STECH proactively offers the next commercial result: price + availability together.
4. On a short affirmative to that explicit offer, STECH resolves SQL price + stock and returns both together.
5. STECH asks delivery vs pickup/local.
6. After delivery/pickup is chosen, STECH asks whether to reserve.
7. Only a short affirmative to the explicit reservation question activates purchaseSignal and reservation-data collection.

## Conversation rules
- SPIN is diagnostic memory, not a mandatory questionnaire.
- Only explicit customer facts may become SPIN/customer memory. Planner prose cannot persist as problem, implication, need, or priority.
- Do not ask a fact already supplied.
- Direct factual questions remain direct.
- Pain/fit turns use simple everyday language, one short human scene when useful, and 1–2 verified facts translated to practical value.
- Never invent personal anecdotes, social proof, fear, urgency, scarcity, or customer consequences.
- Do not expose sales-framework jargon.

## Result-first commercial actions
Use explicit action semantics instead of one overloaded soft close:
- OFFER_PRICE_AVAILABILITY
- OFFER_FULFILLMENT
- OFFER_RESERVATION
- COLLECT_RESERVATION_DATA

These actions are conversation-control semantics only. SQL remains authority for price/stock; RAG remains authority for product facts; Supabase v46 persistence remains unchanged.

## Pain writer contract
Before the LLM writer receives factual content on pain/fit turns, reduce the evidence to at most two relevant verified facts. The writer receives:
- explicit customer use/problem/implications/priorities,
- selected verified facts,
- product recommendation,
- exact next commercial action.

A long product-spec summary is not a valid fallback for a pain/fit response.

## Runtime traceability
Live QA must expose the running build/commit identifier so a stale Node process cannot be mistaken for the current branch.

## QA contract
The main live sales scenarios must be seller-led. They should not require customer turns such as “¿Cuánto está?” or “¿Hay stock?” after a fit has already been established. Required paths include:
- pain/use -> grounded recommendation -> OFFER_PRICE_AVAILABILITY,
- short yes -> price + stock from SQL -> OFFER_FULFILLMENT,
- delivery/pickup choice -> OFFER_RESERVATION,
- short yes/dale to reservation -> purchaseSignal -> COLLECT_RESERVATION_DATA,
- factual NFC stays direct,
- price objection acknowledges the objection before alternatives,
- no planner-authored SPIN facts persist.

## Out of scope
- No Supabase schema changes.
- No SQL price/stock authority changes.
- No RAG corpus changes.
- No n8n authentication fix in this block.
- No physical column drops.

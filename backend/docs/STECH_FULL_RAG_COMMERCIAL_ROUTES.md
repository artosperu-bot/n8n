# STECH — FULL RAG COMMERCIAL ROUTES

Status: APPROVED DESIGN / IMPLEMENTATION AUTHORITY
Branch: `feat/stech-backend`
Scope: Product RAG + Institutional RAG + Verified Facts + FAB + N+1 + Writer

## 1. Objective

This document defines the expected commercial route when the answer depends on documentary knowledge. It is a behavioral contract, not a phrase list and not a model-specific prompt.

The core pipeline is:

`CLIENT → INTENT/REFERENCE/STATE → VECTOR RAG → VERIFIED FACTS → DISPLAY POLICY → FAB → ONE N+1 → WRITER`

Authority separation remains mandatory:

- SQL/ERP = dynamic truth such as price and stock.
- Product RAG = documentary product truth.
- Institutional RAG = documentary policy/institutional truth.
- LLM = interpretation and natural wording, never factual authority.
- Commercial engine = decides what to show next and which single N+1 is executable.

## 2. Global Rules

1. RAW RAG must never be copied directly to the customer when atomic facts can be extracted.
2. Product overview is different from a single-attribute query.
3. A product overview should present at least 5 useful verified highlights when 5 distinct families are available.
4. RAM must always distinguish physical and virtual RAM. Preferred composition: `X GB RAM física + hasta Y GB RAM virtual`, optionally adding verified storage.
5. A single-attribute query answers that attribute first, with at most 2 directly related supporting facts.
6. FAB is generated only from verified features + known customer context. It may explain safe value, but cannot invent performance.
7. Normal overview uses 5–6 highlights + at most 1–2 contextual FAB conclusions + exactly one N+1 when useful.
8. N+1 is a single authorized commercial continuation. It must not be a generic CTA pasted onto every response.
9. Institutional answers resolve the policy/question first. They only add a practical implication and N+1 when relevant.
10. UNKNOWN remains UNKNOWN. Missing documentary evidence must never be promoted to YES.

## 3. Product Highlight Families

For smartphones, the commercial overview selector should prefer diverse families, not five facts from the same section.

Canonical families:

- MEMORY: RAM física + RAM virtual + storage/microSD.
- BATTERY: capacity + wired charging.
- RESISTANCE: IP68/IP69K/MIL-STD/fall/depth.
- CAMERA: main/night/front/thermal when verified.
- DISPLAY: refresh rate/size/resolution.
- PERFORMANCE: processor/chipset when verified.
- CONNECTIVITY: NFC/Wi-Fi/Bluetooth/USB when relevant.
- NETWORK: 4G/5G when relevant.
- POSITIONING/SENSORS: only when genuinely differentiating or requested.

The selector should return one commercial highlight per family before repeating a family.

## 4. FAB Contract

FAB is internal only.

`Feature verified → safe Advantage → contextual Benefit`

Allowed examples:

- Larger verified battery capacity can be described as more capacity/margin than a smaller measured battery.
- Higher verified charging wattage can be described as higher charging power.
- Verified IP/MIL/fall facts can be related to demanding physical environments.
- NFC can be related to contactless use when institutional/product evidence supports that function.

Forbidden inference examples:

- `6600 mAh` alone does not prove “dura todo el día”.
- More RAM alone does not prove “sin lags”.
- More MP alone does not prove better image quality.
- Night camera existence does not prove low-light superiority versus another model without comparable evidence.

## 5. N+1 Contract

The response order is:

`N = resolve current question`
`FAB = translate verified evidence into value when useful`
`+1 = one related executable continuation`

Examples of useful N+1:

- Overview without known priority → ask one priority that changes the next recommendation.
- Attribute query → related fact or one relevant follow-up, not a full spec dump.
- Recommendation → soft close or next decision criterion.
- Institutional location → normally ANSWER_ONLY unless pickup/visit context makes a continuation useful.
- Warranty → explain the practical protection and optionally the next warranty/purchase step.

Forbidden:

- Automatically appending “¿Quieres que revisemos disponibilidad?” to every RAG answer.
- Asking discovery when the customer already supplied the needed decision fact.
- Adding a second CTA after EXECUTABLE_NBA.

## 6. Expected Routes

### FR-01 PRODUCT_OVERVIEW
Input examples: “Háblame del Armor 22”, “¿Qué tal es el X13?”, “Dame info del X12 Pro”.
Expected route: `RAG_PRODUCT → VERIFIED_FACTS → PRODUCT_OVERVIEW`.
Display: 5–6 diverse verified highlights when available.
FAB: 1–2 short conclusions only if supported by context or obvious measured relationships.
N+1: one useful criterion question or related continuation.
Forbidden: dumping all RAG chunks; returning only one arbitrary section.

### FR-02 PRODUCT_ATTRIBUTE
Input: one requested attribute.
Expected route: `RAG_PRODUCT → ATTRIBUTE_FACTS`.
Display: direct atomic answer + max 2 related support facts.
FAB: short and optional.
N+1: one related continuation only.
Forbidden: entire section dump.

### FR-03 MEMORY_RAM
Display rule: always preserve physical vs virtual distinction.
Preferred: `X GB RAM física + hasta Y GB RAM virtual`, plus storage if verified.
Forbidden: summing them into “total RAM” without explicit physical/virtual labels.

### FR-04 BATTERY
Display: capacity + charging when both exist.
FAB: contextual to charging access/use only if context exists.
Forbidden: claiming guaranteed all-day duration from mAh alone.

### FR-05 RESISTANCE
Display: fall/IP/MIL facts that exist, compactly.
FAB: can connect to construction/field/demanding use.
Forbidden: absolute “indestructible” or unverified superiority.

### FR-06 CAMERA
Display: requested camera fact first; overview may highlight main/night/front only when distinctive.
Forbidden: MP → image-quality superiority without comparable evidence.

### FR-07 CONNECTIVITY_NFC
Display: direct `NFC = Sí/No`; optionally one directly relevant support such as verified Google Pay/contactless compatibility.
Forbidden: Wi-Fi + Bluetooth + USB + SIM dump unless requested.

### FR-08 NETWORK_5G
Display: verified 5G yes/no/unknown.
Hard requirement: UNKNOWN is not eligible as confirmed 5G.

### FR-09 NIGHT_VISION
Display: night-vision yes/no and MP if verified.
Hard requirement: candidates without verified night vision cannot win a “must have night vision” recommendation.

### FR-10 THERMAL
Display: thermal camera yes/no plus resolution/refresh/temperature range only if verified.
Hard requirement: same eligibility rule as night vision.

### FR-11 PRODUCT_COMPARISON_RAG
Display: up to 3 decision-relevant differences with symmetric evidence.
FAB: explain what the measured difference means for known use.
N+1: one decision criterion if still missing.

### FR-12 PRODUCT_RECOMMENDATION_RAG
Hard requirements filter first, ranking second.
Display: clear winner only with sufficient evidence; 1–2 verified reasons.
N+1: one next decision/purchase step.

### FR-13 INSTITUTIONAL_LOCATION
Route: `RAG_INSTITUTIONAL`.
Display: exact verified address/location answer.
N+1: normally ANSWER_ONLY unless visit/pickup context supports a continuation.

### FR-14 INSTITUTIONAL_WARRANTY
Display: verified warranty policy + practical implication.
Forbidden: inventing coverage, approval, or process.

### FR-15 INSTITUTIONAL_DELIVERY
Display: verified delivery policy, ranges/conditions only if present in RAG.
Forbidden: promising delivery dates not supported by policy/operation.

### FR-16 INSTITUTIONAL_PAYMENT
Display: verified payment methods/conditions.
Forbidden: claiming payment received or approved.

### FR-17 INSTITUTIONAL_CHANGES_RETURNS
Display: verified change/return policy and conditions.
Forbidden: inventing exceptions.

### FR-18 UNKNOWN_DOCUMENTAL_FACT
Display: “No tengo confirmado ese dato exacto” or equivalent concise wording.
N+1: only a safe alternative such as checking another verified attribute/product.

### FR-19 CONTEXTUAL_FAB
Consumes: verified features + known useCase/problem/priorities.
Produces: at most 1–2 safe commercial value statements.
Forbidden: introducing a new unverified feature to create the benefit.

### FR-20 RAG_N1_CONTINUITY
Consumes: current resolved intent + current product + context + final executable NBA.
Produces: exactly one continuation consistent with stage.
Forbidden: generic stock CTA when NBA did not authorize it.

## 7. Full-RAG Acceptance Focus

This gate intentionally evaluates documentary conversation quality. SQL price/stock, reservation execution, and n8n delivery may coexist but are not the functional authority for this gate.

Minimum evidence to inspect per turn:

- route (`RAG_PRODUCT` / `RAG_INSTITUTIONAL`)
- RAG source (`SUPABASE_VECTOR_*` preferred)
- verified facts selected
- product highlights selected
- FAB input/context
- final executable NBA
- customer-visible answer

A successful Full-RAG turn is not merely “RAG returned rows”. It must satisfy:

`correct retrieval → atomic truth → relevant selection → safe FAB → one sensible N+1 → natural response`

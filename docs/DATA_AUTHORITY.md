# DATA AUTHORITY — STECH Ventas Consultivas

## Source-of-truth hierarchy

### SQL Server / ERP

Authoritative for dynamic commercial and operational truth:

- dynamic price;
- stock;
- availability;
- product search;
- orders;
- customer/order operational data.

### Supabase / PostgreSQL

Authoritative for:

- session state;
- conversation persistence;
- context;
- concurrency/lease state;
- capability records;
- RAG documents;
- QA state/evidence.

### RAG

Used for:

- product documentation;
- policies;
- product-specification evidence;
- other non-dynamic facts.

RAG does not replace SQL for dynamic price or stock.

### LLM

Used for:

- interpretation;
- conversational wording;
- commercial drafting.

The LLM is not authoritative for price, stock, guaranteed availability, sensitive commercial facts or unsupported product capabilities.

## Truth rules

### UNKNOWN remains UNKNOWN

Capability state is tri-state:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `UNKNOWN`

Never collapse `UNKNOWN` to false.

### Internal flag != customer-facing truth

Example:

`precio_mostrado=true`

is not sufficient for QA PASS if the persisted response sent to the customer did not actually contain the price.

### Current intent != historical context

Historical context can support continuity but cannot become authority over an explicit current-turn request.

### Dynamic truth must be re-resolved

Price, stock and availability must come from the dynamic authority when needed. Never reuse stale conversational memory as authoritative commercial truth.

## Product identity

Preserve canonical product identity across SQL, context, comparison, recommendation and RAG. Do not allow context from another product to contaminate the active product.

## Controlled business-policy data

Known policy data used for QA should ultimately be served from controlled authority rather than uncontrolled LLM memory. Current known policy context includes:

- Store: S&T Store / STECH
- Location: Honorio Delgado 224, San Martín de Porres, Lima
- Hours: 10:00–17:00
- Pickup: YES
- Contraentrega: NO
- Lima shipping: 1–3 days
- Province shipping: 2–6 days
- Free shipping: >= S/250
- Warranty: 12 months
- Changes: 7 days
- Payments: transfer, Yape, Plin, cards

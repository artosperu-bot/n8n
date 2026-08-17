# P3 execution 3798 work and budget design

## Objective

A single commercial request may contain both a work context and a budget. Both facts must be captured deterministically, persisted in canonical context, constrain the recommendation, and appear in the recommendation rationale when supported.

## Fresh evidence

Execution 3798 received: `Busco un celular resistente para trabajo en exteriores y tengo S/ 1,000.` The interpreter returned `RECOMMEND` but omitted both `user_data.budget` and SPIN contributions. Node 06 therefore wrote null activity and budget. Its current budget grammar neither accepts `tengo S/` nor locale thousands separators, and its activity fallback depends on semantic contributions that were absent.

## Selected approach

Node 06 is the first failing boundary and owns deterministic extraction:
- parse explicit monetary statements with a currency marker or commercial budget phrase;
- normalize comma/dot thousands separators without product- or amount-specific rules;
- extract an explicit `trabajo de/en/como ...` phrase even when the same turn also requests a recommendation;
- merge both values through the existing canonical state fields.

Node 17A remains recommendation authority. After node 06 is GREEN, it may add a truthful sentence connecting the selected product price to the stored budget and the verified primary work criterion. Persistence remains unchanged because node 23 already snapshots canonical context and node 24 maps activity/budget columns.

## Safety boundaries

- No exact phrase, product, or amount hardcoding.
- No weakening of grounded semantic contribution checks.
- No inference of occupation from generic `uso laboral`.
- No price promise beyond SQL data.
- No production publication.
- P0/P1/P2.1 behavior remains frozen.

## Verification

RED is 3798. GREEN requires a fresh one-turn session with the same semantic content to show activity `trabajo en exteriores`, budget 1000, a recommendation at or below budget, rationale naming the relevant work/resistance fit and budget, and identical persisted readback.

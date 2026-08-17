# P3 execution 3799 UNKNOWN capability N+1 design

## Objective

Preserve tri-state product truth while keeping an UNKNOWN capability answer commercially useful.

## Evidence

Execution 3799 correctly classified Armor 22 5G as `UNKNOWN` and answered that it could not be confirmed. The answer then stopped. Node 17B is the physical owner: it classifies capability evidence and replaces the final answer after all earlier reducers.

## Selected behavior

For one non-comparison capability whose canonical status is `UNKNOWN`, node 17B will:
1. keep the existing explicit uncertainty statement;
2. ask one narrow question about whether that capability is indispensable;
3. offer comparison only conditionally, with a product whose support would still have to be confirmed by the same canonical evidence authority.

SUPPORTED and NOT_SUPPORTED answers remain unchanged. Multi-capability and comparison responses keep their current branches.

## Safety boundaries

- Never convert UNKNOWN to absence or support.
- No product/capability/phrase hardcoding.
- No unconditional upsell or invented alternative.
- No change to capability classification.
- No production publication.

## Verification

Re-run UNKNOWN Armor 22 5G and require the same canonical UNKNOWN plus one useful next step. Regress Armor X12 Pro NFC as SUPPORTED and a capability with explicit negative evidence as NOT_SUPPORTED; neither known truth may gain an UNKNOWN question.

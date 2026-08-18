# P3 Commercial QA + PRE-P4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible P3 Commercial QA V3 and PRE-P4 readiness package without changing the blocked n8n workflow.

**Architecture:** Store test intent in versioned JSON definitions, evaluate deterministic state/response contracts with a standard-library Python CLI, and keep human quality scoring explicit. Store evidence and operational readiness as sanitized Markdown; do not persist customer PII or execution transport objects.

**Tech Stack:** JSON, JSONL, Python 3 standard library, unittest, Markdown, GitHub branch `p0-concurrency-hardening`.

**Spec:** `docs/P3_COMMERCIAL_HARDENING_PRE_P4_DESIGN_20260818.md`

## Global Constraints

- Do not modify nodes `06` or `17A` while `availableInMCP=false`.
- Do not publish, activate, deactivate or unpublish any n8n workflow.
- Do not mutate production or Supabase schema/data.
- P0, P1 and P2.1 remain frozen.
- No phrase-specific or Armor-only production fix is authorized.
- GitHub receives sanitized evidence only; no credentials, headers, cookies or customer PII.

---

### Task 1: Deterministic evaluator

**Files:**
- Create: `qa/tools/test_evaluate_commercial_quality.py`
- Create: `qa/tools/evaluate_commercial_quality.py`

**Interfaces:**
- Consumes: suite JSON and result JSONL from Tasks 2 and 3.
- Produces: report JSON with `summary`, `cases`, deterministic failures and `human_review=REQUIRED`.

- [x] **Step 1: Write CLI behavior tests**

Tests execute the real CLI against temporary suite/result fixtures and cover a
valid direct answer, wrong reference target, false switch, robotic echo/question
overuse and missing results.

- [x] **Step 2: Verify RED**

Run: `python -m unittest qa/tools/test_evaluate_commercial_quality.py -v`

Expected: FAIL because `qa/tools/evaluate_commercial_quality.py` does not exist.

- [x] **Step 3: Implement the minimal evaluator**

Implement `--suite`, `--results` and `--output`; validate schema, compare exact
state fields, apply response guards, emit stable failure codes and return exit
code `0` only when deterministic failures equal zero.

- [x] **Step 4: Verify GREEN**

Run: `python -m unittest qa/tools/test_evaluate_commercial_quality.py -v`

Expected: 5 tests PASS.

### Task 2: Commercial QA V3 definition

**Files:**
- Create: `qa/regression/P3_COMMERCIAL_QA_V3_20260818.json`

**Interfaces:**
- Consumes: commercial and referential contracts from the design.
- Produces: 58 independently identifiable cases executable through the n8n QA harness once access is restored.

- [x] **Step 1: Define 58 cases**

Cover direct intent, problems, personal/work use, budget, referential follow-up,
comparison, recommendation, objections, buying signals, institutional answers,
UNKNOWN capability, switch positives and negative mentions.

- [x] **Step 2: Validate the suite**

Run: `python -m json.tool qa/regression/P3_COMMERCIAL_QA_V3_20260818.json >/dev/null`

Expected: exit code 0.

### Task 3: Long conversation V2

**Files:**
- Create: `qa/regression/P3_LONG_CONVERSATION_V2_20260818.json`

**Interfaces:**
- Consumes: the same evaluator contract as Task 1.
- Produces: one 20-turn sequence with explicit expected active, recommended and reference targets.

- [x] **Step 1: Define the sequence**

Include interest, work, problem, budget, comparison, criterion, recommendation,
institutional interruption, `el recomendado`, stock, objection, product mention,
explicit switch, `ese`, warranty and purchase.

- [x] **Step 2: Validate the sequence**

Run: `python -m json.tool qa/regression/P3_LONG_CONVERSATION_V2_20260818.json >/dev/null`

Expected: exit code 0.

### Task 4: Evidence and PRE-P4 readiness

**Files:**
- Create: `qa/evidence/P3_COMMERCIAL_AUDIT_20260818.md`
- Create: `docs/PRE_P4_READINESS_20260818.md`

**Interfaces:**
- Consumes: sanitized Supabase aggregates and observed QA sessions.
- Produces: baseline metrics, root classification, promotion/rollback gates,
  smoke suite, pilot design, handoff rules and metric thresholds.

- [x] **Step 1: Record evidence**

Record the 50-message baseline, owner matrix and the referential failure without
raw customer identities or transport data.

- [x] **Step 2: Record PRE-P4 gates**

Define pilot phases, qualification, human takeover, thresholds and rollback.

- [x] **Step 3: Run complete verification**

Run:

```bash
python -m unittest qa/tools/test_evaluate_commercial_quality.py -v
python -m json.tool qa/regression/P3_COMMERCIAL_QA_V3_20260818.json >/dev/null
python -m json.tool qa/regression/P3_LONG_CONVERSATION_V2_20260818.json >/dev/null
python qa/tools/evaluate_commercial_quality.py --suite qa/regression/fixtures/P3_COMMERCIAL_QA_EVALUATOR_SAMPLE_SUITE.json --results qa/regression/fixtures/P3_COMMERCIAL_QA_EVALUATOR_SAMPLE_RESULTS.jsonl --output /tmp/p3-commercial-report.json
```

Expected: tests pass, JSON parses and the sample fixture returns deterministic PASS.

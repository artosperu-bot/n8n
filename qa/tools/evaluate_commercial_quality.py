#!/usr/bin/env python3
"""Deterministic checks for the P3 commercial conversation QA suites."""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path
from typing import Any


TEMPLATE_ACKS = (
    "perfecto",
    "entiendo",
    "comprendo",
    "claro",
    "ah",
)


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(
        "".join(char.lower() if char.isalnum() else " " for char in text).split()
    )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"JSONL line {line_number} must be an object")
        records.append(value)
    return records


def failure(code: str, **details: Any) -> dict[str, Any]:
    return {"code": code, **details}


def evaluate_case(case: dict[str, Any], result: dict[str, Any] | None) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    case_id = case["id"]
    if result is not None and result.get("execution_status") == "NOT_EXECUTABLE_DUE_MCP":
        return {
            "id": case_id,
            "execution_status": "NOT_EXECUTABLE_DUE_MCP",
            "blocker": result.get("blocker", "WORKFLOW_NOT_AVAILABLE_IN_MCP"),
            "deterministic": "NOT_EVALUATED",
            "failures": [],
            "human_review": "NOT_AVAILABLE",
        }
    if result is None:
        failures.append(failure("MISSING_RESULT", case_id=case_id))
    else:
        response = str(result.get("response", ""))
        response_normalized = normalize(response)
        state = result.get("state") if isinstance(result.get("state"), dict) else {}

        for field, expected in case.get("expected_state", {}).items():
            actual = state.get(field)
            if actual != expected:
                failures.append(
                    failure(
                        "STATE_MISMATCH",
                        field=field,
                        expected=expected,
                        actual=actual,
                    )
                )

        contract = case.get("response_contract", {})
        for required in contract.get("must_contain_all", []):
            if normalize(required) not in response_normalized:
                failures.append(
                    failure("MISSING_REQUIRED_TEXT", expected=required)
                )
        for forbidden in contract.get("must_not_contain", []):
            if normalize(forbidden) in response_normalized:
                failures.append(failure("FORBIDDEN_TEXT", text=forbidden))

        if "max_questions" in contract:
            actual_questions = response.count("?")
            maximum = int(contract["max_questions"])
            if actual_questions > maximum:
                failures.append(
                    failure(
                        "QUESTION_LIMIT",
                        maximum=maximum,
                        actual=actual_questions,
                    )
                )

        if contract.get("forbid_user_echo"):
            message_normalized = normalize(case.get("message", ""))
            if message_normalized and message_normalized in response_normalized:
                failures.append(failure("USER_ECHO", echoed=case.get("message", "")))

        if contract.get("forbid_template_ack"):
            first_word = response_normalized.split(maxsplit=1)[0] if response_normalized else ""
            if first_word in TEMPLATE_ACKS:
                failures.append(failure("TEMPLATE_ACK", opening=first_word))

    return {
        "id": case_id,
        "deterministic": "FAIL" if failures else "PASS",
        "failures": failures,
        "human_review": "REQUIRED",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suite", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    try:
        suite = json.loads(args.suite.read_text(encoding="utf-8"))
        cases = suite["cases"]
        if not isinstance(cases, list):
            raise ValueError("suite.cases must be an array")
        results = read_jsonl(args.results)
        by_case = {record.get("case_id"): record for record in results}
        evaluated = [evaluate_case(case, by_case.get(case["id"])) for case in cases]
        failure_count = sum(case["deterministic"] == "FAIL" for case in evaluated)
        not_executed_count = sum(
            case["deterministic"] == "NOT_EVALUATED" for case in evaluated
        )
        report = {
            "schema_version": "1.0",
            "summary": {
                "total_cases": len(cases),
                "results_present": sum(case["id"] in by_case for case in cases),
                "deterministic_failures": failure_count,
                "not_executed": not_executed_count,
                "deterministic_passes": len(cases) - failure_count - not_executed_count,
                "human_reviews_required": len(cases) - not_executed_count,
                "human_reviews_unavailable": not_executed_count,
            },
            "cases": evaluated,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        if failure_count:
            return 1
        if not_executed_count:
            return 3
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"input error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

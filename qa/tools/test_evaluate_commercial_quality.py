import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "qa" / "tools" / "evaluate_commercial_quality.py"


class EvaluatorCliTests(unittest.TestCase):
    def run_evaluator(self, case, result):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            suite_path = temp / "suite.json"
            results_path = temp / "results.jsonl"
            report_path = temp / "report.json"
            suite_path.write_text(
                json.dumps({"schema_version": "1.0", "cases": [case]}),
                encoding="utf-8",
            )
            results_path.write_text(json.dumps(result) + "\n", encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--suite",
                    str(suite_path),
                    "--results",
                    str(results_path),
                    "--output",
                    str(report_path),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            report = (
                json.loads(report_path.read_text(encoding="utf-8"))
                if report_path.exists()
                else None
            )
            return completed, report

    def test_direct_answer_with_correct_state_passes(self):
        case = {
            "id": "DIRECT-PRICE-01",
            "message": "¿Cuánto cuesta el Armor 22?",
            "expected_state": {"target_product_id": "P-ARMOR-22-256G"},
            "response_contract": {
                "must_contain_all": ["Armor 22", "S/"],
                "must_not_contain": ["Perfecto", "Entiendo"],
                "max_questions": 1,
                "forbid_user_echo": True,
                "forbid_template_ack": True,
            },
        }
        result = {
            "case_id": "DIRECT-PRICE-01",
            "response": "El Armor 22 está en S/ 1,399.",
            "state": {"target_product_id": "P-ARMOR-22-256G"},
        }
        completed, report = self.run_evaluator(case, result)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(report["summary"]["deterministic_failures"], 0)
        self.assertEqual(report["cases"][0]["human_review"], "REQUIRED")

    def test_wrong_recommended_reference_target_fails(self):
        case = {
            "id": "REF-01",
            "message": "¿Cuánto cuesta el recomendado?",
            "expected_state": {"target_product_id": "P-ARMOR-22-256G"},
            "response_contract": {"must_contain_all": ["Armor 22"]},
        }
        result = {
            "case_id": "REF-01",
            "response": "El Armor X13 está en S/ 899.",
            "state": {"target_product_id": "P-ARMOR-X13"},
        }
        completed, report = self.run_evaluator(case, result)
        self.assertEqual(completed.returncode, 1)
        codes = {failure["code"] for failure in report["cases"][0]["failures"]}
        self.assertIn("STATE_MISMATCH", codes)
        self.assertIn("MISSING_REQUIRED_TEXT", codes)

    def test_attribute_preference_false_switch_fails(self):
        case = {
            "id": "SWITCH-NEG-01",
            "message": "Prefiero la batería del Armor 22.",
            "expected_state": {
                "active_product_id": "P-ARMOR-X13",
                "change_product_explicit": False,
            },
            "response_contract": {"must_not_contain": ["seguimos con el Armor 22"]},
        }
        result = {
            "case_id": "SWITCH-NEG-01",
            "response": "Perfecto, seguimos con el Armor 22.",
            "state": {
                "active_product_id": "P-ARMOR-22-256G",
                "change_product_explicit": True,
            },
        }
        completed, report = self.run_evaluator(case, result)
        self.assertEqual(completed.returncode, 1)
        codes = [failure["code"] for failure in report["cases"][0]["failures"]]
        self.assertEqual(codes.count("STATE_MISMATCH"), 2)

    def test_echo_template_ack_and_question_overuse_are_detected(self):
        case = {
            "id": "NATURAL-01",
            "message": "También vi el Armor 22.",
            "expected_state": {},
            "response_contract": {
                "max_questions": 0,
                "forbid_user_echo": True,
                "forbid_template_ack": True,
            },
        }
        result = {
            "case_id": "NATURAL-01",
            "response": "Perfecto, también vi el Armor 22. ¿Qué problema tienes?",
            "state": {},
        }
        completed, report = self.run_evaluator(case, result)
        self.assertEqual(completed.returncode, 1)
        codes = {failure["code"] for failure in report["cases"][0]["failures"]}
        self.assertIn("USER_ECHO", codes)
        self.assertIn("TEMPLATE_ACK", codes)
        self.assertIn("QUESTION_LIMIT", codes)

    def test_missing_result_is_a_deterministic_failure(self):
        case = {"id": "MISSING-01", "message": "¿Hay stock?", "expected_state": {}}
        result = {"case_id": "OTHER", "response": "Disponible.", "state": {}}
        completed, report = self.run_evaluator(case, result)
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(report["cases"][0]["failures"][0]["code"], "MISSING_RESULT")


if __name__ == "__main__":
    unittest.main()

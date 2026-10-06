"""Pruebas de tools/plan/render_plan.py: sección frozen_files, cards.json, frozen-files.json y --check.

Uso: python3 -m unittest discover -s tools/plan -p 'test_*.py' -v
"""
import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_plan as rp  # noqa: E402


def card(card_id, executor, owns, depends_on=(), requirements=()):
    return {
        "id": card_id,
        "title": f"Card {card_id}",
        "executor": executor,
        "size": "S",
        "depends_on": list(depends_on),
        "requirements": list(requirements),
        "owns": list(owns),
        "contracts_used": [],
        "deliverables": "d",
        "acceptance_criteria": ["c"],
        "notes": "",
    }


def mini_plan():
    """Plan sintético mínimo: una tarjeta de Opus en W0 y dos tarjetas en W1 que cubren R1–R28."""
    return {
        "waves": [
            {"id": "W0", "name": "Base", "goal": "g0", "cards": [card("W0-01", "opus", ["config.json", "ci/"])]},
            {
                "id": "W1",
                "name": "Uno",
                "goal": "g1",
                "cards": [
                    card("W1-01", "sonnet", ["src/a/"], ["W0-01"], list(rp.REQ)),
                    card("W1-02", "opus", ["ci/deploy.yml"], ["W0-01"]),
                ],
            },
        ],
        "wave0_contracts": "contratos",
        "shared_files_policy": "politica",
        "frozen_files": [
            {"path": "ci/", "editableBy": ["W0-01", "W1-02"]},
            {"path": "config.json", "editableBy": ["W0-01"]},
        ],
        "rationale": "r",
        "risks": ["x"],
        "summary_es": "s",
    }


def problems_of(plan):
    return rp.validate(plan)[1]


def run_main(argv, root):
    """Corre rp.main sin ensuciar la salida de las pruebas; devuelve el código de salida."""
    with contextlib.redirect_stdout(io.StringIO()):
        return rp.main(argv, root)


class FrozenFilesValidation(unittest.TestCase):
    def test_mini_plan_is_valid(self):
        self.assertEqual(problems_of(mini_plan()), [])

    def test_missing_section_is_a_problem(self):
        plan = mini_plan()
        del plan["frozen_files"]
        self.assertIn("plan.json no tiene la sección 'frozen_files' (lista de {path, editableBy})", problems_of(plan))

    def test_entry_without_editable_by_is_a_problem(self):
        plan = mini_plan()
        del plan["frozen_files"][1]["editableBy"]
        self.assertIn("frozen_files[1] (config.json): falta editableBy", problems_of(plan))

    def test_entry_without_path_is_a_problem(self):
        plan = mini_plan()
        plan["frozen_files"][0] = {"editableBy": ["W0-01"]}
        self.assertIn("frozen_files[0]: falta path", problems_of(plan))

    def test_unknown_card_id_in_editable_by_is_a_problem(self):
        plan = mini_plan()
        plan["frozen_files"][1]["editableBy"] = ["W0-01", "W9-99"]
        self.assertIn("frozen_files[1] (config.json): editableBy nombra W9-99, que no existe", problems_of(plan))

    def test_duplicate_path_is_a_problem(self):
        plan = mini_plan()
        plan["frozen_files"].append({"path": "config.json", "editableBy": ["W0-01"]})
        self.assertIn("frozen_files: ruta repetida config.json", problems_of(plan))

    def test_unsafe_path_is_a_problem(self):
        plan = mini_plan()
        plan["frozen_files"].append({"path": "./x/../y", "editableBy": []})
        self.assertIn(
            "frozen_files[2] (./x/../y): la ruta debe ser relativa a la raíz, sin './', '..' ni comodines",
            problems_of(plan),
        )

    def test_owner_inside_frozen_path_must_be_in_editable_by(self):
        plan = mini_plan()
        plan["frozen_files"][0]["editableBy"] = ["W0-01"]
        self.assertIn("W1-02 posee ci/deploy.yml, congelado por ci/ sin figurar en su editableBy", problems_of(plan))

    def test_frozen_file_inside_an_owned_dir_needs_no_editable_by(self):
        plan = mini_plan()
        plan["frozen_files"].append({"path": "src/a/contract.ts", "editableBy": []})
        self.assertEqual(problems_of(plan), [])


class GeneratedJson(unittest.TestCase):
    def outputs(self, plan=None):
        plan = plan or mini_plan()
        cards, problems = rp.validate(plan)
        self.assertEqual(problems, [])
        return rp.build_outputs(plan, cards)

    def test_frozen_files_json_equals_the_plan_section(self):
        out = self.outputs()
        self.assertEqual(json.loads(out["docs/plan/frozen-files.json"]), mini_plan()["frozen_files"])
        self.assertTrue(out["docs/plan/frozen-files.json"].endswith("]\n"))

    def test_cards_json_lists_id_wave_executor_branch_and_owns(self):
        cards = json.loads(self.outputs()["docs/plan/cards.json"])
        self.assertEqual([c["id"] for c in cards], ["W0-01", "W1-01", "W1-02"])
        self.assertEqual(
            cards[2],
            {
                "id": "W1-02",
                "wave": "W1",
                "executor": "opus",
                "branch": "card/W1-02-card-w1-02",
                "owns": ["ci/deploy.yml"],
            },
        )

    def test_outputs_keep_the_existing_views(self):
        out = self.outputs()
        for rel in ("docs/plan/cards/W0-01.md", "docs/plan/traceability.md", "docs/plan/waves.md"):
            self.assertIn(rel, out)

    def test_building_twice_gives_identical_bytes(self):
        self.assertEqual(self.outputs(), self.outputs(copy.deepcopy(mini_plan())))


class CheckMode(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "docs/plan").mkdir(parents=True)
        (self.root / "docs/plan/plan.json").write_text(
            json.dumps(mini_plan(), ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_check_reports_missing_views_then_passes_after_writing(self):
        self.assertEqual(run_main(["--check"], self.root), 1)
        self.assertEqual(run_main([], self.root), 0)
        self.assertEqual(run_main(["--check"], self.root), 0)

    def test_check_reports_a_stale_frozen_files_json(self):
        run_main([], self.root)
        (self.root / "docs/plan/frozen-files.json").write_text("[]\n", encoding="utf-8")
        cards, _ = rp.validate(mini_plan())
        stale = rp.stale_outputs(rp.build_outputs(mini_plan(), cards), self.root)
        self.assertEqual(stale, ["docs/plan/frozen-files.json"])
        self.assertEqual(run_main(["--check"], self.root), 1)

    def test_check_reports_a_leftover_card_view(self):
        run_main([], self.root)
        (self.root / "docs/plan/cards/W9-99.md").write_text("x\n", encoding="utf-8")
        cards, _ = rp.validate(mini_plan())
        self.assertEqual(rp.leftover_views(rp.build_outputs(mini_plan(), cards), self.root), ["docs/plan/cards/W9-99.md"])
        self.assertEqual(run_main(["--check"], self.root), 1)


if __name__ == "__main__":
    unittest.main()

"""Tests of .github/scripts/check_algorithm_examples.py on a miniature repository and on this repository.

Usage: python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_algorithm_examples as C  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]

ALG = """# T

## <a id="alg-conv"></a>[ALG.CONV] Convenciones

Usa [ALG.LEVEL].

## <a id="alg-level"></a>[ALG.LEVEL] Cuota

- <a id="alg-level-split"></a>**[ALG.LEVEL.SPLIT]** Parte.

## <a id="alg-example"></a>[ALG.EXAMPLE] Ejemplo

## <a id="alg-pending"></a>[ALG.PENDING] Pendientes

1. Uno.
2. Dos.
"""
GLOSSARY = """# G

## Identificadores de sección `[ALG.*]`

| Token | Español | Inglés (código) |
|---|---|---|
| `ALG` | a | a |
| `CONV` | b | b |
| `LEVEL` | c | c |
| `SPLIT` | d | d |
| `EXAMPLE` | e | e |
| `PENDING` | f | f |
"""
TERMS = {"principal": "1000.00", "termMonths": 2, "disbursementDate": "2025-01-01", "firstDueDate": "2025-02-01",
         "paymentDay": 1, "currency": "GTQ", "interestRate": "0.07", "insuranceRates": [], "fixedCharges": [],
         "roundingProfile": "SIMPLE", "rateType": "FIXED"}
PREPAY = {"id": "p", "type": "Prepayment", "date": "2025-01-01", "amount": "1.00", "mode": "REDUCE_TERM"}
TOTALS = {"interest": "8.77", "insurance": "0.00", "capital": "1000.00", "fixedCharges": "0.00",
          "prepayments": "0.00", "commissions": "0.00", "total": "1008.77", "totalPaid": "1008.77"}


def doc(id_, items, sections, events, expected=None):
    return {"synthetic": True, "schema": C.SCHEMA, "id": id_, "title": "t", "pendingItems": items,
            "sections": sections, "eventTypes": sorted({e["type"] for e in events}),
            "cases": [{"id": "main", "operation": "buildSchedule", "terms": TERMS, "events": events,
                       "expected": expected or {"installmentCount": 2, "endDate": "2025-03-01", "rows": [],
                                                "totals": TOTALS}}]}


INDEX = """# I

## Checklist de [ALG.PENDING]

| Ítem | Qué cubre | Reglas | Ejemplos | Recalculado |
|---|---|---|---|---|
| EX | base | [ALG.EXAMPLE](../../algorithm.md#alg-example) | [core/ex00-base-fha.json](core/ex00-base-fha.json) | sí |
| 1 | uno | [ALG.LEVEL](../../algorithm.md#alg-level) | [core/ex01-a.json](core/ex01-a.json) | sí |
| 2 | dos | [ALG.LEVEL.SPLIT](../../algorithm.md#alg-level-split) | [events/ex02-b.json](events/ex02-b.json) | sí |

## Archivos

| Archivo | Conjunto | Eventos | Casos |
|---|---|---|---|
| [core/ex00-base-fha.json](core/ex00-base-fha.json) | core | — | `main` |
| [core/ex01-a.json](core/ex01-a.json) | core | — | `main` |
| [events/ex02-b.json](events/ex02-b.json) | events | Prepayment | `main` |
"""


class Checker(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.root = Path(self.tmp.name)
        (r / "docs/specs/algorithm-examples/core").mkdir(parents=True)
        (r / "docs/specs/algorithm-examples/events").mkdir(parents=True)
        (r / "docs/algorithm.md").write_text(ALG, encoding="utf-8")
        (r / "docs/glossary.md").write_text(GLOSSARY, encoding="utf-8")
        self.write("core/ex00-base-fha.json", doc("ex00-base-fha", [], ["ALG.EXAMPLE"], []))
        self.write("core/ex01-a.json", doc("ex01-a", [1], ["ALG.LEVEL"], []))
        self.write("events/ex02-b.json", doc("ex02-b", [2], ["ALG.LEVEL.SPLIT"], [PREPAY]))
        (r / "docs/specs/algorithm-examples/INDEX.md").write_text(INDEX, encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, rel, obj, raw=None):
        p = self.root / "docs/specs/algorithm-examples" / rel
        p.write_text(raw if raw is not None else json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    def errors(self, part="all"):
        return C.run_checks(self.root, part)

    def test_good_tree_passes(self):
        self.assertEqual(self.errors(), [])

    def test_unmapped_pending_item_fails(self):
        index = self.root / "docs/specs/algorithm-examples/INDEX.md"
        index.write_text("\n".join(ln for ln in INDEX.splitlines() if not ln.startswith("| 2 |")), encoding="utf-8")
        self.assertIn("INDEX.md: [ALG.PENDING] item 2 is unmapped", self.errors("index"))

    def test_json_float_and_missing_synthetic_fail(self):
        bad = doc("ex01-a", [1], ["ALG.LEVEL"], [])
        bad["synthetic"] = False
        text = json.dumps(bad).replace('"principal": "1000.00"', '"principal": 1000.0')
        self.write("core/ex01-a.json", None, raw=text)
        errs = self.errors("examples")
        self.assertIn("core/ex01-a.json: root synthetic must be true", errs)
        self.assertTrue(any("JSON float 1000.0" in e for e in errs), errs)

    def test_event_file_in_core_fails(self):
        self.write("core/ex01-a.json", doc("ex01-a", [1], ["ALG.LEVEL"], [PREPAY]))
        self.assertIn("core/ex01-a.json: core/ files must be event-free", self.errors("examples"))

    def test_events_column_must_match(self):
        index = self.root / "docs/specs/algorithm-examples/INDEX.md"
        index.write_text(INDEX.replace("| events | Prepayment |", "| events | — |"), encoding="utf-8")
        self.assertIn("INDEX.md: events of events/ex02-b.json are '—', expected 'Prepayment'", self.errors("index"))

    def test_field_names_of_the_frozen_contracts_are_enforced(self):
        legacy = [dict(PREPAY, commission=None), {"id": "a", "type": "AdvanceInstallments", "date": "2025-01-01", "n": 6}]
        expected = {"installments": 2, "endDate": "2025-03-01", "rows": [], "totals": dict(TOTALS, insuranceParts=[])}
        self.write("events/ex02-b.json", doc("ex02-b", [2], ["ALG.LEVEL.SPLIT"], legacy, expected))
        errs = self.errors("examples")
        for message in ("events/ex02-b.json: main.events[0].commission is null; omit optional fields",
                        "events/ex02-b.json: main.events[1]: unknown field 'n' for AdvanceInstallments",
                        "events/ex02-b.json: main.events[1]: missing field 'count' for AdvanceInstallments",
                        "events/ex02-b.json: main.expected: unknown key 'installments'",
                        "events/ex02-b.json: main.expected: missing key 'installmentCount'",
                        "events/ex02-b.json: main.expected.totals: unknown key 'insuranceParts'"):
            self.assertIn(message, errs)

    def test_broken_anchor_and_missing_anchor_fail(self):
        (self.root / "docs/algorithm.md").write_text(ALG.replace('<a id="alg-level"></a>', ""), encoding="utf-8")
        self.assertIn('algorithm.md: ALG.LEVEL has no <a id="alg-level"></a> on its definition line',
                      self.errors("algorithm"))
        self.assertIn("INDEX.md: anchor #alg-level does not exist in algorithm.md", self.errors("index"))

    def test_glossary_token_missing_fails(self):
        (self.root / "docs/glossary.md").write_text(GLOSSARY.replace("| `SPLIT` | d | d |\n", ""), encoding="utf-8")
        self.assertEqual(self.errors("glossary"), ["glossary.md: token SPLIT of the section ids has no row"])


class RepoExamples(unittest.TestCase):
    def test_this_repository_passes_every_rule(self):
        self.assertEqual(C.run_checks(REPO_ROOT, "all"), [])


if __name__ == "__main__":
    unittest.main()

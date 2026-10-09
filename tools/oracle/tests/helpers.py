"""Utilidades compartidas de las pruebas (sin datos reales)."""

from __future__ import annotations

import json
from pathlib import Path

ORACLE_DIR = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = ORACLE_DIR.parents[1] / "docs" / "specs" / "algorithm-examples"


def load_core_example_cases() -> list[tuple[str, dict]]:
    """Casos de cada ejemplo de core/ cuya operación es buildSchedule."""
    cases = []
    for path in sorted((EXAMPLES_DIR / "core").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for case in data["cases"]:
            cases.append((f"{path.stem}/{case['id']}", case))
    return cases


def terms_from_example(example_terms: dict) -> dict:
    """FORMAT.md §11: rateType se descarta."""
    return {key: value for key, value in example_terms.items() if key != "rateType"}

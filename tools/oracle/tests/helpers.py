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


def load_event_example_cases() -> list[tuple[str, dict]]:
    """Casos buildSchedule de events/ (los de la ruta real; buildPaths, goalSeek y validate
    quedan fuera del oráculo, tarjeta W2-06)."""
    cases = []
    for path in sorted((EXAMPLES_DIR / "events").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for case in data["cases"]:
            if case["operation"] == "buildSchedule":
                cases.append((f"{path.stem}/{case['id']}", case))
    return cases


def events_from_example(example_events: list[dict]) -> list[dict]:
    """FORMAT.md §11: ActualPayment.date pasa a paidDate; los demás eventos no cambian."""
    converted = []
    for event in example_events:
        event = dict(event)
        if event["type"] == "ActualPayment":
            event["paidDate"] = event.pop("date")
        converted.append(event)
    return converted


def comparison_metrics(base: dict, scenario: dict, currency: str) -> dict:
    """[ALG.METRICS] para los dos resúmenes y filas (`comparedToNoEvents` de los ejemplos)."""
    from decimal import Decimal

    def saved(result):
        rows = result["rows"]
        return sum((Decimal(r["interest"]) + Decimal(r["insurance"]) for r in rows), Decimal(0))

    base_paid = Decimal(base["summary"]["totalPaid"])
    paid = Decimal(scenario["summary"]["totalPaid"])
    return {
        "currency": currency,
        "interestSaved": f"{saved(base) - saved(scenario):.2f}",
        "monthsSaved": base["summary"]["installments"] - scenario["summary"]["installments"],
        "baseEndDate": base["summary"]["endDate"],
        "endDate": scenario["summary"]["endDate"],
        "baseTotalPaid": f"{base_paid:.2f}",
        "totalPaid": f"{paid:.2f}",
        "netSaving": f"{base_paid - paid:.2f}",
    }

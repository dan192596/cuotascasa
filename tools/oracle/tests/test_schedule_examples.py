"""Cada ejemplo de docs/specs/algorithm-examples/core/ se reproduce al centavo."""

from __future__ import annotations

import pytest
from helpers import load_core_example_cases, terms_from_example

from cuotascasa_oracle.errors import InvalidInputError
from cuotascasa_oracle.schedule import build_schedule, yearly_subtotals

CASES = load_core_example_cases()


def test_all_core_examples_are_event_free_and_found():
    assert len(CASES) >= 20
    for _, case in CASES:
        assert case["events"] == []
        assert case["operation"] == "buildSchedule"


@pytest.mark.parametrize(("name", "case"), CASES, ids=[name for name, _ in CASES])
def test_example_is_reproduced(name, case):
    terms = terms_from_example(case["terms"])
    expected = case["expected"]
    if "error" in expected:
        with pytest.raises(InvalidInputError) as info:
            build_schedule(terms)
        assert info.value.rule == expected["error"]["rule"]
        return
    result = build_schedule(terms)
    rows = {row["k"]: row for row in result["rows"]}
    summary = result["summary"]
    assert summary["installments"] == expected["installmentCount"]
    assert len(result["rows"]) == expected["installmentCount"]
    assert summary["endDate"] == expected["endDate"]
    for expected_row in expected["rows"]:
        assert rows[expected_row["k"]] == expected_row
    totals = expected["totals"]
    assert summary["totalInterest"] == totals["interest"]
    assert summary["totalInsurance"] == totals["insurance"]
    assert summary["totalCapital"] == totals["capital"]
    assert summary["totalFixedCharges"] == totals["fixedCharges"]
    assert summary["totalPrepayments"] == totals["prepayments"]
    assert summary["totalCommissions"] == totals["commissions"]
    assert summary["totalPaid"] == totals["totalPaid"]
    assert result["anchors"] == [] and result["payments"] == []
    if "yearly" in expected:
        assert yearly_subtotals(result["rows"]) == expected["yearly"]

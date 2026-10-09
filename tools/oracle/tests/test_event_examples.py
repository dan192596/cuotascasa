"""Cada ejemplo con eventos de docs/specs/algorithm-examples/events/ (ruta real) se reproduce."""

from __future__ import annotations

from decimal import Decimal

import pytest
from helpers import (
    comparison_metrics,
    events_from_example,
    load_event_example_cases,
    terms_from_example,
)

from cuotascasa_oracle import errors
from cuotascasa_oracle.schedule import build_schedule, yearly_subtotals

CASES = load_event_example_cases()


def test_every_real_path_event_example_is_collected():
    # ex00 (4) + ex03 (5) + ex04 (2) + ex05b (1) + ex06 (5) + ex07 (5) + ex08 (3) + ex09 (1)
    # + ex16 (3) = 29 casos buildSchedule.
    assert len(CASES) == 29
    assert {name.split("/")[0] for name, _ in CASES} == {
        "ex00-base-prepayments",
        "ex03-rate-change-policies",
        "ex04-reduce-term-then-recalc",
        "ex05b-fixed-charge-change",
        "ex06-commissions-payoff",
        "ex07-same-k-anchors",
        "ex08-late-actual-payment",
        "ex09-actual-payment-component-delta",
        "ex16-explicit-k-anchor",
    }


def _by_event(items):
    return {item["eventId"]: item for item in items}


@pytest.mark.parametrize(("name", "case"), CASES, ids=[name for name, _ in CASES])
def test_example_is_reproduced(name, case):
    terms = terms_from_example(case["terms"])
    events = events_from_example(case["events"])
    expected = case["expected"]
    if "error" in expected:
        error = expected["error"]
        with pytest.raises(getattr(errors, error["type"])) as info:
            build_schedule(terms, events)
        assert info.value.rule == error["rule"]
        assert getattr(info.value, "k", None) == error.get("k")
        return
    result = build_schedule(terms, events)
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
    delta = expected.get("realDelta", {"perAnchor": [], "perComponent": []})
    assert _by_event(result["anchors"]) == {
        item["eventId"]: {k: item[k] for k in ("eventId", "k", "realDelta")}
        for item in delta["perAnchor"]
    }
    plain = [
        {"eventId": e["id"], "k": e["installmentNumber"], "componentDeltas": None}
        for e in events
        if e["type"] == "ActualPayment" and "breakdown" not in e
    ]
    assert [p for p in result["payments"] if p["componentDeltas"] is None] == plain
    assert Decimal(summary["totalPaid"]) == sum(
        (Decimal(r["total"]) for r in result["rows"]), Decimal(0)
    ) + Decimal(totals["prepayments"]) + Decimal(totals["commissions"])
    assert sum((Decimal(r["total"]) for r in result["rows"]), Decimal(0)) == Decimal(
        totals["total"]
    )
    balances = {e["id"]: e["balance"] for e in events if e["type"] == "ReportedBalance"}
    for item in delta["perAnchor"]:
        assert item["reported"] == balances[item["eventId"]]
        assert Decimal(item["projected"]) == Decimal(item["reported"]) - Decimal(item["realDelta"])
    assert _by_event([p for p in result["payments"] if p["componentDeltas"]]) == {
        item["eventId"]: {
            "eventId": item["eventId"],
            "k": item["k"],
            "componentDeltas": {
                key: item[key] for key in ("capital", "interest", "insurance", "fixedCharges")
            },
        }
        for item in delta["perComponent"]
    }
    if "yearly" in expected:
        assert yearly_subtotals(result["rows"]) == expected["yearly"]
    if "comparedToNoEvents" in expected:
        base = build_schedule(terms)
        metrics = comparison_metrics(base, result, terms["currency"])
        assert metrics == expected["comparedToNoEvents"]

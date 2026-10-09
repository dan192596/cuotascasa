"""Reglas de eventos que los ejemplos no cubren: rulings de Opus, orden, asociación y errores."""

from __future__ import annotations

import copy
from datetime import date
from decimal import Decimal

import pytest
from helpers import load_event_example_cases, terms_from_example

from cuotascasa_oracle.errors import InvalidInputError, NegativeAmortizationError
from cuotascasa_oracle.events import installment_for_date
from cuotascasa_oracle.schedule import build_schedule
from cuotascasa_oracle.terms import parse_terms

# Condiciones del ejemplo base (sintético): 500000.00, 240 cuotas, FHA, fin de mes.
BASE = terms_from_example(dict(load_event_example_cases()[0][1]["terms"]))


def prepayment(event_id, when, amount, mode="REDUCE_TERM", **extra):
    return {
        "id": event_id,
        "type": "Prepayment",
        "date": when,
        "amount": amount,
        "mode": mode,
        **extra,
    }


def anchor(event_id, when, balance, **extra):
    return {"id": event_id, "type": "ReportedBalance", "date": when, "balance": balance, **extra}


def advance(event_id, when, count):
    return {"id": event_id, "type": "AdvanceInstallments", "date": when, "count": count}


def rate_change(event_id, when, policy="RECALC_INSTALLMENT_KEEP_TERM", rate="0.07", **extra):
    return {
        "id": event_id,
        "type": "RateChange",
        "date": when,
        "policy": policy,
        "interestRate": rate,
        **extra,
    }


def test_advance_in_fixed_term_with_zero_capital_still_drops_the_term_by_n():
    # Ruling 1: tras un REDUCE_INSTALLMENT que deja 0.50, level = 0.00 y projectCapital = 0.00.
    events = [
        prepayment("p1", "2026-01-15", "489755.81", "REDUCE_INSTALLMENT"),
        advance("a1", "2026-02-28", 3),
    ]
    result = build_schedule(BASE, events)
    assert build_schedule(BASE, events[:1])["summary"]["installments"] == 240
    assert result["summary"]["installments"] == 237
    assert result["rows"][12]["prepayment"] == "0.00"


def test_advance_with_negative_project_capital_is_clamped_and_term_still_drops():
    # Ruling 1: un ancla que sube el saldo deja level < charge (capital negativo).
    events = [anchor("b", "2026-01-20", "800000.00"), advance("a", "2026-01-20", 2)]
    result = build_schedule(BASE, events)
    assert result["rows"][11]["prepayment"] == "0.00"
    assert Decimal(result["rows"][12]["capital"]) < 0
    assert result["summary"]["installments"] == 238


def test_advance_with_zero_balance_is_a_full_noop():
    # La cuota 240 liquida; un adelanto en esa misma k no cambia nada ([ALG.PREPAY.CAP]).
    base = build_schedule(BASE)
    result = build_schedule(BASE, [advance("a", "2045-01-31", 4)])
    assert result["rows"] == base["rows"]


def test_prepayment_with_zero_balance_charges_no_commission():
    events = [
        prepayment(
            "p1",
            "2045-01-31",
            "1000.00",
            commission={"kind": "FLAT", "amount": "250.00"},
        )
    ]
    result = build_schedule(BASE, events)
    assert result["rows"][-1]["prepayment"] == "0.00"
    assert result["rows"][-1]["commission"] == "0.00"


def test_recalc_in_derived_term_with_old_level_that_does_not_amortize_raises_alg_term():
    # Ruling 3: término derivado = (k − 1) + remainingTerm con el nivel anterior.
    events = [
        prepayment("p1", "2026-01-15", "20000.00"),
        anchor("b", "2027-01-20", "900000.00"),
        rate_change("r", "2027-01-20"),
    ]
    with pytest.raises(NegativeAmortizationError) as info:
        build_schedule(BASE, events)
    assert (info.value.rule, info.value.k) == ("ALG.TERM", 24)


def test_recalc_in_derived_term_uses_k_minus_one_plus_remaining_term():
    events = [
        prepayment("p1", "2026-01-15", "20000.00"),
        rate_change("r", "2027-01-20", rate="0.075"),
    ]
    result = build_schedule(BASE, events)
    # El plazo queda fijo en 220 (REDUCE_TERM, [ALG.EXAMPLE]); el recálculo lo respeta.
    assert result["summary"]["installments"] == 220


def test_payoff_row_is_not_a_natural_last_row_and_closes_the_loan():
    result = build_schedule(BASE, [prepayment("p1", "2027-01-20", "900000.00")])
    last = result["rows"][-1]
    assert last["k"] == 24
    assert last["prepayment"] == last["closing"] != "0.00"


def test_event_after_a_payoff_in_a_later_installment_is_out_of_range():
    events = [prepayment("p1", "2027-01-20", "900000.00"), anchor("b", "2028-01-20", "1.00")]
    with pytest.raises(InvalidInputError) as info:
        build_schedule(BASE, events)
    assert (info.value.rule, info.value.k) == ("ALG.EVENTS.ANCHOR", 36)


def test_smallest_k_is_reported_among_out_of_range_events():
    events = [anchor("b2", "2046-05-10", "1.00"), anchor("b1", "2045-02-10", "1.00")]
    with pytest.raises(InvalidInputError) as info:
        build_schedule(BASE, events)
    assert info.value.k == 241


def test_installment_number_wins_over_the_date():
    events = [anchor("b", "2030-01-10", "490000.00", installmentNumber=12)]
    assert build_schedule(BASE, events)["anchors"][0]["k"] == 12


@pytest.mark.parametrize(
    ("when", "expected"),
    [
        ("2020-01-01", 1),
        ("2025-02-28", 1),
        ("2025-03-01", 2),
        ("2026-01-31", 12),
        ("2026-02-01", 13),
        ("2045-01-31", 240),
        ("2045-02-01", 241),
    ],
)
def test_installment_for_date_is_the_first_due_date_on_or_after(when, expected):
    terms = parse_terms(BASE)
    assert installment_for_date(terms, date.fromisoformat(when)) == expected


def test_order_within_a_phase_is_date_then_type_rank_then_id():
    # Fase 3: el abono de fecha posterior va después aunque su rango sea 0; mismo día: abono
    # (rango 0) antes que adelanto (rango 1).
    same_day = [advance("a1", "2026-01-15", 2), prepayment("p1", "2026-01-15", "1000.00")]
    swapped = [same_day[1], same_day[0]]
    assert build_schedule(BASE, same_day) == build_schedule(BASE, swapped)
    later = [advance("a1", "2026-01-10", 2), prepayment("p1", "2026-01-20", "1000.00")]
    earlier = [advance("a1", "2026-01-25", 2), prepayment("p1", "2026-01-20", "1000.00")]
    assert build_schedule(BASE, later) != build_schedule(BASE, earlier)


def test_anchor_report_is_against_the_projected_opening_and_latest_date_wins():
    events = [
        anchor("rb1", "2026-01-05", "490000.00"),
        anchor("rb2", "2026-01-20", "490100.00"),
    ]
    result = build_schedule(BASE, events)
    base_opening = build_schedule(BASE)["rows"][11]["opening"]
    assert result["rows"][11]["opening"] == "490100.00"
    assert [a["k"] for a in result["anchors"]] == [12, 12]
    assert result["anchors"][0]["realDelta"] == f"{490000.00 - float(base_opening):.2f}"


def test_anchor_tie_on_date_is_won_by_the_greater_id():
    events = [
        anchor("rb-a", "2026-01-20", "490000.00"),
        anchor("rb-b", "2026-01-20", "490100.00"),
    ]
    assert build_schedule(BASE, events)["rows"][11]["opening"] == "490100.00"
    assert build_schedule(BASE, events[::-1])["rows"][11]["opening"] == "490100.00"


def test_outputs_follow_the_order_of_the_input_events():
    events = [anchor("rb-z", "2026-01-20", "490000.00"), anchor("rb-a", "2025-06-20", "497000.00")]
    result = build_schedule(BASE, events)
    assert [a["eventId"] for a in result["anchors"]] == ["rb-z", "rb-a"]


def test_fixed_charge_change_replaces_the_whole_list_from_installment_k():
    events = [
        {
            "id": "f1",
            "type": "FixedChargeChange",
            "date": "2026-01-20",
            "fixedCharges": [{"label": "IUSI", "amount": "100.00"}],
        }
    ]
    rows = build_schedule(BASE, events)["rows"]
    assert rows[10]["fixedCharges"] == "395.00"
    assert rows[11]["fixedCharges"] == "100.00"
    empty = dict(events[0], fixedCharges=[])
    assert build_schedule(BASE, [empty])["rows"][11]["fixedCharges"] == "0.00"


def test_keep_installment_validates_with_the_new_rates():
    event = rate_change("r", "2026-01-20", "KEEP_INSTALLMENT_ADJUST_TERM", rate="0.30")
    with pytest.raises(NegativeAmortizationError) as info:
        build_schedule(BASE, [event])
    assert (info.value.rule, info.value.k) == ("ALG.RATE.KEEP_INSTALLMENT", 12)


def test_actual_payment_alone_does_not_change_the_path():
    base = build_schedule(BASE)
    payment = {
        "id": "ap1",
        "type": "ActualPayment",
        "paidDate": "2025-03-05",
        "installmentNumber": 2,
        "total": "4658.47",
    }
    result = build_schedule(BASE, [payment])
    assert [r | {"paid": False} for r in result["rows"]] == base["rows"]
    assert result["rows"][1]["paid"] is True
    assert result["payments"] == [{"eventId": "ap1", "k": 2, "componentDeltas": None}]


def test_trace_exposes_the_state_at_phase_one():
    trace: dict = {}
    events = [prepayment("p1", "2026-01-15", "20000.00"), anchor("b", "2027-01-20", "458028.43")]
    build_schedule(BASE, events, trace=trace)
    assert trace[24].opening == Decimal("458028.43")
    assert trace[24].projected_opening == Decimal("458028.43")
    assert trace[24].term() == 220  # plazo derivado: (k − 1) + remainingTerm
    assert trace[2].term() == 240


@pytest.mark.parametrize(
    "mutate",
    [
        lambda e: e.update(id="Bad Id"),
        lambda e: e.update(extra=1),
        lambda e: e.update(type="Nope"),
        lambda e: e.update(amount="10.5"),
        lambda e: e.update(amount="0.00"),
        lambda e: e.update(mode="X"),
        lambda e: e.update(commission={"kind": "FLAT"}),
        lambda e: e.update(commission={"kind": "PERCENT", "rate": "0.00"}),
        lambda e: e.update(date="2026-13-01"),
        lambda e: e.pop("amount"),
    ],
)
def test_malformed_events_are_invalid_input(mutate):
    event = prepayment("p1", "2026-01-15", "1000.00")
    mutate(event)
    with pytest.raises(InvalidInputError):
        build_schedule(BASE, [event])


def test_duplicate_ids_and_too_many_events_are_invalid():
    twin = [prepayment("p1", "2026-01-15", "1.00"), prepayment("p1", "2026-02-15", "1.00")]
    with pytest.raises(InvalidInputError):
        build_schedule(BASE, twin)
    many = [advance(f"a{n}", "2026-01-15", 1) for n in range(61)]
    with pytest.raises(InvalidInputError):
        build_schedule(BASE, many)


def test_rate_change_requires_a_rate_and_bank_installment_only_with_its_policy():
    base_event = {"id": "r", "type": "RateChange", "date": "2026-01-20"}
    for bad in (
        dict(base_event, policy="RECALC_INSTALLMENT_KEEP_TERM"),
        dict(base_event, policy="BANK_INSTALLMENT", interestRate="0.07"),
        dict(
            base_event,
            policy="RECALC_INSTALLMENT_KEEP_TERM",
            interestRate="0.07",
            bankInstallment="4000.00",
        ),
    ):
        with pytest.raises(InvalidInputError):
            build_schedule(BASE, [bad])


def test_input_terms_and_events_are_not_mutated():
    terms, events = copy.deepcopy(BASE), [prepayment("p1", "2026-01-15", "20000.00")]
    snapshot = copy.deepcopy((terms, events))
    build_schedule(terms, events)
    assert (terms, events) == snapshot

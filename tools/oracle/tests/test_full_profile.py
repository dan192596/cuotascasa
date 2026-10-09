"""Perfil `full`: composición de FORMAT.md §6.4, recetas, matriz de cobertura y determinismo."""

from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from math import ceil

import pytest

from cuotascasa_oracle import GENERATOR_VERSION, dates, generator
from cuotascasa_oracle.cli import main
from cuotascasa_oracle.events import installment_for_date
from cuotascasa_oracle.fixture import dumps, validate_fixture
from cuotascasa_oracle.money import calc_context
from cuotascasa_oracle.schedule import build_schedule, level_installment
from cuotascasa_oracle.terms import parse_terms

SEED = 20261004
EOM = "END_OF_MONTH"


@pytest.fixture(scope="module")
def full():
    """Los 40 fixtures de `full`, indexados por número de préstamo (F01 = 1)."""
    return {n: generator.build_fixture("full", SEED, n) for n in range(1, 41)}


def idx(*numbers):
    return set(numbers)


def having(full, key, value):
    return {n for n, f in full.items() if value in f[key]}


# FORMAT.md §6.4, «Matriz de cobertura que cumple».
FEATURE_MATRIX = {
    "rateChange:RECALC_INSTALLMENT_KEEP_TERM": idx(1, 19, 22, 25, 34),
    "rateChange:KEEP_INSTALLMENT_ADJUST_TERM": idx(2, 20, 23, 26),
    "rateChange:BANK_INSTALLMENT": idx(3, 21, 24, 27),
    "fixedChargeChange": idx(4, 5, 6, 22, 33),
    "prepayment:REDUCE_TERM": idx(7, 9, 19, 24, 28, 29),
    "prepayment:REDUCE_INSTALLMENT": idx(8, 20, 30, 32),
    "commission:FLAT": idx(9, 29, 32),
    "commission:PERCENT": idx(20, 24, 30),
    "payoff": idx(28, 29, 30),
    "advance": idx(10, 11, 12, 23, 33),
    "anchor": idx(13, 14, 15, 21, 25, 26, 28, 31, 32, 34),
    "actualPayment": idx(16, 17, 18, 22, 27, 31, 33),
}
TRAIT_MATRIX = {
    "latePayment": idx(17, 27, 33),
    "explicitKAnchor": idx(14, 26, 32),
    "sameKAnchors": idx(15, 31, 34),
    "zeroRate": idx(35, 36, 37),
    "zeroInsurance": idx(38, 39, 40),
    "roundingProfile:SIMPLE": idx(5, 12, 18, 26, 37),
    "paymentDay:numeric": idx(2, 8, 14, 20, 36, 39),
    "currency:USD": idx(6, 16, 24, 40),
}
SINGLE = {
    "RateChange": idx(1, 2, 3),
    "FixedChargeChange": idx(4, 5, 6),
    "Prepayment": idx(7, 8, 9),
    "AdvanceInstallments": idx(10, 11, 12),
    "ReportedBalance": idx(13, 14, 15),
    "ActualPayment": idx(16, 17, 18),
}
MIXED = idx(*range(19, 29), *range(31, 35))


def test_full_profile_is_registered_with_forty_loans():
    assert generator.PROFILES["full"].count == 40


def test_every_fixture_is_valid_and_matches_an_independent_rerun(full):
    for number, fixture in full.items():
        assert fixture["id"] == f"full-{number:04d}" and fixture["profile"] == "full"
        assert fixture["synthetic"] is True and fixture["generatorVersion"] == GENERATOR_VERSION
        validate_fixture(fixture)
        rerun = build_schedule(fixture["inputs"]["terms"], fixture["inputs"]["events"])
        assert fixture["expected"] == rerun
        assert fixture["features"][0] == "core"


@pytest.mark.parametrize(("feature", "loans"), FEATURE_MATRIX.items())
def test_feature_coverage_matrix(full, feature, loans):
    assert having(full, "features", feature) == loans


@pytest.mark.parametrize(("trait", "loans"), TRAIT_MATRIX.items())
def test_trait_coverage_matrix(full, trait, loans):
    assert having(full, "traits", trait) == loans


def test_every_covered_element_appears_in_at_least_three_fixtures(full):
    for loans in (*FEATURE_MATRIX.values(), *TRAIT_MATRIX.values()):
        assert len(loans) >= 3


def test_event_type_alone_and_mixed_fixtures(full):
    def types(fixture):
        return [e["type"] for e in fixture["inputs"]["events"]]

    for kind, loans in SINGLE.items():
        assert len(loans) >= 3
        for number in loans:
            assert set(types(full[number])) == {kind}
    for number in idx(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 29, 30):
        assert len(full[number]["inputs"]["events"]) == 1
    assert len(full[15]["inputs"]["events"]) == 2  # RB×2: dos anclas del mismo tipo
    for number in MIXED:
        assert len(full[number]["inputs"]["events"]) >= 2
    assert len(MIXED) == 14
    for number in (35, 36, 37, 38, 39, 40):
        assert full[number]["inputs"]["events"] == []


def test_payoff_as_only_event_in_two_fixtures(full):
    for number in (29, 30):
        assert len(full[number]["inputs"]["events"]) == 1
        assert "payoff" in full[number]["features"]


def test_at_least_three_last_row_rounding_cases(full):
    assert len(having(full, "traits", "lastRow")) >= 3


def test_at_least_three_each_of_leap_start_paymentday_numeric_and_both_currencies(full):
    leaps = {
        n for n, f in full.items() if f["inputs"]["terms"]["firstDueDate"].startswith("2028-02-")
    }
    assert {11, 30, 36} <= leaps
    assert len(having(full, "traits", "paymentDay:numeric")) >= 3
    assert len(having(full, "traits", "currency:GTQ")) >= 3
    assert len(having(full, "traits", "currency:USD")) >= 3


def test_composition_table(full):
    fha = ["0.01", "0.0026"]
    # (perfil, seguros, paymentDay, moneda, cargos) de FORMAT.md §6.4.
    table = {
        1: ("FHA_GT_V1", fha, EOM, "GTQ", 2),
        2: ("FHA_GT_V1", fha, 15, "GTQ", 2),
        5: ("SIMPLE", fha, EOM, "GTQ", 3),
        6: ("FHA_GT_V1", fha, EOM, "USD", 1),
        8: ("FHA_GT_V1", fha, 30, "GTQ", 2),
        12: ("SIMPLE", [], EOM, "GTQ", 1),
        14: ("FHA_GT_V1", fha, 31, "GTQ", 2),
        16: ("FHA_GT_V1", fha, EOM, "USD", 2),
        18: ("SIMPLE", fha, EOM, "GTQ", 2),
        20: ("FHA_GT_V1", fha, 15, "GTQ", 2),
        24: ("FHA_GT_V1", fha, EOM, "USD", 2),
        26: ("SIMPLE", fha, EOM, "GTQ", 2),
        35: ("FHA_GT_V1", [], EOM, "GTQ", 0),
        36: ("FHA_GT_V1", [], 31, "GTQ", 1),
        37: ("SIMPLE", [], EOM, "GTQ", 2),
        38: ("FHA_GT_V1", [], EOM, "GTQ", 2),
        39: ("FHA_GT_V1", [], 30, "GTQ", 0),
        40: ("FHA_GT_V1", [], EOM, "USD", 1),
    }
    for number, (profile, insurance, day, currency, charges) in table.items():
        terms = full[number]["inputs"]["terms"]
        assert terms["roundingProfile"] == profile, number
        assert terms["insuranceRates"] == insurance, number
        assert terms["paymentDay"] == day, number
        assert terms["currency"] == currency, number
        assert len(terms["fixedCharges"]) == charges, number
    # F05: F2 más el cargo futuro «Seguro adicional» que el evento nunca deja regir.
    labels = [c["label"] for c in full[5]["inputs"]["terms"]["fixedCharges"]]
    assert labels == ["IUSI", "Seguro de daños", "Seguro adicional"]


def test_ranges_grid_and_zero_cases(full):
    grid = {f"{0.054 + 0.002 * n:.4f}" for n in range(23)}
    for number, fixture in full.items():
        terms = fixture["inputs"]["terms"]
        principal = Decimal(terms["principal"])
        if terms["currency"] == "GTQ":
            assert Decimal("150000.00") <= principal <= Decimal("2500000.00")
        else:
            assert Decimal("20000.00") <= principal <= Decimal("330000.00")
        assert terms["termMonths"] % 12 == 0 and 60 <= terms["termMonths"] <= 360
        year = int(terms["firstDueDate"][:4])
        assert 2024 <= year <= 2030
        if number in (35, 36, 37):
            assert terms["interestRate"] == "0.0000"
        else:
            assert terms["interestRate"] in grid
        if number in (38, 39, 40):
            assert terms["insuranceRates"] == [] and terms["roundingProfile"] == "FHA_GT_V1"
        assert terms["disbursementDate"].endswith("-01")


def test_end_of_month_and_leap_year_starts_are_present(full):
    eom = having(full, "traits", "paymentDay:EOM")
    assert len(eom) >= 20
    for number in (11, 30, 36):
        assert full[number]["inputs"]["terms"]["firstDueDate"].startswith("2028-02-")


def _nominal_k(fixture, event):
    terms = parse_terms(fixture["inputs"]["terms"])
    if event["type"] == "ActualPayment":
        return event["installmentNumber"]
    when = date.fromisoformat(event["date"])
    return installment_for_date(terms, when)


def test_event_placement_follows_the_k_rules(full):
    for number, fixture in full.items():
        events = fixture["inputs"]["events"]
        if not events:
            continue
        terms = fixture["inputs"]["terms"]
        ks = sorted({_nominal_k(fixture, e) for e in events})
        assert 6 <= ks[0] <= min(48, terms["termMonths"] - 36), number
        gaps = [b - a for a, b in zip(ks, ks[1:], strict=False)]
        if gaps:
            assert 6 <= gaps[0] <= 12, number
        if len(gaps) == 2:
            assert 1 <= gaps[1] <= 12, number
        assert [e["id"] for e in events] == [f"ev-{n:02d}" for n in range(1, len(events) + 1)]
        # Cada evento cae en una cuota que existe y que no es la última del calendario.
        last = len(fixture["expected"]["rows"])
        if "payoff" not in fixture["features"]:
            assert max(ks) < last, number


def test_date_offsets_and_installment_numbers(full):
    for fixture in full.values():
        terms = parse_terms(fixture["inputs"]["terms"])
        for event in fixture["inputs"]["events"]:
            if event["type"] == "ActualPayment":
                k = event["installmentNumber"]
                due = dates.due_date(terms.first_due_date, terms.payment_day, k)
                delta = (date.fromisoformat(event["paidDate"]) - due).days
                assert -5 <= delta <= 20
                continue
            k = installment_for_date(terms, date.fromisoformat(event["date"]))
            due = dates.due_date(terms.first_due_date, terms.payment_day, k)
            assert 0 <= (due - date.fromisoformat(event["date"])).days <= 20


def test_prepayment_recipes(full):
    for number, fixture in full.items():
        principal_cents = int(Decimal(fixture["inputs"]["terms"]["principal"]) * 100)
        currency = fixture["inputs"]["terms"]["currency"]
        for event in fixture["inputs"]["events"]:
            if event["type"] != "Prepayment":
                continue
            amount = Decimal(event["amount"])
            if number in (28, 29, 30):
                assert amount == Decimal(fixture["inputs"]["terms"]["principal"])
            else:
                cents = int(amount * 100)
                assert ceil(principal_cents / 100) <= cents <= principal_cents // 5
            commission = event.get("commission")
            if commission and commission["kind"] == "FLAT":
                low, high = (100, 1500) if currency == "GTQ" else (15, 200)
                assert low <= Decimal(commission["amount"]) <= high
            if commission and commission["kind"] == "PERCENT":
                assert commission["rate"] in ("0.01", "0.02", "0.03")
    assert [e["mode"] for e in full[28]["inputs"]["events"] if e["type"] == "Prepayment"] == [
        "REDUCE_TERM"
    ]


def test_advance_counts(full):
    counts = {
        n: [e["count"] for e in full[n]["inputs"]["events"] if "count" in e] for n in (10, 11, 12)
    }
    assert counts == {10: [6], 11: [1], 12: [12]}
    for number in (23, 33):
        (count,) = [e["count"] for e in full[number]["inputs"]["events"] if "count" in e]
        assert 1 <= count <= 12


def test_rate_change_recipes(full):
    grid = {f"{0.054 + 0.002 * n:.4f}" for n in range(23)}
    for number in (1, 2, 3, 19, 20, 21, 22, 23, 24, 25, 26, 27, 34):
        fixture = full[number]
        previous = Decimal(fixture["inputs"]["terms"]["interestRate"])
        for event in fixture["inputs"]["events"]:
            if event["type"] != "RateChange":
                continue
            assert "insuranceRates" not in event
            new = Decimal(event["interestRate"])
            assert abs(new - previous) in (Decimal("0.0020"), Decimal("0.0040"))
            assert event["interestRate"] in grid
            assert ("bankInstallment" in event) == (event["policy"] == "BANK_INSTALLMENT")
            previous = new


def test_bank_installment_is_the_new_level_plus_up_to_fifty(full):
    for number in (3, 21, 24, 27):
        fixture = full[number]
        events = fixture["inputs"]["events"]
        (position,) = [n for n, e in enumerate(events) if e.get("policy") == "BANK_INSTALLMENT"]
        event = events[position]
        trace: dict = {}
        build_schedule(fixture["inputs"]["terms"], events[:position], trace=trace)
        terms = parse_terms(fixture["inputs"]["terms"])
        k = installment_for_date(terms, date.fromisoformat(event["date"]))
        snapshot = trace[k]
        f = sum(terms.insurance_rates, Decimal(0))
        with calc_context():
            level = level_installment(
                snapshot.opening, Decimal(event["interestRate"]) + f, snapshot.term() - (k - 1)
            )
        extra = Decimal(event["bankInstallment"]) - level
        assert 0 <= extra <= 50, number


def test_anchor_recipes(full):
    for number in (13, 14, 15, 21, 25, 26, 28, 31, 32, 34):
        fixture = full[number]
        for anchor in fixture["expected"]["anchors"]:
            delta = Decimal(anchor["realDelta"])
            assert -500 <= delta <= 500, number
    for number in (14, 26, 32):
        terms = parse_terms(full[number]["inputs"]["terms"])
        (event,) = [e for e in full[number]["inputs"]["events"] if e["type"] == "ReportedBalance"]
        k_date = installment_for_date(terms, date.fromisoformat(event["date"]))
        assert event["installmentNumber"] == k_date + 1
    for number in (15, 31, 34):
        anchors = [e for e in full[number]["inputs"]["events"] if e["type"] == "ReportedBalance"]
        assert len(anchors) == 2 and anchors[0]["date"] != anchors[1]["date"]
        assert len({a["k"] for a in full[number]["expected"]["anchors"]}) == 1
    for number in (13, 21, 25, 28, 31, 34, 15):
        assert all(
            "installmentNumber" not in e
            for e in full[number]["inputs"]["events"]
            if e["type"] == "ReportedBalance"
        )


def test_actual_payment_recipes(full):
    for number in (16, 17, 18, 22, 27, 31, 33):
        fixture = full[number]
        rows = fixture["expected"]["rows"]
        for event, payment in zip(
            [e for e in fixture["inputs"]["events"] if e["type"] == "ActualPayment"],
            fixture["expected"]["payments"],
            strict=True,
        ):
            row = rows[event["installmentNumber"] - 1]
            assert row["paid"] is True and payment["k"] == row["k"]
            breakdown = event.get("breakdown")
            if breakdown:
                for name in ("capital", "interest", "insurance", "fixedCharges"):
                    assert 0 <= Decimal(payment["componentDeltas"][name]) <= 5
                assert Decimal(event["total"]) == sum(
                    (Decimal(v) for v in breakdown.values()), Decimal(0)
                )
            else:
                assert payment["componentDeltas"] is None
                assert 0 <= Decimal(event["total"]) - Decimal(row["total"]) <= 5
    late = lambda e: date.fromisoformat(e["paidDate"])  # noqa: E731
    for number in (17, 27, 33):
        terms = parse_terms(full[number]["inputs"]["terms"])
        (event,) = [e for e in full[number]["inputs"]["events"] if e["type"] == "ActualPayment"]
        due = dates.due_date(terms.first_due_date, terms.payment_day, event["installmentNumber"])
        assert due < late(event) <= due + timedelta(days=20)
    for number in (16, 18, 22, 31):
        terms = parse_terms(full[number]["inputs"]["terms"])
        for event in (e for e in full[number]["inputs"]["events"] if e["type"] == "ActualPayment"):
            due = dates.due_date(
                terms.first_due_date, terms.payment_day, event["installmentNumber"]
            )
            assert due - timedelta(days=5) <= late(event) <= due


def test_fixed_charge_change_recipes(full):
    quita = full[4]["inputs"]["events"][0]
    iusi = full[4]["inputs"]["terms"]["fixedCharges"][0]
    assert quita["fixedCharges"] == [{"label": "IUSI", "amount": iusi["amount"]}]
    agrega = full[6]["inputs"]["events"][0]
    assert [c["label"] for c in agrega["fixedCharges"]] == ["IUSI", "Seguro de daños"]
    assert (
        agrega["fixedCharges"][0]["amount"]
        == full[6]["inputs"]["terms"]["fixedCharges"][0]["amount"]
    )
    futuro = full[5]["inputs"]["events"][0]
    assert [c["label"] for c in futuro["fixedCharges"]] == ["IUSI", "Seguro de daños"]
    terms = parse_terms(full[5]["inputs"]["terms"])
    k = installment_for_date(terms, date.fromisoformat(futuro["date"]))
    extra = full[5]["inputs"]["terms"]["fixedCharges"][2]
    assert (
        extra["effectiveFrom"]
        == dates.due_date(terms.first_due_date, terms.payment_day, k + 6).isoformat()
    )
    # El cargo futuro nunca rige: ninguna fila lo suma.
    amounts = {c["amount"] for c in futuro["fixedCharges"]}
    after = Decimal(0) + sum(Decimal(a) for a in amounts)
    for row in full[5]["expected"]["rows"][k - 1 : k + 12]:
        assert Decimal(row["fixedCharges"]) == after
    for number in (22, 33):
        names = [
            c["label"]
            for c in next(
                e for e in full[number]["inputs"]["events"] if e["type"] == "FixedChargeChange"
            )["fixedCharges"]
        ]
        assert names == ["IUSI", "Seguro de daños"]


def test_generation_is_deterministic_and_does_not_touch_core(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    generator.generate("full", SEED, a)
    generator.generate("core", SEED, a)
    generator.generate("full", SEED, b)
    full_names = [f"full-{n:04d}.json" for n in range(1, 41)]
    assert sorted(p.name for p in b.iterdir()) == [*full_names, "manifest.json"]
    for name in full_names:
        assert (a / name).read_bytes() == (b / name).read_bytes()
    only_core = tmp_path / "c"
    generator.generate("core", SEED, only_core)
    for n in range(1, 16):
        assert (a / f"core-{n:04d}.json").read_bytes() == (
            only_core / f"core-{n:04d}.json"
        ).read_bytes()
    manifest = json.loads((a / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["profiles"]["full"] == {
        "count": 40,
        "generatorVersion": GENERATOR_VERSION,
        "seed": SEED,
    }
    assert (a / "full-0001.json").read_text(encoding="utf-8") == dumps(
        json.loads((a / "full-0001.json").read_text(encoding="utf-8"))
    )


def test_cli_generate_full_and_other_seed_differs(tmp_path):
    assert main(["generate", "--profile", "full", "--seed", "7", "--out", str(tmp_path / "x")]) == 0
    assert main(["generate", "--profile", "full", "--seed", "8", "--out", str(tmp_path / "y")]) == 0
    assert (tmp_path / "x" / "full-0013.json").read_bytes() != (
        tmp_path / "y" / "full-0013.json"
    ).read_bytes()


@pytest.mark.parametrize("seed", [1, 7, 99, 4294967295])
def test_other_seeds_build_valid_fixtures_with_the_same_matrix(seed):
    for number in range(1, 41):
        fixture = generator.build_fixture("full", seed, number)
        validate_fixture(fixture)
        for feature, loans in FEATURE_MATRIX.items():
            assert (feature in fixture["features"]) == (number in loans), (seed, number, feature)
        for trait, loans in TRAIT_MATRIX.items():
            assert (trait in fixture["traits"]) == (number in loans), (seed, number, trait)


def _tamper_cases():
    return [
        ("features", lambda f: f["features"].append("advance")),
        ("traits", lambda f: f["traits"].append("latePayment")),
        ("anchor id", lambda f: f["expected"]["anchors"][0].update(eventId="ev-99")),
        ("anchor delta", lambda f: f["expected"]["anchors"][0].update(realDelta="-0.00")),
        ("anchor missing", lambda f: f["expected"]["anchors"].clear()),
        ("event field", lambda f: f["inputs"]["events"][0].update(balance="1.5")),
        ("chain", lambda f: f["expected"]["rows"][40].update(opening="1.00")),
        ("payments", lambda f: f["expected"]["payments"].append({})),
    ]


@pytest.mark.parametrize(("name", "mutate"), _tamper_cases(), ids=[n for n, _ in _tamper_cases()])
def test_validator_rejects_tampered_event_fixtures(full, name, mutate):
    import copy

    broken = copy.deepcopy(full[13])  # RB(fecha) en k₁
    mutate(broken)
    with pytest.raises(ValueError):
        validate_fixture(broken)


def test_validator_accepts_an_anchor_that_breaks_the_opening_chain(full):
    # F13 re-ancla: la apertura de esa cuota no es closing − prepayment de la anterior.
    fixture = full[13]
    k = fixture["expected"]["anchors"][0]["k"]
    rows = fixture["expected"]["rows"]
    chained = Decimal(rows[k - 2]["closing"]) - Decimal(rows[k - 2]["prepayment"])
    assert Decimal(rows[k - 1]["opening"]) != chained
    validate_fixture(fixture)


def test_payoff_fixture_closes_with_prepayment_and_is_validated(full):
    fixture = full[29]
    last = fixture["expected"]["rows"][-1]
    assert last["prepayment"] == last["closing"] and Decimal(last["prepayment"]) > 0
    assert Decimal(last["commission"]) > 0
    validate_fixture(fixture)
    import copy

    broken = copy.deepcopy(fixture)
    broken["expected"]["rows"][-1]["prepayment"] = "0.00"
    with pytest.raises(ValueError):
        validate_fixture(broken)


def test_compare_round_trips_a_full_fixture_through_the_private_schema(full, tmp_path, capsys):
    from cuotascasa_oracle.fixture import ROW_FIELDS

    fixture = full[31]  # dos anclas en la misma k y un pago con desglose
    (tmp_path / "a-terms.json").write_text(json.dumps(fixture["inputs"]), encoding="utf-8")
    lines = [",".join(ROW_FIELDS)]
    for row in fixture["expected"]["rows"]:
        cells = []
        for name in ROW_FIELDS:
            value = row[name]
            if name == "insuranceComponents":
                value = ";".join(value)
            elif name == "paid":
                value = "true" if value else "false"
            cells.append(str(value))
        lines.append(",".join(cells))
    (tmp_path / "a-expected.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    argv = [
        "compare",
        "--terms",
        str(tmp_path / "a-terms.json"),
        "--expected",
        str(tmp_path / "a-expected.csv"),
    ]
    assert main(argv) == 0
    assert capsys.readouterr().out == "allRowsMatched: yes\nmismatchedRows: 0\nmaxAbsDiff: 0.00\n"


def test_actual_payment_after_the_last_row_is_rejected_not_an_index_error():
    from cuotascasa_oracle import full_profile

    ctx = full_profile._Context(
        generator.rng("full", 1, 1), generator.build_fixture("full", 1, 35)["inputs"]["terms"]
    )
    with pytest.raises(full_profile._Reject):
        full_profile._actual_payment(ctx, 5, [], "ev-01", ("AP", False, False))


def test_validator_fails_cleanly_on_an_installment_number_past_the_rows(full):
    import copy

    broken = copy.deepcopy(full[16])
    broken["inputs"]["events"][0]["installmentNumber"] = 5000
    with pytest.raises(ValueError):
        validate_fixture(broken)

"""Archivo de fixture (FORMAT.md §3-§4): serialización, rasgos y validador estructural."""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal

from .errors import InvalidInputError
from .events import installment_for_date, parse_events
from .money import ZERO, calc_context
from .terms import parse_terms

ROW_FIELDS = (
    "k",
    "dueDate",
    "opening",
    "level",
    "interest",
    "insurance",
    "insuranceComponents",
    "capital",
    "fixedCharges",
    "prepayment",
    "commission",
    "total",
    "closing",
    "paid",
)
SUMMARY_FIELDS = (
    "installments",
    "endDate",
    "totalInterest",
    "totalInsurance",
    "totalCapital",
    "totalFixedCharges",
    "totalPrepayments",
    "totalCommissions",
    "totalPaid",
)
FEATURES = (
    "core",
    "rateChange:RECALC_INSTALLMENT_KEEP_TERM",
    "rateChange:KEEP_INSTALLMENT_ADJUST_TERM",
    "rateChange:BANK_INSTALLMENT",
    "fixedChargeChange",
    "prepayment:REDUCE_TERM",
    "prepayment:REDUCE_INSTALLMENT",
    "commission:FLAT",
    "commission:PERCENT",
    "payoff",
    "advance",
    "anchor",
    "actualPayment",
)
TRAITS = (
    "roundingProfile:FHA_GT_V1",
    "roundingProfile:SIMPLE",
    "paymentDay:numeric",
    "paymentDay:EOM",
    "currency:GTQ",
    "currency:USD",
    "lastRow",
    "latePayment",
    "explicitKAnchor",
    "sameKAnchors",
    "zeroRate",
    "zeroInsurance",
)
_AMOUNT = re.compile(r"(0|[1-9][0-9]*)\.[0-9]{2}")
_SIGNED = re.compile(r"-?(0|[1-9][0-9]*)\.[0-9]{2}")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_ID = re.compile(r"(core|full)-[0-9]{4}")
_TOP = {
    "synthetic",
    "id",
    "profile",
    "seed",
    "loanIndex",
    "generatorVersion",
    "features",
    "traits",
    "inputs",
    "expected",
}


def dumps(obj: object) -> str:
    """FORMAT.md §3.2."""
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def has_last_row_trait(rows: list[dict], term_months: int) -> bool:
    """Rasgo `lastRow` (§4.2): total != level + fixedCharges, o termina antes de termMonths."""
    last = rows[-1]
    with calc_context():
        differs = Decimal(last["total"]) != Decimal(last["level"]) + Decimal(last["fixedCharges"])
    return differs or len(rows) < term_months


def compute_features(events: list[dict], rows: list[dict]) -> list[str]:
    """Etiquetas de función (§4.1), en el orden de la lista cerrada."""
    found = {"core"}
    for event in events:
        kind = event["type"]
        if kind == "RateChange":
            found.add(f"rateChange:{event['policy']}")
        elif kind == "FixedChargeChange":
            found.add("fixedChargeChange")
        elif kind == "Prepayment":
            found.add(f"prepayment:{event['mode']}")
            if "commission" in event:
                found.add(f"commission:{event['commission']['kind']}")
        elif kind == "AdvanceInstallments":
            found.add("advance")
        elif kind == "ReportedBalance":
            found.add("anchor")
        elif kind == "ActualPayment":
            found.add("actualPayment")
    last = rows[-1]
    with calc_context():
        if Decimal(last["prepayment"]) > 0 and last["prepayment"] == last["closing"]:
            found.add("payoff")
    return sorted(found, key=FEATURES.index)


def compute_traits(terms: dict, rows: list[dict], events: list[dict] | None = None) -> list[str]:
    """Rasgos (§4.2), en el orden de la lista cerrada."""
    events = events or []
    traits = [
        f"roundingProfile:{terms['roundingProfile']}",
        "paymentDay:EOM" if terms["paymentDay"] == "END_OF_MONTH" else "paymentDay:numeric",
        f"currency:{terms['currency']}",
    ]
    if has_last_row_trait(rows, terms["termMonths"]):
        traits.append("lastRow")
    parsed = parse_terms(terms)
    effective = []
    for event in events:
        if event["type"] == "ActualPayment":
            if event["paidDate"] > rows[event["installmentNumber"] - 1]["dueDate"]:
                traits.append("latePayment")
        elif event["type"] == "ReportedBalance":
            by_date = installment_for_date(parsed, date.fromisoformat(event["date"]))
            effective.append(event.get("installmentNumber", by_date))
            if event.get("installmentNumber", by_date) != by_date:
                traits.append("explicitKAnchor")
    if len(effective) != len(set(effective)):
        traits.append("sameKAnchors")
    with calc_context():
        interest = Decimal(terms["interestRate"])
        insurance = sum((Decimal(rate) for rate in terms["insuranceRates"]), ZERO)
    if interest == 0 and insurance == 0:
        traits.append("zeroRate")
    elif terms["roundingProfile"] == "FHA_GT_V1" and insurance == 0:
        traits.append("zeroInsurance")
    return sorted(set(traits), key=TRAITS.index)


def _fail(message: str) -> None:
    raise ValueError(message)


def _check_amount(value: object, where: str) -> Decimal:
    if not isinstance(value, str) or not _AMOUNT.fullmatch(value):
        _fail(f"{where}: monto inválido")
    return Decimal(value)


def validate_fixture(fixture: object) -> None:
    """Valida un fixture contra FORMAT.md §3-§4 y su aritmética. Lanza ValueError."""
    if not isinstance(fixture, dict) or set(fixture) != _TOP:
        _fail("campos de primer nivel")
    if fixture["synthetic"] is not True:
        _fail("synthetic debe ser true")
    index = fixture["loanIndex"]
    seed = fixture["seed"]
    for name, value in (("loanIndex", index), ("seed", seed), ("v", fixture["generatorVersion"])):
        if isinstance(value, bool) or not isinstance(value, int):
            _fail(f"{name}: debe ser entero")
    if not 0 <= seed <= 4294967295 or index < 1 or fixture["generatorVersion"] < 1:
        _fail("seed, loanIndex o generatorVersion fuera de rango")
    if fixture["profile"] not in ("core", "full"):
        _fail("perfil")
    if not _ID.fullmatch(fixture["id"]) or fixture["id"] != f"{fixture['profile']}-{index:04d}":
        _fail("id")
    features, traits = fixture["features"], fixture["traits"]
    if "core" not in features or features != sorted(set(features), key=FEATURES.index):
        _fail("features")
    if traits != sorted(set(traits), key=TRAITS.index):
        _fail("traits")
    for group in (TRAITS[0:2], TRAITS[2:4], TRAITS[4:6]):
        if sum(trait in traits for trait in group) != 1:
            _fail("traits: exactamente una por grupo")
    inputs, expected = fixture["inputs"], fixture["expected"]
    if set(inputs) != {"terms", "events"} or not isinstance(inputs["events"], list):
        _fail("inputs")
    try:
        parse_terms(inputs["terms"])
        parse_events(inputs["events"])
    except InvalidInputError as error:
        _fail(f"inputs: {error}")
    if set(expected) != {"rows", "anchors", "payments", "summary"}:
        _fail("expected")
    rows = expected["rows"]
    if not rows:
        _fail("rows vacío")
    anchors = _validate_outputs(inputs["events"], expected)
    with calc_context():
        _validate_rows(rows, anchors)
        _validate_summary(rows, expected["summary"])
    if ("lastRow" in traits) != has_last_row_trait(rows, inputs["terms"]["termMonths"]):
        _fail("rasgo lastRow inconsistente")
    if traits != compute_traits(inputs["terms"], rows, inputs["events"]):
        _fail("traits inconsistentes con las condiciones y los eventos")
    if features != compute_features(inputs["events"], rows):
        _fail("features inconsistentes con los eventos")


def _is_difference(value: object) -> bool:
    """Diferencia de §1: monto con signo opcional, nunca `-0.00`."""
    return isinstance(value, str) and value != "-0.00" and _SIGNED.fullmatch(value) is not None


def _validate_outputs(events: list[dict], expected: dict) -> set[int]:
    """`anchors` y `payments` (§3.5): una entrada por evento, en el orden de `inputs.events`.
    Devuelve las cuotas re-ancladas."""
    anchors = [e["id"] for e in events if e["type"] == "ReportedBalance"]
    payments = [e["id"] for e in events if e["type"] == "ActualPayment"]
    if [a.get("eventId") for a in expected["anchors"]] != anchors:
        _fail("anchors")
    if [p.get("eventId") for p in expected["payments"]] != payments:
        _fail("payments")
    for anchor in expected["anchors"]:
        if set(anchor) != {"eventId", "k", "realDelta"} or not _is_difference(anchor["realDelta"]):
            _fail("anchors: campos")
    for payment in expected["payments"]:
        deltas = payment.get("componentDeltas")
        if set(payment) != {"eventId", "k", "componentDeltas"}:
            _fail("payments: campos")
        if deltas is not None and (
            set(deltas) != {"capital", "interest", "insurance", "fixedCharges"}
            or not all(_is_difference(v) for v in deltas.values())
        ):
            _fail("payments: componentDeltas")
    return {anchor["k"] for anchor in expected["anchors"]}


def _validate_rows(rows: list[dict], anchored: set[int]) -> None:
    previous = None
    for position, row in enumerate(rows, start=1):
        if set(row) != set(ROW_FIELDS) or row["k"] != position:
            _fail(f"fila {position}: campos o k")
        if not isinstance(row["paid"], bool) or not _DATE.fullmatch(row["dueDate"]):
            _fail(f"fila {position}: paid o dueDate")
        amounts = {
            name: _check_amount(row[name], f"fila {position}.{name}")
            for name in ROW_FIELDS
            if name not in ("k", "dueDate", "insuranceComponents", "paid")
        }
        parts = [
            _check_amount(part, f"fila {position}.insuranceComponents")
            for part in row["insuranceComponents"]
        ]
        if parts and sum(parts, ZERO) != amounts["insurance"]:
            _fail(f"fila {position}: insurance != suma de componentes")
        total = (
            amounts["capital"]
            + amounts["interest"]
            + amounts["insurance"]
            + amounts["fixedCharges"]
        )
        if total != amounts["total"]:
            _fail(f"fila {position}: total")
        if amounts["opening"] - amounts["capital"] != amounts["closing"]:
            _fail(f"fila {position}: closing")
        if (
            previous is not None
            and position not in anchored
            and previous["closing"] - previous["prepayment"] != amounts["opening"]
        ):
            _fail(f"fila {position}: opening no encadena")
        previous = amounts
    if previous["closing"] - previous["prepayment"] != 0:
        _fail("la última fila no liquida el saldo")


def _validate_summary(rows: list[dict], summary: dict) -> None:
    if set(summary) != set(SUMMARY_FIELDS):
        _fail("summary")

    def total(field: str) -> Decimal:
        return sum((Decimal(row[field]) for row in rows), ZERO)

    expected = {
        "totalInterest": total("interest"),
        "totalInsurance": total("insurance"),
        "totalCapital": total("capital"),
        "totalFixedCharges": total("fixedCharges"),
        "totalPrepayments": total("prepayment"),
        "totalCommissions": total("commission"),
        "totalPaid": total("total") + total("prepayment") + total("commission"),
    }
    if summary["installments"] != len(rows) or summary["endDate"] != rows[-1]["dueDate"]:
        _fail("summary: installments o endDate")
    for name, value in expected.items():
        if _check_amount(summary[name], f"summary.{name}") != value:
            _fail(f"summary.{name}")

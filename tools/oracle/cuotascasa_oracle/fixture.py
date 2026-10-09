"""Archivo de fixture (FORMAT.md §3-§4): serialización, rasgos y validador estructural."""

from __future__ import annotations

import json
import re
from decimal import Decimal

from .errors import InvalidInputError
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


def compute_traits(terms: dict, rows: list[dict]) -> list[str]:
    """Rasgos de un fixture sin eventos, en el orden de §4.2."""
    traits = [
        f"roundingProfile:{terms['roundingProfile']}",
        "paymentDay:EOM" if terms["paymentDay"] == "END_OF_MONTH" else "paymentDay:numeric",
        f"currency:{terms['currency']}",
    ]
    if has_last_row_trait(rows, terms["termMonths"]):
        traits.append("lastRow")
    with calc_context():
        interest = Decimal(terms["interestRate"])
        insurance = sum((Decimal(rate) for rate in terms["insuranceRates"]), ZERO)
    if interest == 0 and insurance == 0:
        traits.append("zeroRate")
    elif terms["roundingProfile"] == "FHA_GT_V1" and insurance == 0:
        traits.append("zeroInsurance")
    # El grupo 1-2/3-4/5-6 va primero y el resto sigue el orden de §4.2.
    traits.sort(key=TRAITS.index)
    return traits


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
    except InvalidInputError as error:
        _fail(f"inputs.terms: {error}")
    if set(expected) != {"rows", "anchors", "payments", "summary"}:
        _fail("expected")
    rows = expected["rows"]
    if not rows:
        _fail("rows vacío")
    with calc_context():
        _validate_rows(rows)
        _validate_summary(rows, expected["summary"])
    if not inputs["events"] and (expected["anchors"] or expected["payments"]):
        _fail("anchors y payments deben estar vacíos sin eventos")
    if ("lastRow" in traits) != has_last_row_trait(rows, inputs["terms"]["termMonths"]):
        _fail("rasgo lastRow inconsistente")
    if traits != compute_traits(inputs["terms"], rows) and not inputs["events"]:
        _fail("traits inconsistentes con las condiciones")


def _validate_rows(rows: list[dict]) -> None:
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
            and previous["closing"] - previous["prepayment"] != amounts["opening"]
        ):
            _fail(f"fila {position}: opening no encadena")
        previous = amounts
    if previous["closing"] != 0:
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

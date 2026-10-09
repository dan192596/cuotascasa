"""Eventos reales (FORMAT.md §3.4): validación, cuota de aplicación y orden total.

[ALG.EVENTS.ANCHOR] asocia cada evento a una cuota `k`; [ALG.EVENTS.ORDER] fija la clave
`(k, fase, fecha, rangoDeTipo, id)`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from . import dates
from .errors import InvalidInputError
from .terms import Terms, parse_amount, parse_rate

POLICIES = (
    "RECALC_INSTALLMENT_KEEP_TERM",
    "KEEP_INSTALLMENT_ADJUST_TERM",
    "BANK_INSTALLMENT",
)
MODES = ("REDUCE_TERM", "REDUCE_INSTALLMENT")
MAX_EVENTS = 60
MAX_INSTALLMENT = 1200
_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}", re.ASCII)

# (fase, rangoDeTipo) de [ALG.EVENTS.ORDER].
ORDER = {
    "ReportedBalance": (0, 0),
    "RateChange": (1, 0),
    "FixedChargeChange": (1, 1),
    "Prepayment": (3, 0),
    "AdvanceInstallments": (3, 1),
    "ActualPayment": (4, 0),
}
_DATE_FIELD = {"ActualPayment": "paidDate"}
_FIELDS = {
    "RateChange": (
        {"id", "type", "date", "policy"},
        {"interestRate", "insuranceRates", "bankInstallment"},
    ),
    "FixedChargeChange": ({"id", "type", "date", "fixedCharges"}, set()),
    "Prepayment": ({"id", "type", "date", "amount", "mode"}, {"commission"}),
    "AdvanceInstallments": ({"id", "type", "date", "count"}, set()),
    "ReportedBalance": ({"id", "type", "date", "balance"}, {"installmentNumber"}),
    "ActualPayment": ({"id", "type", "paidDate", "total"}, {"installmentNumber", "breakdown"}),
}
_BREAKDOWN = ("capital", "interest", "insurance", "fixedCharges")


@dataclass(frozen=True)
class Event:
    """Evento validado. `data` conserva los campos ya convertidos (Decimal, tuplas)."""

    id: str
    type: str
    date: date
    installment_number: int | None
    data: dict


@dataclass(frozen=True)
class Planned:
    """Evento con su cuota efectiva y su clave de orden."""

    event: Event
    k: int

    @property
    def phase(self) -> int:
        return ORDER[self.event.type][0]

    @property
    def key(self) -> tuple:
        phase, rank = ORDER[self.event.type]
        return (self.k, phase, self.event.date, rank, self.event.id)


def _bad(message: str) -> InvalidInputError:
    return InvalidInputError("ALG.EVENTS", message)


def _rates(value: object) -> tuple[Decimal, ...]:
    if not isinstance(value, list) or len(value) > 10:
        raise _bad("insuranceRates")
    return tuple(parse_rate(item) for item in value)


def _charges(value: object) -> tuple[tuple[str, Decimal], ...]:
    if not isinstance(value, list) or len(value) > 20:
        raise _bad("fixedCharges")
    out = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"label", "amount"}:
            raise _bad("cargo fijo")
        label = item["label"]
        if not isinstance(label, str) or not 1 <= len(label) <= 60 or label != label.strip():
            raise _bad("etiqueta")
        out.append((label, parse_amount(item["amount"])))
    return tuple(out)


def _commission(value: object) -> tuple[str, Decimal]:
    if not isinstance(value, dict):
        raise _bad("commission")
    if set(value) == {"kind", "amount"} and value["kind"] == "FLAT":
        return "FLAT", parse_amount(value["amount"], positive=True)
    if set(value) == {"kind", "rate"} and value["kind"] == "PERCENT":
        rate = parse_rate(value["rate"])
        if rate <= 0:
            raise _bad("commission")
        return "PERCENT", rate
    raise _bad("commission")


def _parse_data(kind: str, raw: dict) -> dict:
    if kind == "RateChange":
        if raw["policy"] not in POLICIES:
            raise _bad("policy")
        if "interestRate" not in raw and "insuranceRates" not in raw:
            raise _bad("RateChange sin tasas")
        bank = raw["policy"] == "BANK_INSTALLMENT"
        if bank != ("bankInstallment" in raw):
            raise _bad("bankInstallment")
        return {
            "policy": raw["policy"],
            "interest": parse_rate(raw["interestRate"]) if "interestRate" in raw else None,
            "insurance": _rates(raw["insuranceRates"]) if "insuranceRates" in raw else None,
            "bank": parse_amount(raw["bankInstallment"], positive=True) if bank else None,
        }
    if kind == "FixedChargeChange":
        return {"charges": _charges(raw["fixedCharges"])}
    if kind == "Prepayment":
        if raw["mode"] not in MODES:
            raise _bad("mode")
        return {
            "amount": parse_amount(raw["amount"], positive=True),
            "mode": raw["mode"],
            "commission": _commission(raw["commission"]) if "commission" in raw else None,
        }
    if kind == "AdvanceInstallments":
        count = raw["count"]
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 1200:
            raise _bad("count")
        return {"count": count}
    if kind == "ReportedBalance":
        return {"balance": parse_amount(raw["balance"])}
    breakdown = None
    if "breakdown" in raw:
        if not isinstance(raw["breakdown"], dict) or set(raw["breakdown"]) != set(_BREAKDOWN):
            raise _bad("breakdown")
        breakdown = {name: parse_amount(raw["breakdown"][name]) for name in _BREAKDOWN}
    return {"total": parse_amount(raw["total"], positive=True), "breakdown": breakdown}


def parse_events(raw: object) -> list[Event]:
    """Valida la lista `inputs.events`; lanza InvalidInputError."""
    if not isinstance(raw, list) or len(raw) > MAX_EVENTS:
        raise _bad("lista de eventos")
    events: list[Event] = []
    seen: set[str] = set()
    for item in raw:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("type"), str)
            or item["type"] not in ORDER
        ):
            raise _bad("tipo de evento")
        kind = item["type"]
        required, optional = _FIELDS[kind]
        if kind == "ActualPayment" and "installmentNumber" not in item:
            raise InvalidInputError("ALG.EVENTS.ANCHOR", "ActualPayment sin installmentNumber")
        keys = set(item)
        if not required <= keys or not keys <= required | optional:
            raise _bad("campos de evento")
        if not isinstance(item["id"], str) or not _ID.fullmatch(item["id"]) or item["id"] in seen:
            raise _bad("id de evento")
        seen.add(item["id"])
        number = item.get("installmentNumber")
        if "installmentNumber" in item and (
            isinstance(number, bool) or not isinstance(number, int)
        ):
            raise _bad("installmentNumber")
        events.append(
            Event(
                item["id"],
                kind,
                dates.parse_date(item[_DATE_FIELD.get(kind, "date")]),
                number,
                _parse_data(kind, item),
            )
        )
    return events


def installment_for_date(terms: Terms, when: date) -> int:
    """[ALG.EVENTS.ANCHOR] regla 2: la primera cuota con vencimiento >= la fecha."""
    first = terms.first_due_date
    months = (when.year * 12 + when.month) - (first.year * 12 + first.month)
    k = max(1, months + 1)
    while k > 1 and dates.due_date(first, terms.payment_day, k - 1) >= when:
        k -= 1
    while dates.due_date(first, terms.payment_day, k) < when:
        k += 1
    return k


def plan_events(terms: Terms, events: list[Event]) -> list[Planned]:
    """Cuota efectiva de cada evento y orden total. `installmentNumber < 1` es un error tipado
    con la menor `k` de las que fallan ([ALG.ERRORS], «Varios errores»)."""
    bad = [e.installment_number for e in events if e.installment_number is not None]
    bad = [n for n in bad if not 1 <= n <= MAX_INSTALLMENT]  # FORMAT.md §3.4: 1 a 1200
    if bad:
        raise InvalidInputError("ALG.EVENTS.ANCHOR", "installmentNumber fuera de rango", k=min(bad))
    planned = [
        Planned(
            event,
            event.installment_number
            if event.installment_number is not None
            else installment_for_date(terms, event.date),
        )
        for event in events
    ]
    return sorted(planned, key=lambda item: item.key)

"""Validación de `inputs.terms` según [ALG.TERMS] y los límites de FORMAT.md §3.4."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from . import dates
from .errors import InvalidInputError

TERM_FIELDS = frozenset(
    {
        "principal",
        "termMonths",
        "disbursementDate",
        "firstDueDate",
        "paymentDay",
        "currency",
        "interestRate",
        "insuranceRates",
        "fixedCharges",
        "roundingProfile",
    }
)
CURRENCIES = ("GTQ", "USD")
PROFILES = ("FHA_GT_V1", "SIMPLE")

_AMOUNT = re.compile(r"(0|[1-9][0-9]{0,12})\.[0-9]{2}")
_RATE = re.compile(r"[0-9](\.[0-9]{1,6})?")


@dataclass(frozen=True)
class FixedCharge:
    label: str
    amount: Decimal
    effective_from: date


@dataclass(frozen=True)
class Terms:
    principal: Decimal
    term_months: int
    first_due_date: date
    payment_day: int | str
    interest_rate: Decimal
    insurance_rates: tuple[Decimal, ...]
    fixed_charges: tuple[FixedCharge, ...]
    rounding_profile: str


def _bad(message: str) -> InvalidInputError:
    return InvalidInputError("ALG.TERMS", message)


def parse_amount(value: object, *, positive: bool = False) -> Decimal:
    if not isinstance(value, str) or not _AMOUNT.fullmatch(value):
        raise _bad("monto inválido")
    amount = Decimal(value)
    if positive and amount <= 0:
        raise _bad("el monto debe ser mayor que cero")
    return amount


def parse_rate(value: object) -> Decimal:
    if not isinstance(value, str) or not _RATE.fullmatch(value):
        raise _bad("tasa inválida")
    return Decimal(value)


def _int_in(value: object, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise _bad("entero fuera de rango")
    return value


def _label(value: object) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 60 or value != value.strip():
        raise _bad("etiqueta inválida")
    return value


def parse_terms(raw: object) -> Terms:
    """Valida y convierte; lanza InvalidInputError. Incluye la consistencia de [ALG.DATES]."""
    if not isinstance(raw, dict) or set(raw) != TERM_FIELDS:
        raise _bad("campos de condiciones")
    principal = parse_amount(raw["principal"], positive=True)
    term_months = _int_in(raw["termMonths"], 1, 1200)
    dates.parse_date(raw["disbursementDate"])
    first_due = dates.parse_date(raw["firstDueDate"])
    payment_day = raw["paymentDay"]
    if payment_day != dates.END_OF_MONTH:
        payment_day = _int_in(payment_day, 1, 31)
    if raw["currency"] not in CURRENCIES:
        raise _bad("moneda")
    if raw["roundingProfile"] not in PROFILES:
        raise _bad("perfil de redondeo")
    interest = parse_rate(raw["interestRate"])
    rates_raw = raw["insuranceRates"]
    if not isinstance(rates_raw, list) or len(rates_raw) > 10:
        raise _bad("insuranceRates")
    charges_raw = raw["fixedCharges"]
    if not isinstance(charges_raw, list) or len(charges_raw) > 20:
        raise _bad("fixedCharges")
    charges = []
    for item in charges_raw:
        if not isinstance(item, dict) or set(item) != {"label", "amount", "effectiveFrom"}:
            raise _bad("cargo fijo")
        charges.append(
            FixedCharge(
                _label(item["label"]),
                parse_amount(item["amount"]),
                dates.parse_date(item["effectiveFrom"]),
            )
        )
    dates.check_consistency(first_due, payment_day)
    return Terms(
        principal=principal,
        term_months=term_months,
        first_due_date=first_due,
        payment_day=payment_day,
        interest_rate=interest,
        insurance_rates=tuple(parse_rate(item) for item in rates_raw),
        fixed_charges=tuple(charges),
        rounding_profile=raw["roundingProfile"],
    )

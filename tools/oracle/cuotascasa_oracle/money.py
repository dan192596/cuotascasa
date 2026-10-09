"""Convenciones numéricas de [ALG.CONV] y formato de FORMAT.md §1."""

from __future__ import annotations

import decimal
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Context, Decimal

# FORMAT.md §2: 34 dígitos significativos y ROUND_HALF_EVEN para toda operación.
CONTEXT = Context(prec=34, rounding=ROUND_HALF_EVEN)

_CENT = Decimal("0.01")
ZERO = Decimal("0")


def calc_context():
    """Gestor de contexto que activa el contexto decimal de [ALG.CONV]."""
    return decimal.localcontext(CONTEXT)


def half_up_2(value: Decimal) -> Decimal:
    """HALF_UP_2: único redondeo a centavos, mitad lejos de cero."""
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def fmt_amount(value: Decimal) -> str:
    """Monto con exactamente 2 decimales (FORMAT.md §1)."""
    text = format(value.quantize(_CENT, rounding=ROUND_HALF_UP), "f")
    return "0.00" if text == "-0.00" else text


def fmt_rate(value: Decimal, places: int = 4) -> str:
    """Tasa con un número fijo de decimales, sin exponente."""
    return format(value.quantize(Decimal(1).scaleb(-places)), "f")
